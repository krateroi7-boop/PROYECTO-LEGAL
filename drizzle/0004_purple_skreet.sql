CREATE TYPE "public"."search_document_type" AS ENUM('norm', 'node');--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"norm_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"node_id" uuid,
	"document_type" "search_document_type" NOT NULL,
	"slug" text NOT NULL,
	"number" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"topics" text NOT NULL,
	"node_label" text,
	"content" text NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(number, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(topics, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(node_label, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(content, '')), 'C')
  ) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_norm_id_norms_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_version_id_norm_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."norm_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_node_id_norm_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."norm_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_documents_vector_idx" ON "search_documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "search_documents_norm_idx" ON "search_documents" USING btree ("norm_id","version_id");--> statement-breakpoint
CREATE INDEX "search_documents_number_idx" ON "search_documents" USING btree ("number");--> statement-breakpoint
CREATE INDEX "search_documents_slug_idx" ON "search_documents" USING btree ("slug");