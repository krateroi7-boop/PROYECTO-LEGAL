import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { norms, sourceDocuments } from "./legislation";

export const sourcePolicies = pgTable("source_policies", {
  sourceKey: text("source_key").primaryKey(),
  publicationAllowed: boolean("publication_allowed").notNull().default(false),
  evidenceUrl: text("evidence_url"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
});

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
});

// A shared lease persists provider backoff between processes and server restarts.
export const sourceBudgets = pgTable("source_budgets", {
  sourceKey: text("source_key").primaryKey(),
  nextRequestAt: timestamp("next_request_at", { withTimezone: true }).notNull(),
});
