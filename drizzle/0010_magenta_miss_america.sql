CREATE TYPE "public"."publication_status" AS ENUM('draft', 'pending_review', 'approved', 'published', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "editorial_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"norm_id" uuid,
	"version_id" uuid,
	"actor_id" text,
	"action" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "import_batches" SET "status" = CASE
	WHEN "status" = 'pending' THEN 'pending_review'
	WHEN "status" = 'failed' THEN 'publication_failed'
	ELSE "status"
END;--> statement-breakpoint
DROP TYPE "public"."import_status";--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('captured', 'parsed', 'validated', 'pending_review', 'approved', 'publishing', 'published', 'rejected', 'validation_failed', 'publication_failed', 'superseded');--> statement-breakpoint
ALTER TABLE "import_batches" ALTER COLUMN "status" SET DATA TYPE "public"."import_status" USING "status"::"public"."import_status";--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "norm_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "proposed_version_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "parser_version" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "previous_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "norm_versions" ADD COLUMN "publication_status" "publication_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
UPDATE "norm_versions" SET "publication_status" = 'published' WHERE "is_current" = true;--> statement-breakpoint
ALTER TABLE "norm_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "norm_versions" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "norm_versions" ADD COLUMN "publication_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "parser_version" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "source_identifier" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "captured_http_status" integer;--> statement-breakpoint
ALTER TABLE "editorial_decisions" ADD CONSTRAINT "editorial_decisions_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_decisions" ADD CONSTRAINT "editorial_decisions_norm_id_norms_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_decisions" ADD CONSTRAINT "editorial_decisions_version_id_norm_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."norm_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editorial_decisions_batch_idx" ON "editorial_decisions" USING btree ("batch_id","created_at");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_norm_id_norms_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_proposed_version_id_norm_versions_id_fk" FOREIGN KEY ("proposed_version_id") REFERENCES "public"."norm_versions"("id") ON DELETE set null ON UPDATE no action;