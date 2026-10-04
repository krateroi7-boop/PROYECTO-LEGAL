import { sql } from "drizzle-orm";
import { check, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { importBatches, norms, sourceDocuments } from "./legislation";
import { users } from "./users";

export const sourcePolicies = pgTable("source_policies", {
  sourceKey: text("source_key").primaryKey(),
  publicationAllowed: boolean("publication_allowed").notNull().default(false),
  evidenceUrl: text("evidence_url"),
  publicationMode: text("publication_mode").$type<"manual_review" | "auto_publish_validated">().notNull().default("manual_review"),
  usageScope: text("usage_scope"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
}, (table) => ({ modeCheck: check("source_policies_mode_check", sql`${table.publicationMode} in ('manual_review', 'auto_publish_validated')`) }));

export const documentIdentifiers = pgTable("document_identifiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceKey: text("source_key").notNull(),
  externalId: text("external_id").notNull(),
  normId: uuid("norm_id").notNull().references(() => norms.id, { onDelete: "restrict" }),
}, (table) => ({ externalIdx: uniqueIndex("document_identifiers_external_idx").on(table.sourceKey, table.externalId) }));

// Cache eviction never deletes the canonical norm, published versions, or personal notes.
export const sourceCache = pgTable("source_cache", {
  key: text("key").primaryKey(),
  sourceKey: text("source_key").notNull(),
  referenceKind: text("reference_kind").notNull(),
  referenceValue: text("reference_value").notNull(),
  operation: text("operation").notNull().default("resolve"),
  payload: jsonb("payload"),
  sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, { onDelete: "restrict" }),
  etag: text("etag"),
  lastModified: text("last_modified"),
  outcome: text("outcome").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  retryAfter: timestamp("retry_after", { withTimezone: true }),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).notNull(),
}, (table) => ({ expiryIdx: index("source_cache_expiry_idx").on(table.expiresAt) }));

export const sourceObservations = pgTable("source_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceKey: text("source_key").notNull(),
  cacheKey: text("cache_key").notNull(),
  sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, { onDelete: "restrict" }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  outcome: text("outcome").notNull(),
  httpStatus: integer("http_status"),
  sourceUrl: text("source_url"),
  etag: text("etag"),
  lastModified: text("last_modified"),
  checksum: text("checksum"),
  operation: text("operation").notNull().default("resolve"),
  eventKind: text("event_kind").notNull().default("upstream"),
  durationMs: integer("duration_ms"),
  discoveryEventId: uuid("discovery_event_id"),
  metadata: jsonb("metadata").$type<{ candidateIds?: string[]; count?: number; discarded?: number; change?: string }>(),
}, (table) => ({
  metricsIdx: index("source_observations_metrics_idx").on(table.sourceKey, table.observedAt, table.eventKind),
  conversionIdx: uniqueIndex("source_observations_conversion_idx").on(table.discoveryEventId),
}));

export const sourceLeases = pgTable("source_leases", {
  key: text("key").primaryKey(),
  sourceKey: text("source_key").notNull(),
  owner: uuid("owner").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const editorialReviewRequests = pgTable("editorial_review_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  batchId: uuid("batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  requestIdx: uniqueIndex("editorial_review_requests_user_batch_idx").on(table.userId, table.batchId),
  quotaIdx: index("editorial_review_requests_quota_idx").on(table.userId, table.createdAt),
}));

// A shared lease persists provider backoff between processes and server restarts.
export const sourceBudgets = pgTable("source_budgets", {
  sourceKey: text("source_key").primaryKey(),
  nextRequestAt: timestamp("next_request_at", { withTimezone: true }).notNull(),
});
