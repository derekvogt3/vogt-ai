-- Rename documents table to rlc_documents
ALTER TABLE "documents" RENAME TO "rlc_documents";
--> statement-breakpoint
ALTER TABLE "rlc_documents" RENAME CONSTRAINT "documents_dropbox_path_unique" TO "rlc_documents_dropbox_path_unique";
