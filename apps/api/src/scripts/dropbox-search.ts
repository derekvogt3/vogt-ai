import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Missing DATABASE_URL env var');
    process.exit(1);
  }
  const client = postgres(url);
  return { db: drizzle(client), client };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let query = '';
  let type = '';
  let limit = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith('--')) {
      query = args[i];
    }
  }

  if (!query) {
    console.log('Usage: dropbox-search.ts <query> [--type pdf|docx|xlsx|msg|eml] [--limit N]');
    console.log('\nExamples:');
    console.log('  dropbox-search.ts "delay notice"');
    console.log('  dropbox-search.ts "CDR review" --type pdf');
    console.log('  dropbox-search.ts "site readiness" --limit 50');
    console.log('  dropbox-search.ts "WCS installation" --type msg');
    process.exit(0);
  }

  return { query, type, limit };
}

async function main() {
  const { query, type, limit } = parseArgs();
  const { db, client } = createDb();

  console.log(`\nSearching for: "${query}"${type ? ` (type: ${type})` : ''} (limit: ${limit})\n`);

  // Build query with optional type filter
  const typeFilter = type ? sql` AND file_type = ${type}` : sql``;

  const results = await db.execute(sql`
    SELECT
      id,
      file_name,
      file_type,
      dropbox_path,
      word_count,
      file_size_bytes,
      ts_rank(text_search, plainto_tsquery('english', ${query})) AS rank,
      ts_headline(
        'english',
        coalesce(extracted_text, ''),
        plainto_tsquery('english', ${query}),
        'StartSel=>>>, StopSel=<<<, MaxWords=40, MinWords=20, MaxFragments=2, FragmentDelimiter= ... '
      ) AS snippet
    FROM documents
    WHERE text_search @@ plainto_tsquery('english', ${query})
    ${typeFilter}
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  if ((results as any[]).length === 0) {
    console.log('No results found.');
    console.log('\nTip: Try simpler terms, or check document statuses:');
    const stats = await db.execute(
      sql`SELECT status, count(*)::int as count FROM documents GROUP BY status ORDER BY count DESC`
    );
    for (const row of stats as any[]) {
      console.log(`  ${row.status}: ${row.count}`);
    }
    await client.end();
    return;
  }

  console.log(`Found ${(results as any[]).length} results:\n`);
  console.log('-'.repeat(100));

  for (const row of results as any[]) {
    const rank = parseFloat(row.rank).toFixed(4);
    const size = row.file_size_bytes
      ? row.file_size_bytes < 1024 * 1024
        ? `${(row.file_size_bytes / 1024).toFixed(0)}KB`
        : `${(row.file_size_bytes / (1024 * 1024)).toFixed(1)}MB`
      : '?';

    console.log(`  [${rank}] ${row.file_type.toUpperCase().padEnd(5)} ${size.padStart(8)}  ${row.file_name}`);
    console.log(`          ${row.dropbox_path}`);

    if (row.snippet && row.snippet.trim()) {
      // Clean up the snippet for display
      const snippet = row.snippet
        .replace(/\s+/g, ' ')
        .replace(/>>>/g, '\x1b[1;33m')  // bold yellow for match start
        .replace(/<<</g, '\x1b[0m')     // reset for match end
        .trim();
      console.log(`          ${snippet}`);
    }

    console.log('-'.repeat(100));
  }

  // Show total indexed stats
  const totalStats = await db.execute(
    sql`SELECT count(*)::int as total, count(*) FILTER (WHERE status = 'completed')::int as indexed FROM documents`
  );
  const stats = (totalStats as any[])[0];
  console.log(`\n${stats.indexed} documents indexed out of ${stats.total} total.`);

  await client.end();
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
