import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

export const documentRoutes = new Hono();

// GET /search?q=...&type=...&limit=...&page=...
const searchSchema = z.object({
  q: z.string().min(1),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

documentRoutes.get('/search', async (c) => {
  const parsed = searchSchema.parse(c.req.query());
  const { q, type, limit, page } = parsed;
  const offset = (page - 1) * limit;
  const start = performance.now();

  const typeFilter = type ? sql` AND file_type = ${type}` : sql``;

  const [results, countResult] = await Promise.all([
    db.execute(sql`
      SELECT
        id,
        file_name,
        file_type,
        dropbox_path,
        word_count,
        file_size_bytes,
        page_count,
        dropbox_modified,
        ts_rank(text_search, plainto_tsquery('english', ${q})) AS rank,
        ts_headline(
          'english',
          coalesce(extracted_text, ''),
          plainto_tsquery('english', ${q}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20, MaxFragments=3, FragmentDelimiter= ... '
        ) AS snippet
      FROM documents
      WHERE text_search @@ plainto_tsquery('english', ${q})
        AND status = 'completed'
        ${typeFilter}
      ORDER BY rank DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT count(*)::int AS total
      FROM documents
      WHERE text_search @@ plainto_tsquery('english', ${q})
        AND status = 'completed'
        ${typeFilter}
    `),
  ]);

  const searchTimeMs = Math.round(performance.now() - start);
  const total = (countResult as any[])[0]?.total ?? 0;

  return c.json({
    results: (results as any[]).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      fileType: r.file_type,
      dropboxPath: r.dropbox_path,
      wordCount: r.word_count,
      fileSizeBytes: r.file_size_bytes ? Number(r.file_size_bytes) : null,
      pageCount: r.page_count,
      dropboxModified: r.dropbox_modified,
      rank: parseFloat(r.rank),
      snippet: r.snippet,
    })),
    total,
    query: q,
    page,
    limit,
    searchTimeMs,
  });
});

// GET /stats — must be before /:id so "stats" isn't treated as a UUID
documentRoutes.get('/stats', async (c) => {
  const [mainStats, typeBreakdown, statusBreakdown] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::int AS total_documents,
        count(*) FILTER (WHERE status = 'completed')::int AS indexed_documents,
        coalesce(sum(word_count) FILTER (WHERE status = 'completed'), 0)::bigint AS total_words
      FROM documents
    `),
    db.execute(sql`
      SELECT
        file_type,
        count(*)::int AS count,
        coalesce(sum(word_count), 0)::bigint AS total_words
      FROM documents
      WHERE status = 'completed'
      GROUP BY file_type
      ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT status, count(*)::int AS count
      FROM documents
      GROUP BY status
      ORDER BY count DESC
    `),
  ]);

  const stats = (mainStats as any[])[0];

  return c.json({
    totalDocuments: stats.total_documents,
    indexedDocuments: stats.indexed_documents,
    totalWords: Number(stats.total_words),
    typeBreakdown: (typeBreakdown as any[]).map((r) => ({
      fileType: r.file_type,
      count: r.count,
      totalWords: Number(r.total_words),
    })),
    statusBreakdown: (statusBreakdown as any[]).map((r) => ({
      status: r.status,
      count: r.count,
    })),
  });
});

// GET /:id — full document detail (after /search and /stats)
documentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const rows = await db.execute(sql`
    SELECT
      id, file_name, file_type, dropbox_path, word_count,
      file_size_bytes, page_count, dropbox_modified, status,
      extracted_text, text_preview, error_message,
      created_at, updated_at
    FROM documents
    WHERE id = ${id}
    LIMIT 1
  `);

  const doc = (rows as any[])[0];
  if (!doc) {
    return c.json({ error: 'Document not found' }, 404);
  }

  return c.json({
    id: doc.id,
    fileName: doc.file_name,
    fileType: doc.file_type,
    dropboxPath: doc.dropbox_path,
    wordCount: doc.word_count,
    fileSizeBytes: doc.file_size_bytes ? Number(doc.file_size_bytes) : null,
    pageCount: doc.page_count,
    dropboxModified: doc.dropbox_modified,
    status: doc.status,
    extractedText: doc.extracted_text,
    textPreview: doc.text_preview,
    errorMessage: doc.error_message,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  });
});
