CREATE TYPE "public"."relation_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('modifica', 'deroga', 'reemplaza', 'cita', 'remite', 'reglamenta', 'complementa', 'relacionada');--> statement-breakpoint
CREATE TYPE "public"."validation_severity" AS ENUM('error', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('open', 'resolved', 'ignored');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"result" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"severity" "validation_severity" NOT NULL,
	"status" "validation_status" DEFAULT 'open' NOT NULL,
	"message" text NOT NULL,
	"entity_ref" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_norm_id" uuid NOT NULL,
	"target_norm_id" uuid NOT NULL,
	"type" "relation_type" NOT NULL,
	"status" "relation_status" DEFAULT 'pending' NOT NULL,
	"evidence" text NOT NULL,
	"method" text NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "legal_relations" ADD CONSTRAINT "legal_relations_source_norm_id_norms_id_fk" FOREIGN KEY ("source_norm_id") REFERENCES "public"."norms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD CONSTRAINT "legal_relations_target_norm_id_norms_id_fk" FOREIGN KEY ("target_norm_id") REFERENCES "public"."norms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");