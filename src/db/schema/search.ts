import { check, customType, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { normNodes, normVersions, norms } from "./legislation";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const searchDocumentType = pgEnum("search_document_type", ["norm", "node"]);

export const searchDocuments = pgTable("search_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  normId: uuid("norm_id").notNull().references(() => norms.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => normVersions.id, { onDelete: "cascade" }),
  nodeId: uuid("node_id").references(() => normNodes.id, { onDelete: "cascade" }),
  documentType: searchDocumentType("document_type").notNull(),
  slug: text("slug").notNull(),
  number: text("number").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  topics: text("topics").notNull(),
  nodeLabel: text("node_label"),
  content: text("content").notNull(),
  searchVector: tsvector("search_vector").generatedAlwaysAs(() => sql`
    setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(number, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(topics, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(node_label, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(content, '')), 'C')
  `),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  searchVectorIdx: index("search_documents_vector_idx").using("gin", table.searchVector),
  normIdx: index("search_documents_norm_idx").on(table.normId, table.versionId),
  exactNumberIdx: index("search_documents_number_idx").on(table.number),
  slugIdx: index("search_documents_slug_idx").on(table.slug),
  documentShapeCheck: check(
    "search_documents_shape_check",
    sql`(${table.documentType} = 'norm' and ${table.nodeId} is null) or (${table.documentType} = 'node' and ${table.nodeId} is not null)`,
  ),
}));
