ALTER TABLE "source_policies" ADD COLUMN "publication_mode" text DEFAULT 'manual_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_policies" ADD COLUMN "usage_scope" text;--> statement-breakpoint
ALTER TABLE "source_policies" ADD CONSTRAINT "source_policies_mode_check" CHECK ("source_policies"."publication_mode" in ('manual_review', 'auto_publish_validated'));