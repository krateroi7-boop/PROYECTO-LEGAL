import {
  AnyPgColumn,
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  check,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SourceDocument } from "@/sources/types";

export const normStatus = pgEnum("norm_status", ["vigente", "modificada", "derogada", "desconocida"]);
export const nodeType = pgEnum("node_type", ["titulo", "capitulo", "parrafo", "articulo", "inciso", "disposicion_transitoria", "encabezado", "promulgacion", "anexo", "agrupador"]);
export const importStatus = pgEnum("import_status", [
  "captured",
  "parsed",
  "validated",
  "pending_review",
  "approved",
  "publishing",
  "published",
  "rejected",
  "validation_failed",
  "publication_failed",
  "superseded",
]);
export const publicationStatus = pgEnum("publication_status", [
  "draft",
  "pending_review",
  "approved",
  "published",
  "rejected",
  "superseded",
]);
export const versionKind = pgEnum("version_kind", ["original", "consolidated", "historical", "proposed"]);
export const normEventType = pgEnum("norm_event_type", ["published", "amended", "repealed", "replaced", "rectified", "effective", "expired"]);

export const norms = pgTable("norms", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull(),
  type: text("type").notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  shortTitle: text("short_title").notNull(),
  description: text("description").notNull(),
  status: normStatus("status").notNull(),
  topics: jsonb("topics").$type<string[]>().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex("norms_slug_idx").on(table.slug),
  numberIdx: index("norms_type_number_idx").on(table.type, table.number),
}));

export const normVersions = pgTable("norm_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  normId: uuid("norm_id").notNull().references(() => norms.id, { onDelete: "cascade" }),
  versionLabel: text("version_label").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  sourceVersionDate: timestamp("source_version_date", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  isCurrent: boolean("is_current").notNull().default(false),
  kind: versionKind("kind").notNull().default("consolidated"),
  publicationStatus: publicationStatus("publication_status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: text("published_by"),
  publicationBatchId: uuid("publication_batch_id"),
  sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  versionIdx: uniqueIndex("norm_versions_norm_label_idx").on(table.normId, table.versionLabel),
  currentVersionIdx: uniqueIndex("norm_versions_one_current_idx")
    .on(table.normId)
    .where(sql`${table.isCurrent} = true`),
  validRangeCheck: check(
    "norm_versions_valid_range_check",
    sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`,
  ),
}));

export const normNodes = pgTable("norm_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id").notNull().references(() => normVersions.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => normNodes.id, { onDelete: "cascade" }),
  stableKey: text("stable_key").notNull(),
  type: nodeType("type").notNull(),
  label: text("label").notNull(),
  title: text("title"),
  text: text("text").notNull(),
  position: integer("position").notNull(),
}, (table) => ({
  nodeIdx: uniqueIndex("norm_nodes_version_key_idx").on(table.versionId, table.stableKey),
  parentSelfCheck: check(
    "norm_nodes_parent_self_check",
    sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
  ),
}));

export const sourceDocuments = pgTable("source_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceKey: text("source_key"),
  normalizedContent: jsonb("normalized_content").$type<SourceDocument>(),
  issuingOrganization: text("issuing_organization"),
  license: text("license"),
  format: text("format"),
  sourceUrl: text("source_url"),
  originalObjectKey: text("original_object_key"),
  checksum: text("checksum").notNull(),
  parser: text("parser").notNull(),
  parserVersion: text("parser_version"),
  sourceIdentifier: text("source_identifier"),
  storageKey: text("storage_key"),
  capturedHttpStatus: integer("captured_http_status"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  checksumIdx: index("source_documents_checksum_idx").on(table.checksum),
  representationIdx: uniqueIndex("source_documents_representation_idx").on(table.sourceKey, table.sourceIdentifier, table.checksum, table.parserVersion),
}));

export const normEvents = pgTable("norm_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  normId: uuid("norm_id").notNull().references(() => norms.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => normVersions.id, { onDelete: "set null" }),
  sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, { onDelete: "set null" }),
  type: normEventType("type").notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  normDateIdx: index("norm_events_norm_date_idx").on(table.normId, table.eventDate),
}));

export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  checksum: text("checksum").notNull(),
  status: importStatus("status").notNull(),
  sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, { onDelete: "set null" }),
  normId: uuid("norm_id").references(() => norms.id, { onDelete: "set null" }),
  proposedVersionId: uuid("proposed_version_id").references(() => normVersions.id, { onDelete: "set null" }),
  parserVersion: text("parser_version"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  publishedBy: text("published_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  previousBatchId: uuid("previous_batch_id"),
  itemCount: integer("item_count").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  checksumIdx: index("import_batches_checksum_idx").on(table.checksum),
  representationIdx: uniqueIndex("import_batches_representation_idx").on(table.sourceDocumentId, table.parserVersion),
}));
