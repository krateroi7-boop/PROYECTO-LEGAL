import { fixtureDataEnabled } from "@/lib/data-mode";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { publicVersionCondition } from "@/db/public-visibility";
import { legalRelations, normNodes, normVersions, norms, sourceDocuments, sourceObservations } from "@/db/schema";
import { getApiNormDetail, listApiRelations } from "@/db/repositories/api";
import { publicIdSchema } from "@/api/contracts";
import { getLaw } from "@/lib/legislation";
import { getVersion, getVersions } from "@/lib/versioning-data";
import { getVerifiedRelations } from "@/lib/relations-data";
import { compareVersions } from "@/domain/versioning/compare";
import type { ReaderChanges, ReaderDocument, ReaderRelation, ReaderVersion } from "./types";
import { readerUrl } from "./structure";
import { presentVersion, readerDate } from "./presentation";

export { readerDate } from "./presentation";
const versionSummary = (v: { id: string; versionLabel: string; isCurrent: boolean; validFrom: Date | null; validTo: Date | null; sourceVersionDate: Date | null }): ReaderVersion => ({
  id: v.id, ...presentVersion(v), isCurrent: v.isCurrent, validFrom: v.validFrom?.toISOString() ?? null, validTo: v.validTo?.toISOString() ?? null, sourceVersionDate: v.sourceVersionDate?.toISOString() ?? null,
});

/** Summaries only: never load every historical document to draw a version selector. */
export async function getReaderVersions(slug: string): Promise<ReaderVersion[]> {
  if (fixtureDataEnabled()) return (await getVersions(slug)).map((v) => ({ id: v.id, ...presentVersion(v), isCurrent: v.isCurrent, dateLabel: v.validFrom, validFrom: null, validTo: null, sourceVersionDate: null }));
  const rows = await getDb().select({ id: normVersions.id, versionLabel: normVersions.versionLabel, isCurrent: normVersions.isCurrent, validFrom: normVersions.validFrom, validTo: normVersions.validTo, sourceVersionDate: normVersions.sourceVersionDate })
    .from(normVersions).innerJoin(norms, eq(norms.id, normVersions.normId))
    .where(and(eq(norms.slug, slug), publicVersionCondition()))
    .orderBy(asc(sql`coalesce(${normVersions.validFrom}, ${normVersions.sourceVersionDate}, ${normVersions.createdAt})`), asc(normVersions.id));
  return rows.map(versionSummary);
}

export async function getReaderDocument(slug: string, versionId?: string): Promise<ReaderDocument | undefined> {
  if (fixtureDataEnabled()) {
    const versions = await getReaderVersions(slug);
    const version = versionId ? versions.find((v) => v.id === versionId) : versions.find((v) => v.isCurrent);
    const law = versionId ? (await getVersion(slug, versionId))?.law : getLaw(slug);
    if (!law) return;
    return { slug: law.slug, type: law.type, number: law.number, title: law.title, shortTitle: law.shortTitle, status: law.status, description: law.description, topics: law.topics, provenance: law.provenance, publicationDate: law.published, version, versions, demonstration: true, nodes: law.articles.map((a, position) => ({ stableKey: a.id, parentStableKey: null, position, type: "articulo", label: a.label ?? `Artículo ${a.number}`, title: a.title ?? null, text: a.paragraphs.join("\n\n") })) };
  }
  if (versionId && !publicIdSchema.safeParse(versionId).success) return;
  const detail = await getApiNormDetail(slug, versionId);
  if (!detail?.currentVersion) return;
  const versions = await getReaderVersions(slug);
  const version = versions.find((v) => v.id === detail.currentVersion!.id);
  if (!version) return; // Policy may have changed between reads.
  let organism: string | undefined, checkedAt: string | undefined, officialUrl = detail.provenance?.sourceUrl;
  if (detail.provenance?.sourceDocumentId) {
    const id = detail.provenance.sourceDocumentId;
    const [source] = await getDb().select({ organism: sourceDocuments.issuingOrganization, sourceKey: sourceDocuments.sourceKey, sourceIdentifier: sourceDocuments.sourceIdentifier }).from(sourceDocuments).where(eq(sourceDocuments.id, id));
    organism = source?.organism ?? undefined;
    if (source?.sourceKey === "bcn-leychile" && source.sourceIdentifier && /^[1-9]\d{0,11}$/.test(source.sourceIdentifier)) officialUrl = `https://www.bcn.cl/leychile/navegar?idNorma=${source.sourceIdentifier}`;
    const [observed] = await getDb().select({ at: sql<Date | string | null>`max(${sourceObservations.observedAt})` }).from(sourceObservations)
      .where(and(eq(sourceObservations.sourceDocumentId, id), eq(sourceObservations.operation, "resolve"), eq(sourceObservations.eventKind, "upstream"), inArray(sourceObservations.outcome, ["captured", "not_modified"]), inArray(sourceObservations.httpStatus, [200, 304])));
    if (observed?.at) checkedAt = new Date(observed.at).toISOString();
  }
  return { id: detail.id, slug, type: detail.type, number: detail.number, title: detail.title, shortTitle: detail.shortTitle, status: ({ vigente: "Vigente", modificada: "Modificada", derogada: "Derogada", desconocida: "Desconocida" })[detail.status], publicationDate: readerDate(detail.publishedAt), description: detail.description, topics: detail.topics, nodes: detail.articles, version, versions, provenance: detail.provenance, organism, checkedAt, officialUrl, demonstration: detail.provenance?.parser === "local-fixture-v1" };
}

export async function getReaderRelations(doc: { slug: string; version?: { id: string } }): Promise<ReaderRelation[]> {
  if (fixtureDataEnabled()) return (await getVerifiedRelations(doc.slug)).map((r) => {
    const outgoing = r.sourceSlug === doc.slug;
    return { id: r.id, type: r.type, direction: outgoing ? "outgoing" : "incoming", label: outgoing ? r.targetLabel : r.sourceLabel, href: readerUrl(outgoing ? r.targetSlug : r.sourceSlug), evidence: r.evidence, versionSpecific: false };
  });
  // Reuse the public checks (including evidence and both endpoints), then retain version scope.
  const visible = await listApiRelations(doc.slug, "both");
  if (!visible?.length) return [];
  const rows = await getDb().select().from(legalRelations).where(inArray(legalRelations.id, visible.map((r) => r.id)));
  const nodeIds = rows.flatMap((r) => [r.sourceNodeId, r.targetNodeId].filter((id): id is string => Boolean(id)));
  const nodes = nodeIds.length ? await getDb().select({ id: normNodes.id, versionId: normNodes.versionId, label: normNodes.label }).from(normNodes).where(inArray(normNodes.id, nodeIds)) : [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const slugs = [...new Set(visible.flatMap((r) => [r.source.normSlug, r.target.normSlug]))];
  const labels = await getDb().select({ slug: norms.slug, type: norms.type, number: norms.number }).from(norms).where(inArray(norms.slug, slugs));
  const names = new Map(labels.map((n) => [n.slug, `${n.type} ${n.number}`]));
  const records = new Map(rows.map((r) => [r.id, r]));
  return visible.flatMap((r): ReaderRelation[] => {
    const raw = records.get(r.id);
    if (!raw || raw.status !== "verified") return [];
    const outgoing = r.source.normSlug === doc.slug;
    const own = outgoing ? r.source : r.target, target = outgoing ? r.target : r.source;
    const ownNode = nodeMap.get((outgoing ? raw.sourceNodeId : raw.targetNodeId) ?? "");
    const ownVersion = (outgoing ? raw.sourceVersionId : raw.targetVersionId) ?? ownNode?.versionId;
    if (ownVersion && ownVersion !== doc.version?.id) return [];
    const targetNode = nodeMap.get((outgoing ? raw.targetNodeId : raw.sourceNodeId) ?? "");
    const targetVersion = (outgoing ? raw.targetVersionId : raw.sourceVersionId) ?? targetNode?.versionId;
    return [{ id: r.id, type: r.type, direction: outgoing ? "outgoing" : "incoming", label: `${names.get(target.normSlug) ?? target.normSlug}${targetNode ? ` · ${targetNode.label}` : ""}`, href: readerUrl(target.normSlug, targetVersion ?? undefined, target.stableKey), ownStableKey: own.stableKey, versionSpecific: Boolean(ownVersion), evidence: r.evidence, fragment: r.evidenceFragment }];
  });
}

export async function getReaderChanges(slug: string, versionId: string): Promise<ReaderChanges | undefined> {
  const versions = await getReaderVersions(slug);
  const index = versions.findIndex((v) => v.id === versionId);
  if (index < 1) return;
  const from = versions[index - 1], to = versions[index];
  const [before, after] = await Promise.all([getVersion(slug, from.id), getVersion(slug, to.id)]);
  if (!before || !after) return;
  return { from, to, changes: compareVersions(before, after).changes.map((c) => ({ key: c.key, kind: c.kind, label: c.after?.label ?? c.before?.label ?? `Artículo ${c.after?.number ?? c.before?.number}` })) };
}
