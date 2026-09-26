CREATE TYPE "public"."norm_event_type" AS ENUM('published', 'amended', 'repealed', 'replaced', 'rectified', 'effective', 'expired');--> statement-breakpoint
CREATE TYPE "public"."version_kind" AS ENUM('original', 'consolidated', 'historical', 'proposed');--> statement-breakpoint
CREATE TABLE "norm_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"norm_id" uuid NOT NULL,
	"version_id" uuid,
	"source_document_id" uuid,
	"type" "norm_event_type" NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "norm_versions" ADD COLUMN "kind" "version_kind" DEFAULT 'consolidated' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "issuing_organization" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "original_object_key" text;--> statement-breakpoint
ALTER TABLE "norm_events" ADD CONSTRAINT "norm_events_norm_id_norms_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_events" ADD CONSTRAINT "norm_events_version_id_norm_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."norm_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_events" ADD CONSTRAINT "norm_events_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "norm_events_norm_date_idx" ON "norm_events" USING btree ("norm_id","event_date");