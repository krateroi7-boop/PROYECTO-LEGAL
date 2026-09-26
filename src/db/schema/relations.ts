import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { importBatches, normNodes, normVersions, norms, sourceDocuments } from "./legislation";

export const relationType = pgEnum("relation_type", ["modifica", "deroga", "reemplaza", "cita", "remite", "reglamenta", "complementa", "relacionada"]);
export const relationStatus = pgEnum("relation_status", ["pending", "verified", "rejected"]);
export const validationSeverity = pgEnum("validation_severity", ["error", "warning", "info"]);
export const validationStatus = pgEnum("validation_status", ["open", "resolved", "ignored"]);

export const legalRelations = pgTable("legal_relations", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceNormId: uuid("source_norm_id").notNull().references(() => norms.id, { onDelete: "cascade" }),
  targetNormId: uuid("target_norm_id").notNull().references(() => norms.id, { onDelete: "cascade" }),
  sourceVersionId: uuid("source_version_id").references(() => normVersions.id, { onDelete: "set null" }),
  targetVersionId: uuid("target_version_id").references(() => normVersions.id, { onDelete: "set null" }),
  sourceNodeId: uuid("source_node_id").references(() => normNodes.id, { onDelete: "set null" }),
  targetNodeId: uuid("target_node_id").references(() => normNodes.id, { onDelete: "set null" }),
  type: relationType("type").notNull(),
  status: relationStatus("status").notNull().default("pending"),
  evidence: text("evidence").notNull(),
  evidenceSourceDocumentId: uuid("evidence_source_document_id").references(() => sourceDocuments.id, { onDelete: "set null" }),
  evidenceFragment: text("evidence_fragment"),
  method: text("method").notNull(),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => ({
  noSelfRelationCheck: check(
    "legal_relations_no_self_check",
    sql`${table.sourceNormId} <> ${table.targetNormId}`,
  ),
  sourceIdx: index("legal_relations_source_idx").on(table.sourceNormId, table.status),
  targetIdx: index("legal_relations_target_idx").on(table.targetNormId, table.status),
}));

export const importValidations = pgTable("import_validations", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
  rule: text("rule").notNull(),
  severity: validationSeverity("severity").notNull(),
  status: validationStatus("status").notNull().default("open"),
  message: text("message").notNull(),
  entityRef: text("entity_ref"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const editorialDecisions = pgTable("editorial_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
  normId: uuid("norm_id").references(() => norms.id, { onDelete: "set null" }),
  versionId: uuid("version_id").references(() => normVersions.id, { onDelete: "set null" }),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  previousStatus: text("previous_status").notNull(),
  newStatus: text("new_status").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  batchIdx: index("editorial_decisions_batch_idx").on(table.batchId, table.createdAt),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  result: text("result").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt),
}));
