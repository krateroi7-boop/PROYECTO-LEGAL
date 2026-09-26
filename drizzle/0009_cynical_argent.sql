ALTER TABLE "legal_relations" ADD COLUMN "source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD COLUMN "target_version_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD COLUMN "source_node_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD COLUMN "target_node_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD COLUMN "evidence_source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD COLUMN "evidence_fragment" text;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD CONSTRAINT "legal_relations_source_version_id_norm_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."norm_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD CONSTRAINT "legal_relations_target_version_id_norm_versions_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."norm_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD CONSTRAINT "legal_relations_source_node_id_norm_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."norm_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD CONSTRAINT "legal_relations_target_node_id_norm_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."norm_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_relations" ADD CONSTRAINT "legal_relations_evidence_source_document_id_source_documents_id_fk" FOREIGN KEY ("evidence_source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_relations_source_idx" ON "legal_relations" USING btree ("source_norm_id","status");--> statement-breakpoint
CREATE INDEX "legal_relations_target_idx" ON "legal_relations" USING btree ("target_norm_id","status");