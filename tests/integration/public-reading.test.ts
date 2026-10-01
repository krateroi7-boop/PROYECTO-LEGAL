import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { annotations, favorites, legalRelations, normNodes, normVersions, norms, searchDocuments, sourceDocuments, sourceObservations, sourcePolicies, users } from "@/db/schema";
import { getApiArticle, getApiNormDetail, listApiNorms, listApiRelations, listApiVersions } from "@/db/repositories/api";
import { getPersistedLaw, listPersistedLaws } from "@/db/repositories/laws";
import { getVersion, getVersions } from "@/lib/versioning-data";
import { getVerifiedRelations } from "@/lib/relations-data";
import { compareVersions } from "@/domain/versioning/compare";
import { GET as getVersionRoute } from "@/app/api/v1/normas/[slug]/versiones/[versionId]/route";
import { GET as getNormRoute } from "@/app/api/v1/normas/[slug]/route";
import { createAnnotation, toggleFavorite, deleteAnnotationAction } from "@/app/actions/personal";
import { getReaderDocument, getReaderRelations, getReaderVersions } from "@/lib/reader/data";
import { loadReaderPersonal, loadReaderRelations, loadReaderChanges } from "@/app/actions/reader";
import { searchPersisted } from "@/db/repositories/search";
import { listFavorites, listAnnotations } from "@/db/repositories/users";

const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: actor.id } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const run = randomUUID();
const slug = `public-${run}`;
const hiddenSlug = `hidden-${run}`;
const otherSlug = `other-${run}`;
const sourceKey = `public-source-${run}`;
const normIds: string[] = [];
let sourceId: string;
let originalId: string;
let currentId: string;
let draftId: string;
let relationId: string;

// Run against a disposable, migrated database. No network or fixture corpus needed.
describe.skipIf(!process.env.DATABASE_URL)("Public reading preserves editorial boundaries", () => {
  beforeAll(async () => {
    const db = getDb();
    actor.id = `public-reader-${run}`;
    await db.insert(users).values({ id: actor.id, name: "Public reading integration" });
    const [source] = await db.insert(sourceDocuments).values({
      sourceName: "Fuente de prueba", sourceUrl: "https://example.org/norma", checksum: run,
      parser: "integration", capturedAt: new Date("2026-01-01T00:00:00Z"),
    }).returning();
    sourceId = source.id;
    for (const [index, currentSlug] of [slug, hiddenSlug, otherSlug].entries()) {
      const [norm] = await db.insert(norms).values({
        slug: currentSlug, type: "Ley", number: `${run}-${index}`, title: `Norma ${index}`,
        shortTitle: `Norma ${index}`, description: "Prueba de lecturas públicas", status: "derogada",
        topics: [], publishedAt: new Date("2000-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
      }).returning();
      normIds.push(norm.id);
    }
    const versions = await db.insert(normVersions).values([
      { normId: normIds[0], versionLabel: "Original", validFrom: new Date("2000-01-01T00:00:00Z"), publicationStatus: "published", sourceDocumentId: sourceId },
      { normId: normIds[0], versionLabel: "Copia publicada", validFrom: null, isCurrent: true, publicationStatus: "published", sourceDocumentId: sourceId },
      { normId: normIds[0], versionLabel: "Contenido pendiente", validFrom: new Date("2027-01-01T00:00:00Z"), publicationStatus: "pending_review" },
      { normId: normIds[1], versionLabel: "Oculta", validFrom: null, publicationStatus: "pending_review" },
      { normId: normIds[2], versionLabel: "Publicada", validFrom: null, isCurrent: true, publicationStatus: "published" },
    ]).returning();
    [originalId, currentId, draftId] = versions.map((version) => version.id);
    const [header] = await db.insert(normNodes).values({ versionId: currentId, stableKey: "titulo-1", type: "titulo", label: "Título I", text: "", position: 0 }).returning();
    const nodes = await db.insert(normNodes).values([
      { versionId: originalId, stableKey: "articulo-1", type: "articulo", label: "Artículo 1", text: "Texto original", position: 0 },
      { versionId: currentId, parentId: header.id, stableKey: "articulo-1", type: "articulo", label: "Artículo 1", text: "Texto publicado", position: 1 },
      { versionId: draftId, stableKey: "articulo-1", type: "articulo", label: "Artículo 1", text: "Texto pendiente de aprobación", position: 0 },
    ]).returning();
    const relations = await db.insert(legalRelations).values([
      { sourceNormId: normIds[2], targetNormId: normIds[0], type: "cita", status: "verified", evidence: "Relación pública entrante", method: "manual" },
      { sourceNormId: normIds[0], targetNormId: normIds[1], type: "cita", status: "verified", evidence: "No revelar norma pendiente", method: "manual" },
      { sourceNormId: normIds[0], targetNormId: normIds[2], sourceVersionId: draftId, type: "cita", status: "verified", evidence: "No revelar versión pendiente", method: "manual" },
      { sourceNormId: normIds[0], targetNormId: normIds[2], sourceNodeId: nodes[2].id, type: "cita", status: "verified", evidence: "No revelar nodo pendiente", method: "manual" },
      { sourceNormId: normIds[0], targetNormId: normIds[2], type: "cita", status: "pending", evidence: "No revelar relación pendiente", method: "manual" },
    ]).returning();
    relationId = relations[0].id;
  });

  afterAll(async () => {
    const db = getDb();
    if (normIds.length) await db.delete(norms).where(inArray(norms.id, normIds));
    if (sourceId) await db.delete(sourceObservations).where(eq(sourceObservations.sourceDocumentId, sourceId));
    if (sourceId) await db.delete(sourceDocuments).where(eq(sourceDocuments.id, sourceId));
    await db.delete(sourcePolicies).where(eq(sourcePolicies.sourceKey, sourceKey));
    await db.delete(users).where(eq(users.id, actor.id));
    await closeDb();
  });

  it("does not expose unpublished-only norms in API, web catalog, history or relations", async () => {
    expect((await listApiNorms()).some((norm) => norm.slug === hiddenSlug)).toBe(false);
    expect((await listPersistedLaws()).some((norm) => norm.slug === hiddenSlug)).toBe(false);
    expect(await getApiNormDetail(hiddenSlug)).toBeUndefined();
    expect(await getPersistedLaw(hiddenSlug)).toBeUndefined();
    expect(await listApiVersions(hiddenSlug)).toBeUndefined();
    expect(await listApiRelations(hiddenSlug)).toBeUndefined();
  });

  it("search returns the real stableKey when it differs from the article label", async () => {
    const [node] = await getDb().select().from(normNodes).where(eq(normNodes.versionId, originalId));
    await getDb().insert(searchDocuments).values({ normId: normIds[0], versionId: originalId, nodeId: node.id, documentType: "node", slug, number: `${run}-0`, type: "Ley", title: "Norma pública", nodeLabel: node.label, topics: "", content: node.text });
    const [result] = await searchPersisted({ number: `${run}-0`, article: "1" });
    expect(result.node).toEqual({ stableKey: "articulo-1", label: "Artículo 1" });
    expect(result.versionId).toBe(originalId);
    expect((await getApiArticle(slug, result.node!.stableKey, result.versionId!))?.text).toBe("Texto original");
  });

  it("rejects pending versions even when the caller knows their UUID", async () => {
    expect(await getApiNormDetail(slug, draftId)).toBeUndefined();
    expect(await getApiArticle(slug, "articulo-1", draftId)).toBeUndefined();
    expect(await getVersion(slug, draftId)).toBeUndefined();
    expect((await listApiVersions(slug))?.map((version) => version.id)).not.toContain(draftId);
    expect(await getVersion(slug, "not-a-uuid")).toBeUndefined();
    const response = await getVersionRoute(new Request("http://localhost/api/version"), { params: Promise.resolve({ slug, versionId: draftId }) });
    expect(response.status).toBe(404);
  });

  it("reads persisted versions, structure and provenance without labeling a repealed norm as current law", async () => {
    const law = await getPersistedLaw(slug);
    expect(law?.status).toBe("Derogada");
    expect(law?.versionId).toBe(currentId);
    expect(law?.provenance?.sourceDocumentId).toBe(sourceId);
    expect(law?.articles.map((node) => node.id)).toEqual(["titulo-1", "articulo-1"]);
    expect(law?.updated).toBe("Fecha de inicio no informada");
    expect((await getApiArticle(slug, "articulo-1"))?.parentStableKey).toBe("titulo-1");
    const versions = await getVersions(slug);
    expect(versions).toHaveLength(2);
    const from = versions.find((version) => version.id === originalId)!;
    const to = versions.find((version) => version.id === currentId)!;
    expect(compareVersions(from, to).summary.modified).toBe(1);
  });

  it("includes verified incoming relations and excludes unpublished endpoints, versions and nodes", async () => {
    expect(await listApiRelations(slug)).toEqual([]);
    const relations = await getVerifiedRelations(slug);
    expect(relations.map((relation) => relation.id)).toEqual([relationId]);
    expect(relations[0].sourceSlug).toBe(otherSlug);
    expect(relations[0].targetSlug).toBe(slug);
  });

  it("pins notes and favorites to the displayed published version and rejects draft targets", async () => {
    const form = new FormData();
    form.set("slug", slug);
    form.set("stableKey", "articulo-1");
    form.set("versionId", originalId);
    form.set("content", "Anotación sobre el texto original");
    await createAnnotation(form);
    await toggleFavorite(form);
    const [note] = await getDb().select().from(annotations).where(eq(annotations.userId, actor.id));
    const [favorite] = await getDb().select().from(favorites).where(eq(favorites.userId, actor.id));
    expect(note.versionId).toBe(originalId);
    expect(favorite.versionId).toBe(originalId);
    form.set("versionId", draftId);
    await expect(createAnnotation(form)).rejects.toThrow("publicada");
    await expect(toggleFavorite(form)).rejects.toThrow("publicada");
  });

  it("reader preserves hierarchy and exposes only public summaries and matching version relations", async () => {
    const doc = (await getReaderDocument(slug))!;
    expect(doc.demonstration).toBe(false);
    expect(doc.nodes.find((n) => n.stableKey === "articulo-1")?.parentStableKey).toBe("titulo-1");
    expect((await getReaderVersions(slug)).map((v) => v.id)).not.toContain(draftId);
    const [historicalRelation] = await getDb().insert(legalRelations).values({ sourceNormId: normIds[0], sourceVersionId: originalId, targetNormId: normIds[2], type: "cita", status: "verified", evidence: "Sólo original", method: "manual" }).returning();
    expect((await getReaderRelations(doc)).map((r) => r.id)).not.toContain(historicalRelation.id);
    expect((await getReaderRelations((await getReaderDocument(slug, originalId))!)).map((r) => r.id)).toContain(historicalRelation.id);
    await expect(loadReaderRelations({ slug, versionId: draftId })).rejects.toThrow("no disponible");
    await expect(loadReaderChanges({ slug, versionId: draftId })).rejects.toThrow("no disponible");
    await expect(loadReaderPersonal({ slug, versionId: currentId, stableKey: "missing" })).rejects.toThrow("no disponible");
  });

  it("reader loads only the authenticated user's notes for the exact version and node", async () => {
    const original = await loadReaderPersonal({ slug, versionId: originalId, stableKey: "articulo-1" });
    expect(original.favorite).toBe(true);
    expect(original.notes).toHaveLength(1);
    expect((await loadReaderPersonal({ slug, versionId: currentId, stableKey: "articulo-1" })).notes).toEqual([]);
    const owner = actor.id;
    actor.id = "unrelated-reader";
    const remove = new FormData(); remove.set("id", original.notes[0].id);
    await deleteAnnotationAction(remove);
    expect((await loadReaderPersonal({ slug, versionId: originalId, stableKey: "articulo-1" })).notes).toEqual([]);
    actor.id = owner;
    expect((await loadReaderPersonal({ slug, versionId: originalId, stableKey: "articulo-1" })).notes).toHaveLength(1);
    const [favorite] = await listFavorites(owner), [note] = await listAnnotations(owner);
    expect(favorite.context?.article).toBe("Artículo 1");
    expect(favorite.context?.href).toBe(`/normas/${slug}/versiones/${originalId}#articulo-1`);
    expect(note.context?.version?.dateLabel).toBe("1 de enero de 2000");
    expect(await listFavorites("unrelated-reader")).toEqual([]);
    expect(await listAnnotations("unrelated-reader")).toEqual([]);
    const [general] = await getDb().insert(favorites).values({ userId: owner, normId: normIds[0] }).returning();
    expect((await listFavorites(owner)).find((f) => f.id === general.id)?.context?.href).toBe(`/normas/${slug}`);
    await getDb().delete(favorites).where(eq(favorites.id, general.id));
  });

  it("reports successful checks of the exact captured representation, excluding cache events and failures", async () => {
    await getDb().insert(sourceObservations).values([
      { sourceKey, cacheKey: run, sourceDocumentId: sourceId, observedAt: new Date("2026-01-02T00:00:00Z"), operation: "resolve", eventKind: "upstream", outcome: "not_modified", httpStatus: 304 },
      { sourceKey, cacheKey: run, sourceDocumentId: sourceId, observedAt: new Date("2026-01-03T00:00:00Z"), operation: "resolve", eventKind: "cache_hit", outcome: "captured", httpStatus: 200 },
      { sourceKey, cacheKey: run, sourceDocumentId: sourceId, observedAt: new Date("2026-01-04T00:00:00Z"), operation: "resolve", eventKind: "upstream", outcome: "error", httpStatus: 503 },
    ]);
    expect((await getReaderDocument(slug))?.checkedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("withdraws already-published versions from public reads and search when source permission is blocked", async () => {
    const db = getDb();
    await db.update(sourceDocuments).set({ sourceKey }).where(eq(sourceDocuments.id, sourceId));
    expect(await getApiNormDetail(slug)).toBeUndefined();
    await db.insert(sourcePolicies).values({ sourceKey, publicationAllowed: true, evidenceUrl: "https://example.org/permission", reviewedBy: actor.id, reviewedAt: new Date("2020-01-01T00:00:00Z") });
    await db.insert(searchDocuments).values({ normId: normIds[0], versionId: currentId, documentType: "norm", slug, number: `${run}-0`, type: "Ley", title: "Norma pública", topics: "", content: "Texto publicado" });
    expect((await getApiNormDetail(slug))?.currentVersion?.id).toBe(currentId);
    expect((await searchPersisted({ number: `${run}-0` }))).toHaveLength(1);
    const request = new Request(`http://localhost/api/v1/normas/${slug}`);
    const response = await getNormRoute(request, { params: Promise.resolve({ slug }) });
    expect(response.headers.get("cache-control")).toBe("private, no-cache, must-revalidate");
    const conditional = new Request(request, { headers: { "if-none-match": response.headers.get("etag")! } });
    expect((await getNormRoute(conditional, { params: Promise.resolve({ slug }) })).status).toBe(304);

    await db.update(sourcePolicies).set({ publicationAllowed: false }).where(eq(sourcePolicies.sourceKey, sourceKey));
    const withdrawn = await getNormRoute(conditional, { params: Promise.resolve({ slug }) });
    expect(withdrawn.status).toBe(404);
    expect(withdrawn.headers.get("cache-control")).toBe("no-store");
    expect(await getApiNormDetail(slug)).toBeUndefined();
    expect(await getApiNormDetail(slug, currentId)).toBeUndefined();
    expect(await getReaderDocument(slug, currentId)).toBeUndefined();
    await expect(loadReaderPersonal({ slug, versionId: originalId })).rejects.toThrow("no disponible");
    await expect(loadReaderRelations({ slug, versionId: currentId })).rejects.toThrow("no disponible");
    expect(await getApiArticle(slug, "articulo-1", originalId)).toBeUndefined();
    expect(await listApiVersions(slug)).toBeUndefined();
    expect(await getVersion(slug, originalId)).toBeUndefined();
    expect(await getPersistedLaw(slug)).toBeUndefined();
    expect((await listApiNorms()).some((norm) => norm.slug === slug)).toBe(false);
    expect(await getVerifiedRelations(otherSlug)).toEqual([]);
    expect(await searchPersisted({ number: `${run}-0` })).toEqual([]);
    const form = new FormData();
    form.set("slug", slug);
    form.set("versionId", currentId);
    form.set("stableKey", "articulo-1");
    form.set("content", "La fuente está bloqueada");
    await expect(createAnnotation(form)).rejects.toThrow("publicada");
    // Existing notes survive policy changes and remain private to their owner.
    expect(await db.select().from(annotations).where(eq(annotations.userId, actor.id))).toHaveLength(1);
    expect((await listAnnotations(actor.id))[0].context).toBeNull();
    expect((await listFavorites(actor.id))[0].context).toBeNull();
  });
});
