ALTER TYPE "public"."node_type" ADD VALUE 'encabezado';--> statement-breakpoint
ALTER TYPE "public"."node_type" ADD VALUE 'promulgacion';--> statement-breakpoint
ALTER TYPE "public"."node_type" ADD VALUE 'anexo';--> statement-breakpoint
ALTER TYPE "public"."node_type" ADD VALUE 'agrupador';--> statement-breakpoint
ALTER TYPE "public"."norm_status" ADD VALUE 'desconocida';--> statement-breakpoint
CREATE TABLE "document_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"external_id" text NOT NULL,
	"norm_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_budgets" (
	"source_key" text PRIMARY KEY NOT NULL,
	"next_request_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"reference_kind" text NOT NULL,
	"reference_value" text NOT NULL,
	"source_document_id" uuid,
	"etag" text,
	"last_modified" text,
	"outcome" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"retry_after" timestamp with time zone,
	"last_accessed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"cache_key" text NOT NULL,
	"source_document_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"http_status" integer,
	"source_url" text,
	"etag" text,
	"last_modified" text,
	"checksum" text
);
--> statement-breakpoint
CREATE TABLE "source_policies" (
	"source_key" text PRIMARY KEY NOT NULL,
	"publication_allowed" boolean DEFAULT false NOT NULL,
	"evidence_url" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);
--> statement-breakpoint
DROP INDEX "import_batches_checksum_idx";--> statement-breakpoint
DROP INDEX "norms_type_number_idx";--> statement-breakpoint
DROP INDEX "source_documents_checksum_idx";--> statement-breakpoint
ALTER TABLE "norm_versions" ALTER COLUMN "valid_from" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "norm_versions" ADD COLUMN "source_version_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "normalized_content" jsonb;--> statement-breakpoint
ALTER TABLE "document_identifiers" ADD CONSTRAINT "document_identifiers_norm_id_norms_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_cache" ADD CONSTRAINT "source_cache_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_observations" ADD CONSTRAINT "source_observations_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_identifiers_external_idx" ON "document_identifiers" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE INDEX "source_cache_expiry_idx" ON "source_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_representation_idx" ON "import_batches" USING btree ("source_document_id","parser_version");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_representation_idx" ON "source_documents" USING btree ("source_key","source_identifier","checksum","parser_version");--> statement-breakpoint
CREATE INDEX "import_batches_checksum_idx" ON "import_batches" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "norms_type_number_idx" ON "norms" USING btree ("type","number");--> statement-breakpoint
CREATE INDEX "source_documents_checksum_idx" ON "source_documents" USING btree ("checksum");