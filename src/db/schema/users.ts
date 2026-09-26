import { check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { normNodes, normVersions, norms } from "./legislation";

export const userRole = pgEnum("user_role", ["user", "reviewer", "admin"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
});

export const accounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (table) => ({
  userIdx: index("sessions_user_idx").on(table.userId),
}));

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}));

export const favorites = pgTable("favorites", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  normId: uuid("norm_id").notNull().references(() => norms.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => normVersions.id, { onDelete: "cascade" }),
  nodeId: uuid("node_id").references(() => normNodes.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userNormIdx: index("favorites_user_idx").on(table.userId),
  targetShapeCheck: check(
    "favorites_target_shape_check",
    sql`${table.versionId} is not null or ${table.nodeId} is null`,
  ),
}));

export const annotations = pgTable("annotations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  normId: uuid("norm_id").notNull().references(() => norms.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => normVersions.id, { onDelete: "cascade" }),
  nodeId: uuid("node_id").references(() => normNodes.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("annotations_user_idx").on(table.userId, table.updatedAt),
  targetShapeCheck: check(
    "annotations_target_shape_check",
    sql`${table.versionId} is not null or ${table.nodeId} is null`,
  ),
  contentLengthCheck: check(
    "annotations_content_length_check",
    sql`char_length(${table.content}) between 1 and 10000`,
  ),
}));
