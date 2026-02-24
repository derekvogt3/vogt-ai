import { Dropbox } from 'dropbox';
import { writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const DEFAULT_ROOT = '/HITACHI RAIL COLLABORATION at RLC';

interface FileEntry {
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  serverModified: string;
}

interface FolderEntry {
  path: string;
  name: string;
}

function createClient(): Dropbox {
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  if (!appKey || !appSecret || !refreshToken) {
    console.error('Missing required env vars: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN');
    console.error('Add them to .env at the monorepo root.');
    process.exit(1);
  }

  return new Dropbox({ clientId: appKey, clientSecret: appSecret, refreshToken });
}

async function listAllEntries(dbx: Dropbox, rootPath: string) {
  const files: FileEntry[] = [];
  const folders: FolderEntry[] = [];

  console.log(`\nListing files in: ${rootPath}`);
  console.log('This may take a minute for large folders...\n');

  let response = await dbx.filesListFolder({
    path: rootPath,
    recursive: true,
    limit: 2000,
    include_deleted: false,
  });

  let pageCount = 1;
  processEntries(response.result.entries, files, folders);
  console.log(`  Page ${pageCount}: ${response.result.entries.length} entries (${files.length} files so far)`);

  while (response.result.has_more) {
    response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
    pageCount++;
    processEntries(response.result.entries, files, folders);
    console.log(`  Page ${pageCount}: ${response.result.entries.length} entries (${files.length} files so far)`);
  }

  return { files, folders };
}

function processEntries(
  entries: Array<{ '.tag': string; path_display?: string; name?: string; size?: number; server_modified?: string }>,
  files: FileEntry[],
  folders: FolderEntry[],
) {
  for (const entry of entries) {
    if (entry['.tag'] === 'file') {
      const path = entry.path_display || '';
      const name = entry.name || '';
      files.push({
        path,
        name,
        extension: extname(name).toLowerCase(),
        sizeBytes: (entry as any).size || 0,
        serverModified: (entry as any).server_modified || '',
      });
    } else if (entry['.tag'] === 'folder') {
      folders.push({
        path: entry.path_display || '',
        name: entry.name || '',
      });
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function printTree(files: FileEntry[], folders: FolderEntry[], rootPath: string) {
  console.log('\n' + '='.repeat(80));
  console.log('FOLDER STRUCTURE (with file counts)');
  console.log('='.repeat(80));

  // Count files per folder
  const fileCounts = new Map<string, number>();
  for (const file of files) {
    const dir = file.path.substring(0, file.path.lastIndexOf('/'));
    fileCounts.set(dir, (fileCounts.get(dir) || 0) + 1);
  }

  // Sort folders by path
  const allPaths = [...folders.map((f) => f.path)].sort();

  for (const folderPath of allPaths) {
    const relative = folderPath.replace(rootPath, '');
    if (!relative) continue;
    const depth = relative.split('/').filter(Boolean).length;
    const indent = '  '.repeat(depth);
    const folderName = relative.split('/').pop() || '';
    const count = fileCounts.get(folderPath) || 0;
    const countStr = count > 0 ? ` (${count} files)` : '';
    console.log(`${indent}${folderName}/${countStr}`);
  }
}

function analyzeByType(files: FileEntry[]) {
  console.log('\n' + '='.repeat(80));
  console.log('FILE TYPE BREAKDOWN');
  console.log('='.repeat(80));

  const typeMap = new Map<string, { count: number; totalSize: number }>();
  for (const file of files) {
    const ext = file.extension || '(no extension)';
    const existing = typeMap.get(ext) || { count: 0, totalSize: 0 };
    existing.count++;
    existing.totalSize += file.sizeBytes;
    typeMap.set(ext, existing);
  }

  // Sort by count descending
  const sorted = [...typeMap.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log(`\n${'Extension'.padEnd(20)} ${'Count'.padStart(8)} ${'Total Size'.padStart(14)}`);
  console.log('-'.repeat(44));
  for (const [ext, data] of sorted) {
    console.log(`${ext.padEnd(20)} ${String(data.count).padStart(8)} ${formatSize(data.totalSize).padStart(14)}`);
  }
}

function printSizeAnalysis(files: FileEntry[]) {
  console.log('\n' + '='.repeat(80));
  console.log('SIZE ANALYSIS');
  console.log('='.repeat(80));

  const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  console.log(`\nTotal files: ${files.length}`);
  console.log(`Total size:  ${formatSize(totalSize)}`);
  console.log(`Average:     ${formatSize(Math.round(totalSize / (files.length || 1)))}`);

  const sorted = [...files].sort((a, b) => b.sizeBytes - a.sizeBytes);
  console.log('\nTop 20 largest files:');
  console.log('-'.repeat(80));
  for (const file of sorted.slice(0, 20)) {
    const shortPath = file.path.length > 65 ? '...' + file.path.slice(-62) : file.path;
    console.log(`  ${formatSize(file.sizeBytes).padStart(12)}  ${shortPath}`);
  }
}

function findIssues(files: FileEntry[]) {
  console.log('\n' + '='.repeat(80));
  console.log('POTENTIAL ISSUES');
  console.log('='.repeat(80));

  // No extension
  const noExt = files.filter((f) => !f.extension);
  if (noExt.length > 0) {
    console.log(`\n[!] Files with no extension: ${noExt.length}`);
    for (const f of noExt.slice(0, 10)) console.log(`    ${f.path}`);
    if (noExt.length > 10) console.log(`    ... and ${noExt.length - 10} more`);
  }

  // Very large files (>100MB)
  const large = files.filter((f) => f.sizeBytes > 100 * 1024 * 1024);
  if (large.length > 0) {
    console.log(`\n[!] Files over 100MB: ${large.length}`);
    for (const f of large) console.log(`    ${formatSize(f.sizeBytes).padStart(12)}  ${f.path}`);
  }

  // Binary/CAD formats that need special extraction
  const binaryExts = new Set(['.dwg', '.rvt', '.zip', '.rar', '.7z', '.exe', '.msi', '.bin', '.dat', '.bak', '.pst', '.ost']);
  const binary = files.filter((f) => binaryExts.has(f.extension));
  if (binary.length > 0) {
    console.log(`\n[!] Binary/CAD/archive files (need special handling): ${binary.length}`);
    const byExt = new Map<string, number>();
    for (const f of binary) byExt.set(f.extension, (byExt.get(f.extension) || 0) + 1);
    for (const [ext, count] of [...byExt.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ext}: ${count} files`);
    }
  }

  // Very small files (<1KB, possibly empty)
  const tiny = files.filter((f) => f.sizeBytes < 1024 && f.sizeBytes > 0);
  if (tiny.length > 0) {
    console.log(`\n[!] Very small files (<1KB): ${tiny.length}`);
  }

  // Empty files (0 bytes)
  const empty = files.filter((f) => f.sizeBytes === 0);
  if (empty.length > 0) {
    console.log(`\n[!] Empty files (0 bytes): ${empty.length}`);
    for (const f of empty.slice(0, 10)) console.log(`    ${f.path}`);
    if (empty.length > 10) console.log(`    ... and ${empty.length - 10} more`);
  }

  // Duplicate filenames
  const nameMap = new Map<string, string[]>();
  for (const f of files) {
    const paths = nameMap.get(f.name) || [];
    paths.push(f.path);
    nameMap.set(f.name, paths);
  }
  const dupes = [...nameMap.entries()].filter(([, paths]) => paths.length > 1);
  if (dupes.length > 0) {
    console.log(`\n[!] Duplicate filenames (same name in different folders): ${dupes.length}`);
    for (const [name, paths] of dupes.slice(0, 10)) {
      console.log(`    "${name}" (${paths.length} copies)`);
      for (const p of paths) console.log(`      - ${p}`);
    }
    if (dupes.length > 10) console.log(`    ... and ${dupes.length - 10} more duplicate names`);
  }

  if (noExt.length === 0 && large.length === 0 && binary.length === 0 && empty.length === 0 && dupes.length === 0) {
    console.log('\n  No issues found.');
  }
}

function saveManifest(files: FileEntry[], outputPath: string) {
  writeFileSync(outputPath, JSON.stringify(files, null, 2));
  console.log(`\n\nManifest saved to: ${outputPath}`);
  console.log(`Contains ${files.length} file entries with path, name, extension, size, and modified date.`);
}

async function main() {
  const rootPath = process.argv[2] || DEFAULT_ROOT;
  const dbx = createClient();

  const { files, folders } = await listAllEntries(dbx, rootPath);

  if (files.length === 0 && folders.length === 0) {
    console.log('No files or folders found. Check the path and permissions.');
    process.exit(1);
  }

  printTree(files, folders, rootPath);
  analyzeByType(files);
  printSizeAnalysis(files);
  findIssues(files);

  const manifestPath = resolve(import.meta.dirname, '..', '..', 'dropbox-manifest.json');
  saveManifest(files, manifestPath);
}

main().catch((err) => {
  console.error('\nError:', err.message || err);
  if (err.status === 401) {
    console.error('Authentication failed. Check your DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN.');
  } else if (err.status === 409) {
    console.error('Path not found. Check the folder path argument.');
  }
  process.exit(1);
});
