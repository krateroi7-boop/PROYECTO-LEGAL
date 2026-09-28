CREATE TABLE "editorial_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_leases" (
	"key" text PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"owner" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_cache" ADD COLUMN "operation" text DEFAULT 'resolve' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_cache" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "source_observations" ADD COLUMN "operation" text DEFAULT 'resolve' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_observations" ADD COLUMN "event_kind" text DEFAULT 'upstream' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_observations" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "source_observations" ADD COLUMN "discovery_event_id" uuid;--> statement-breakpoint
ALTER TABLE "source_observations" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "editorial_review_requests" ADD CONSTRAINT "editorial_review_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_review_requests" ADD CONSTRAINT "editorial_review_requests_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_review_requests_user_batch_idx" ON "editorial_review_requests" USING btree ("user_id","batch_id");--> statement-breakpoint
CREATE INDEX "editorial_review_requests_quota_idx" ON "editorial_review_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "source_observations_metrics_idx" ON "source_observations" USING btree ("source_key","observed_at","event_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "source_observations_conversion_idx" ON "source_observations" USING btree ("discovery_event_id");