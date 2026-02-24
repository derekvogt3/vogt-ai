import { Dropbox } from 'dropbox';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { documents } from '../schema.js';

// --- Config ---

const EXTRACTABLE_EXTENSIONS = new Set([
  '.pdf', '.docx', '.docm', '.xlsx', '.xls', '.xlsm', '.msg', '.eml', '.txt', '.csv',
]);

const SKIP_EXTENSIONS = new Set([
  // Video/audio
  '.mp4', '.mov', '.mkv', '.wav', '.mp3', '.ogg',
  // Images
  '.png', '.jpg', '.jpeg', '.jfif', '.tif', '.gif', '.psd', '.svg', '.bmp', '.wmf', '.wmz',
  // Firmware/binaries
  '.inst', '.exe', '.bin', '.rom', '.dll', '.sys', '.dmg', '.iso', '.deb', '.asar',
  // CAD/3D models
  '.step', '.stp', '.sldprt', '.sldasm', '.slddrw', '.sldblk', '.drwdot', '.dwg', '.dxf', '.igs',
  // VM images
  '.vmdk', '.vmem', '.vmx', '.vmxf', '.vmsd', '.nvram',
  // Archives
  '.zip', '.rar', '.7z', '.gz',
  // Test data / raw instrument
  '.pcap', '.gps', '.xdb', '.coverage', '.throughput', '.rssi', '.ler', '.gpsthroughput',
  // Config / misc
  '.ini', '.pak', '.cfg', '.conf', '.fmconf', '.nmp', '.sta', '.fm', '.qm',
  '.lnk', '.url', '.bat', '.sh', '.cache', '.log',
  // Programming (not relevant to claim)
  '.py', '.h', '.c', '.cs', '.lib', '.pdb', '.resx', '.manifest', '.csproj', '.sln', '.sdf',
  '.json', '.xml', '.html', '.dtd', '.xsd', '.settings', '.user',
  // Other
  '.kml', '.kmz', '.dat', '.err', '.resources', '.img', '.ntf', '.tmp', '.ans', '.inf',
  '.ds_store', '.lic', '.tns', '.cdd', '.vsd', '.odg', '.xl2', '.xkt',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB cap for first pass

// --- DB + Dropbox setup ---

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Missing DATABASE_URL env var');
    process.exit(1);
  }
  const client = postgres(url);
  return { db: drizzle(client), client };
}

function createDropboxClient(): Dropbox {
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  if (!appKey || !appSecret || !refreshToken) {
    console.error('Missing DROPBOX_APP_KEY, DROPBOX_APP_SECRET, or DROPBOX_REFRESH_TOKEN');
    process.exit(1);
  }
  return new Dropbox({ clientId: appKey, clientSecret: appSecret, refreshToken });
}

// --- Text extraction ---

async function extractPdf(buffer: Buffer): Promise<{ text: string; pageCount?: number }> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  const text = result.text;
  const pageCount = result.total;
  await parser.destroy();
  return { text, pageCount };
}

async function extractDocx(buffer: Buffer): Promise<{ text: string }> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}

async function extractXlsx(buffer: Buffer): Promise<{ text: string }> {
  const ExcelJS = await import('exceljs');
  const WorkbookClass = (ExcelJS as any).default?.Workbook ?? (ExcelJS as any).Workbook;
  const workbook = new WorkbookClass();
  await workbook.xlsx.load(buffer);

  const parts: string[] = [];
  workbook.eachSheet((sheet) => {
    parts.push(`[Sheet: ${sheet.name}]`);
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell((cell) => {
        const val = cell.value;
        if (val !== null && val !== undefined) {
          cells.push(String(val));
        }
      });
      if (cells.length > 0) parts.push(cells.join('\t'));
    });
  });
  return { text: parts.join('\n') };
}

async function extractMsg(buffer: Buffer): Promise<{ text: string }> {
  const { default: MsgReader } = await import('@kenjiuno/msgreader');
  const reader = new MsgReader(buffer);
  const msg = reader.getFileData();

  const parts: string[] = [];
  if (msg.subject) parts.push(`Subject: ${msg.subject}`);
  if (msg.senderName) parts.push(`From: ${msg.senderName}`);
  if (msg.recipients && msg.recipients.length > 0) {
    parts.push(`To: ${msg.recipients.map((r: any) => r.name || r.email).join(', ')}`);
  }
  if (msg.body) parts.push('', msg.body);

  return { text: parts.join('\n') };
}

async function extractEml(buffer: Buffer): Promise<{ text: string }> {
  const { simpleParser } = await import('mailparser');
  const parsed = await simpleParser(buffer);

  const parts: string[] = [];
  if (parsed.subject) parts.push(`Subject: ${parsed.subject}`);
  if (parsed.from?.text) parts.push(`From: ${parsed.from.text}`);
  if (parsed.to) {
    const toText = Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(', ') : parsed.to.text;
    parts.push(`To: ${toText}`);
  }
  if (parsed.date) parts.push(`Date: ${parsed.date.toISOString()}`);
  if (parsed.text) parts.push('', parsed.text);

  return { text: parts.join('\n') };
}

async function extractText(buffer: Buffer, ext: string): Promise<{ text: string; pageCount?: number }> {
  switch (ext) {
    case '.pdf':
      return extractPdf(buffer);
    case '.docx':
    case '.docm':
      return extractDocx(buffer);
    case '.xlsx':
    case '.xls':
    case '.xlsm':
      return extractXlsx(buffer);
    case '.msg':
      return extractMsg(buffer);
    case '.eml':
      return extractEml(buffer);
    case '.txt':
    case '.csv':
      return { text: buffer.toString('utf-8').replace(/\0/g, '') };
    default:
      return { text: '' };
  }
}

// --- Main pipeline ---

interface ManifestEntry {
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  serverModified: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
    }
  }
  return { limit };
}

async function main() {
  const { limit } = parseArgs();
  const { db, client } = createDb();
  const dbx = createDropboxClient();

  // 1. Load manifest
  const manifestPath = resolve(import.meta.dirname, '..', '..', 'dropbox-manifest.json');
  console.log(`Loading manifest from ${manifestPath}...`);
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  console.log(`Manifest: ${manifest.length} total files`);

  // 2. Filter to extractable files
  const extractable = manifest.filter((f) => {
    const ext = f.extension.toLowerCase();
    if (EXTRACTABLE_EXTENSIONS.has(ext)) return true;
    if (SKIP_EXTENSIONS.has(ext)) return false;
    // Unknown extension — skip but log
    return false;
  });
  console.log(`Extractable files: ${extractable.length}`);

  // 3. Upsert document rows
  console.log('Inserting document rows...');
  let inserted = 0;
  let skippedExisting = 0;

  for (const file of extractable) {
    const ext = file.extension.toLowerCase().replace('.', '');
    const status = file.sizeBytes > MAX_FILE_SIZE ? 'skipped' : 'pending';
    const errorMsg = file.sizeBytes > MAX_FILE_SIZE ? `File too large: ${(file.sizeBytes / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` : null;

    try {
      await db.insert(documents).values({
        dropboxPath: file.path,
        fileName: file.name,
        fileType: ext,
        fileSizeBytes: file.sizeBytes,
        status,
        errorMessage: errorMsg,
        dropboxModified: file.serverModified ? new Date(file.serverModified) : null,
      }).onConflictDoNothing();
      inserted++;
    } catch {
      skippedExisting++;
    }
  }
  console.log(`Inserted ${inserted} rows (${skippedExisting} already existed)`);

  // 4. Query pending rows
  const pendingRows = await db.select()
    .from(documents)
    .where(eq(documents.status, 'pending'))
    .orderBy(documents.fileSizeBytes);

  const toProcess = limit > 0 ? pendingRows.slice(0, limit) : pendingRows;
  console.log(`\nPending: ${pendingRows.length} files. Processing: ${toProcess.length}\n`);

  // 5. Process each file
  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const doc = toProcess[i];

    try {
      // Mark as processing
      await db.update(documents)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(documents.id, doc.id));

      // Download from Dropbox
      const response = await dbx.filesDownload({ path: doc.dropboxPath });
      let buffer: Buffer = (response.result as any).fileBinary as Buffer;

      // Extract text
      const ext = '.' + doc.fileType;
      const { text: rawText, pageCount } = await extractText(buffer, ext);

      // Free buffer
      buffer = null as any;

      // Strip null bytes that PostgreSQL rejects as invalid UTF-8
      const text = rawText ? rawText.replace(/\0/g, '') : rawText;

      if (!text || text.trim().length === 0) {
        // Empty text — might be scanned PDF or image-based
        const status = ext === '.pdf' ? 'ocr_needed' : 'completed';
        await db.update(documents)
          .set({
            extractedText: '',
            textPreview: '',
            status,
            pageCount: pageCount || null,
            wordCount: 0,
            errorMessage: status === 'ocr_needed' ? 'No text extracted - may be scanned/image-based PDF' : null,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, doc.id));
      } else {
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const preview = text.slice(0, 500).replace(/\s+/g, ' ').trim();

        await db.update(documents)
          .set({
            extractedText: text,
            textPreview: preview,
            status: 'completed',
            pageCount: pageCount || null,
            wordCount,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, doc.id));
      }

      completed++;
    } catch (err: any) {
      failed++;
      const errMsg = err.message || String(err);
      await db.update(documents)
        .set({
          status: 'failed',
          errorMessage: errMsg.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
    }

    // Progress log every 10 files
    if ((i + 1) % 10 === 0 || i === toProcess.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = ((completed + failed) / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(
        `  [${i + 1}/${toProcess.length}] ` +
        `completed=${completed} failed=${failed} ` +
        `elapsed=${elapsed}s rate=${rate}/s`
      );
    }
  }

  // 6. Summary
  console.log('\n' + '='.repeat(60));
  console.log('INGESTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Processed: ${completed + failed}`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Time:      ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // Show status breakdown
  const statusCounts = await db.execute(
    sql`SELECT status, count(*)::int as count FROM documents GROUP BY status ORDER BY count DESC`
  );
  console.log('\nDocument status breakdown:');
  for (const row of statusCounts as any[]) {
    console.log(`  ${row.status}: ${row.count}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
