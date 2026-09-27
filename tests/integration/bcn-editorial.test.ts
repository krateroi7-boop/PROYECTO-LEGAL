import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { auditLogs, documentIdentifiers, editorialDecisions, importBatches, normVersions, norms, searchDocuments, sourceDocuments, sourcePolicies } from "@/db/schema";
import { approveImportBatch, publishImportBatch } from "@/ingestion/editorial/workflow";
import { importBcnStaging } from "@/ingestion/sources/bcn-leychile/import";
import { parseBcnNorm } from "@/ingestion/sources/bcn-leychile/parser";
import { stageBcnSnapshot } from "@/ingestion/sources/bcn-leychile/staging";
import { FilesystemRawStorage } from "@/ingestion/storage";

describe.skipIf(!process.env.DATABASE_URL)("BCN proposals and independent editorial publication", () => {
  const externalId = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const slug = `test-bcn-editorial-${randomUUID()}`;
  const syntheticSourceKey = `test-editorial-${randomUUID()}`;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "legisdata-editorial-db-"));
    vi.stubEnv("LEGISDATA_STORAGE_ROOT", join(directory, "objects"));
  });

  afterEach(async () => {
    const db = getDb();
    const normRows = await db.select({ id: norms.id }).from(norms).where(eq(norms.slug, slug));
    const sourceRows = await db.select({ id: sourceDocuments.id }).from(sourceDocuments).where(eq(sourceDocuments.sourceIdentifier, externalId));
    const normIds = normRows.map((row) => row.id);
    const sourceIds = sourceRows.map((row) => row.id);
    if (normIds.length) {
      const batches = await db.select({ id: importBatches.id }).from(importBatches).where(inArray(importBatches.normId, normIds));
      if (batches.length) await db.delete(auditLogs).where(inArray(auditLogs.entityId, batches.map((batch) => batch.id)));
      await db.delete(importBatches).where(inArray(importBatches.normId, normIds));
      await db.delete(documentIdentifiers).where(inArray(documentIdentifiers.normId, normIds));
      await db.delete(norms).where(inArray(norms.id, normIds));
    }
    if (sourceIds.length) await db.delete(sourceDocuments).where(inArray(sourceDocuments.id, sourceIds));
    await db.delete(sourcePolicies).where(eq(sourcePolicies.sourceKey, syntheticSourceKey));
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  afterAll(closeDb);

  it("imports once under concurrency, preserves evidence, and publishes only after separate source approval without inventing legal dates", async () => {
    const raw = JSON.stringify({ html: [{ i: 101, t: `<div class="p">Artículo único. Regla. Texto de prueba ${externalId}.</div>` }] });
    const snapshot = parseBcnNorm(raw, {
      normId: externalId, slug, type: "Ley", number: externalId, title: "Título de la representación propuesta",
      publishedAt: "2003-05-29T00:00:00.000Z", versionDate: "2026-02-05T00:00:00.000Z",
      sourceUrl: "https://example.test/synthetic-source", capturedAt: "2026-09-18T00:00:00.000Z",
    });
    const staged = await stageBcnSnapshot(join(directory, "staging"), raw, snapshot);
    const imported = await Promise.all([importBcnStaging(staged.directory), importBcnStaging(staged.directory)]);
    expect(imported.map((result) => result.status).sort()).toEqual(["pending_review", "skipped"]);
    expect(imported[0].batchId).toBe(imported[1].batchId);
    const db = getDb();
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, imported[0].batchId));
    const [version] = await db.select().from(normVersions).where(eq(normVersions.id, batch.proposedVersionId!));
    const [source] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, batch.sourceDocumentId!));
    const [norm] = await db.select().from(norms).where(eq(norms.id, batch.normId!));
    expect(version.validFrom).toBeNull();
    expect(version.sourceVersionDate?.toISOString()).toBe("2026-02-05T00:00:00.000Z");
    expect(norm.status).toBe("desconocida");
    expect((await new FilesystemRawStorage().get(source.storageKey!)).content).toBe(raw);
    expect(source.sourceKey).toBe("bcn-leychile");

    // Synthetic policy tests never authorize BCN or change its policy in the test database.
    await db.update(sourceDocuments).set({ sourceKey: syntheticSourceKey }).where(eq(sourceDocuments.id, source.id));
    await db.update(norms).set({ title: "Título publicado anterior" }).where(eq(norms.id, norm.id));
    const oldLegalEnd = new Date("2030-01-01T00:00:00.000Z");
    const [oldVersion] = await db.insert(normVersions).values({
      normId: norm.id, versionLabel: "old-published", validFrom: new Date("2003-01-01"), validTo: oldLegalEnd,
      isCurrent: true, publicationStatus: "published", publishedAt: new Date("2020-01-01"),
    }).returning();
    await approveImportBatch(batch.id, "synthetic-reviewer", "Test editorial approval");
    await expect(publishImportBatch(batch.id, "synthetic-admin")).rejects.toThrow("reviewed usage policy");
    expect((await db.select().from(normVersions).where(eq(normVersions.id, oldVersion.id)))[0].isCurrent).toBe(true);
    expect((await db.select().from(norms).where(eq(norms.id, norm.id)))[0].title).toBe("Título publicado anterior");

    await db.insert(sourcePolicies).values({
      sourceKey: syntheticSourceKey, publicationAllowed: true, reviewedBy: "synthetic-reviewer",
      evidenceUrl: "https://example.test/synthetic-terms", reviewedAt: new Date("2020-01-01"),
    });
    await writeFile(join(directory, "objects", source.storageKey!), "corrupted evidence");
    await expect(publishImportBatch(batch.id, "synthetic-admin")).rejects.toThrow("checksum does not match");
    expect((await db.select().from(importBatches).where(eq(importBatches.id, batch.id)))[0].status).toBe("approved");
    await writeFile(join(directory, "objects", source.storageKey!), raw);

    const publications = await Promise.allSettled([publishImportBatch(batch.id, "synthetic-admin"), publishImportBatch(batch.id, "synthetic-admin")]);
    expect(publications.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [oldAfter] = await db.select().from(normVersions).where(eq(normVersions.id, oldVersion.id));
    const [newAfter] = await db.select().from(normVersions).where(eq(normVersions.id, version.id));
    expect(oldAfter.isCurrent).toBe(false);
    expect(oldAfter.validTo).toEqual(oldLegalEnd);
    expect(newAfter.validFrom).toBeNull();
    expect(newAfter.publicationStatus).toBe("published");
    expect(newAfter.isCurrent).toBe(true);
    expect((await db.select().from(norms).where(eq(norms.id, norm.id)))[0].title).toBe(snapshot.norm.title);
    const indexed = await db.select().from(searchDocuments).where(and(eq(searchDocuments.normId, norm.id), eq(searchDocuments.documentType, "norm")));
    expect(indexed).toHaveLength(1);
    expect(indexed[0].title).toBe(snapshot.norm.title);
    const decisions = await db.select().from(editorialDecisions).where(and(eq(editorialDecisions.batchId, batch.id), eq(editorialDecisions.action, "publish")));
    expect(decisions).toHaveLength(1);
    expect(decisions[0].metadata).toMatchObject({ sourceKey: syntheticSourceKey, usageEvidenceUrl: "https://example.test/synthetic-terms" });
  }, 30000);
});
