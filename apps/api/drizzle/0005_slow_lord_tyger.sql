CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dropbox_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" varchar(20) NOT NULL,
	"file_size_bytes" bigint,
	"extracted_text" text,
	"text_preview" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"dropbox_modified" timestamp with time zone,
	"page_count" integer,
	"word_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text_search" tsvector GENERATED ALWAYS AS (
		to_tsvector('english', coalesce("file_name", '') || ' ' || coalesce("extracted_text", ''))
	) STORED,
	CONSTRAINT "documents_dropbox_path_unique" UNIQUE("dropbox_path")
);
--> statement-breakpoint
CREATE INDEX "idx_documents_text_search" ON "documents" USING GIN ("text_search");
--> statement-breakpoint
CREATE INDEX "idx_documents_status" ON "documents" ("status");
--> statement-breakpoint
CREATE INDEX "idx_documents_file_type" ON "documents" ("file_type");
