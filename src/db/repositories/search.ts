import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { normNodes, normVersions, norms, searchDocuments } from "@/db/schema";
import type { SearchInput, SearchResult } from "@/search/types";

export async function searchPersisted(input: SearchInput): Promise<SearchResult[]> {
  const db = getDb();
  const filters = [
    input.article ? eq(searchDocuments.documentType, "node") : !input.q?.trim() ? eq(searchDocuments.documentType, "norm") : undefined,
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
  const matches = db
    .select({
      slug: searchDocuments.slug,
      number: searchDocuments.number,
      title: norms.title,
      type: searchDocuments.type,
      nodeKey: normNodes.stableKey,
      nodeLabel: normNodes.label,
      versionId: searchDocuments.versionId,
      content: searchDocuments.content,
      rank: rank.as("rank"),
      matchOrder: sql<number>`row_number() over (partition by ${input.article ? searchDocuments.nodeId : searchDocuments.normId} order by ${rank} desc, ${searchDocuments.id})`.as("match_order"),
    })
    .from(searchDocuments)
    .innerJoin(norms, eq(norms.id, searchDocuments.normId))
    .innerJoin(normVersions, eq(normVersions.id, searchDocuments.versionId))
    .leftJoin(normNodes, and(eq(normNodes.id, searchDocuments.nodeId), eq(normNodes.versionId, searchDocuments.versionId)))
    .where(and(where, publicVersionCondition(), eq(normVersions.isCurrent, true)))
    .as("ranked_matches");
  const rows = await db.select().from(matches).where(eq(matches.matchOrder, 1))
    .orderBy(desc(matches.rank), matches.title, matches.slug).offset(input.offset ?? 0).limit(input.limit ?? 20);

  return rows.map((row) => ({
    norm: { slug: row.slug, number: row.number, title: row.title, type: row.type },
    node: row.nodeKey ? { stableKey: row.nodeKey, label: row.nodeLabel ?? row.nodeKey } : undefined,
    versionId: row.versionId,
    highlight: row.content.slice(0, 220),
    rank: Number(row.rank),
  }));
}
