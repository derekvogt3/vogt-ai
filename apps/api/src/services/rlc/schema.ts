import { pgTable, uuid, varchar, timestamp, text, bigint, integer } from 'drizzle-orm/pg-core';

export const rlcDocuments = pgTable('rlc_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  dropboxPath: text('dropbox_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileType: varchar('file_type', { length: 20 }).notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
  extractedText: text('extracted_text'),
  textPreview: text('text_preview'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  dropboxModified: timestamp('dropbox_modified', { withTimezone: true }),
  pageCount: integer('page_count'),
  wordCount: integer('word_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
