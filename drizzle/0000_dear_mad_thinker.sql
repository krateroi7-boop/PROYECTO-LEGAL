CREATE TYPE "public"."import_status" AS ENUM('pending', 'validated', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."node_type" AS ENUM('titulo', 'capitulo', 'parrafo', 'articulo', 'inciso', 'disposicion_transitoria');--> statement-breakpoint
CREATE TYPE "public"."norm_status" AS ENUM('vigente', 'modificada', 'derogada');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checksum" text NOT NULL,
	"status" "import_status" NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "norm_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"parent_id" uuid,
	"stable_key" text NOT NULL,
	"type" "node_type" NOT NULL,
	"label" text NOT NULL,
	"title" text,
	"text" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norm_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"norm_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"is_current" boolean DEFAULT false NOT NULL,
	"source_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"short_title" text NOT NULL,
	"description" text NOT NULL,
	"status" "norm_status" NOT NULL,
	"topics" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text,
	"checksum" text NOT NULL,
	"parser" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "norm_nodes" ADD CONSTRAINT "norm_nodes_version_id_norm_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."norm_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_versions" ADD CONSTRAINT "norm_versions_norm_id_norms_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "norm_nodes_version_key_idx" ON "norm_nodes" USING btree ("version_id","stable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "norm_versions_norm_label_idx" ON "norm_versions" USING btree ("norm_id","version_label");--> statement-breakpoint
CREATE UNIQUE INDEX "norms_slug_idx" ON "norms" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "norms_type_number_idx" ON "norms" USING btree ("type","number");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_checksum_idx" ON "source_documents" USING btree ("checksum");