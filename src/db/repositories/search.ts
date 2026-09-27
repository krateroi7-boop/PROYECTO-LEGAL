import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { normVersions, searchDocuments } from "@/db/schema";
import type { SearchInput, SearchResult } from "@/search/types";

export async function searchPersisted(input: SearchInput): Promise<SearchResult[]> {
  const db = getDb();
  const filters = [
    eq(searchDocuments.documentType, input.article ? "node" : "norm"),
    input.number ? eq(searchDocuments.number, input.number) : undefined,
    input.article ? ilike(searchDocuments.nodeLabel, `%${input.article}%`) : undefined,
    input.type ? eq(searchDocuments.type, input.type) : undefined,
  ].filter(Boolean);

  const query = input.q?.trim();
  const rank = query
    ? sql<number>`ts_rank(${searchDocuments.searchVector}, websearch_to_tsquery('spanish', ${query}))`
    : sql<number>`1`;
  const where = and(
    ...filters,
    query ? sql`${searchDocuments.searchVector} @@ websearch_to_tsquery('spanish', ${query})` : undefined,
  );
  const rows = await db
    .select({
      slug: searchDocuments.slug,
      number: searchDocuments.number,
      title: searchDocuments.title,
      type: searchDocuments.type,
      nodeKey: searchDocuments.nodeLabel,
      versionId: searchDocuments.versionId,
      content: searchDocuments.content,
      rank,
    })
    .from(searchDocuments)
    .innerJoin(normVersions, eq(normVersions.id, searchDocuments.versionId))
    .where(and(where, publicVersionCondition()))
    .orderBy(desc(rank), searchDocuments.title)
    .offset(input.offset ?? 0)
    .limit(input.limit ?? 20);

  return rows.map((row) => ({
    norm: { slug: row.slug, number: row.number, title: row.title, type: row.type },
    node: row.nodeKey ? { stableKey: row.nodeKey, label: row.nodeKey } : undefined,
    versionId: row.versionId,
    highlight: row.content.slice(0, 220),
    rank: Number(row.rank),
  }));
}
