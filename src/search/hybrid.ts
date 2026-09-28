import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { documentIdentifiers, norms, normVersions } from "@/db/schema";
import { parseDiscoveryQuery } from "@/sources/discovery-query";
import { bcnConnector } from "@/sources/bcn";
import { readSourceResolution, type Resolution } from "@/sources/resolver";
import type { SourceReference } from "@/sources/types";

export function humanReference(input: string): SourceReference | undefined {
  try { return parseDiscoveryQuery(input).reference; } catch { return undefined; }
}

/** Publication eligibility is independent from cache freshness. This path never contacts BCN. */
export async function findLocalExact(reference: SourceReference): Promise<{ resolution: Resolution; fresh: boolean } | undefined> {
  if (!process.env.DATABASE_URL) return;
  const cached = await readSourceResolution(bcnConnector, reference);
  if (cached?.resolution.status === "published") return cached;
  const rows = await getDb().select({ slug: norms.slug, versionId: normVersions.id }).from(norms).innerJoin(normVersions, eq(normVersions.normId, norms.id)).leftJoin(documentIdentifiers, and(eq(documentIdentifiers.normId, norms.id), eq(documentIdentifiers.sourceKey, "bcn-leychile"))).where(and(eq(normVersions.isCurrent, true), publicVersionCondition(), reference.kind === "idNorma" ? eq(documentIdentifiers.externalId, reference.value) : and(eq(norms.type, "Ley"), sql`replace(${norms.number}, '.', '') = ${reference.value}`))).limit(2);
  if (rows.length !== 1) return;
  return { fresh: false, resolution: { status: "published", source: "bcn-leychile", reference, cache: "stale", checkedAt: cached?.resolution.checkedAt ?? null, slug: rows[0].slug, versionId: rows[0].versionId } };
}
