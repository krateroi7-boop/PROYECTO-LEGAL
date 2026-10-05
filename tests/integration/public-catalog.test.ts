import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { documentIdentifiers, norms, normVersions, sourceDocuments, sourcePolicies } from "@/db/schema";
const selection = vi.hoisted(() => ({ entries: [] as { source: string; externalId: string; name: string; slug: string; evidenceUrl: string }[] }));
vi.mock("@/sources/corpus", async (actual) => ({ ...await actual<object>(), publicCorpus: selection.entries }));
import { getPublicCatalog } from "@/lib/public-catalog";
const key = `catalog-synthetic-${randomUUID()}`;
let normId: string, sourceId: string, versionId: string;
describe.skipIf(!process.env.DATABASE_URL)("catalog projection respects public source and version boundaries", () => {
  beforeAll(async () => {
    selection.entries.push({ source: key, externalId: "123", name: "Norma sintética de catálogo", slug: "planned-synthetic", evidenceUrl: "https://example.test/selection" });
    const db = getDb();
    const [source] = await db.insert(sourceDocuments).values({ sourceKey: key, sourceName: "Synthetic catalog source", sourceUrl: "https://example.test/document", checksum: key, parser: "integration", capturedAt: new Date() }).returning(); sourceId = source.id;
    const [norm] = await db.insert(norms).values({ slug: key, type: "Ley", number: "123", title: "Norma sintética", shortTitle: "Norma sintética", description: "Test", status: "desconocida", topics: [], publishedAt: new Date(), updatedAt: new Date() }).returning(); normId = norm.id;
    const [version] = await db.insert(normVersions).values({ normId, sourceDocumentId: sourceId, versionLabel: "Test", publicationStatus: "pending_review", isCurrent: true }).returning(); versionId = version.id;
    await db.insert(documentIdentifiers).values({ sourceKey: key, externalId: "123", normId });
    await db.insert(sourcePolicies).values({ sourceKey: key, publicationAllowed: true, evidenceUrl: "https://example.test/synthetic-permission", reviewedBy: "test", reviewedAt: new Date("2020-01-01") });
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(documentIdentifiers).where(eq(documentIdentifiers.sourceKey, key));
    if(normId) await db.delete(norms).where(eq(norms.id, normId));
    if(sourceId) await db.delete(sourceDocuments).where(eq(sourceDocuments.id, sourceId));
    await db.delete(sourcePolicies).where(eq(sourcePolicies.sourceKey, key)); await closeDb();
  });
  it("keeps pending text unlinked, links a public version by its stable slug, and withdraws the link upon revocation", async () => {
    expect((await getPublicCatalog())[0].readerSlug).toBeUndefined();
    await getDb().update(normVersions).set({ publicationStatus: "published" }).where(eq(normVersions.id, versionId));
    expect((await getPublicCatalog())[0].readerSlug).toBe(key);
    await getDb().update(sourcePolicies).set({ publicationAllowed: false }).where(eq(sourcePolicies.sourceKey, key));
    expect((await getPublicCatalog())[0].readerSlug).toBeUndefined();
  });
});
