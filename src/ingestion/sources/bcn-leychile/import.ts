import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, documentIdentifiers, editorialDecisions, importBatches, normNodes, normVersions, norms, sourceDocuments } from "@/db/schema";
import { FilesystemRawStorage, sourceObjectKey } from "@/ingestion/storage";
import { normalizeBcnSnapshot } from "./normalizer";
import { validateBcnImportMetadata } from "./metadata";
import { validateNormalizedBcnDocument } from "./validator";
import type { BcnStagingSnapshot } from "./types";

export async function importBcnStaging(directory: string) {
  const raw = await readFile(`${directory}/source.json`, "utf8");
  const snapshot = JSON.parse(await readFile(`${directory}/snapshot.json`, "utf8")) as BcnStagingSnapshot;
  const checksum = createHash("sha256").update(raw).digest("hex");
  if (checksum !== snapshot.source.checksum) throw new Error("BCN staging checksum does not match source.json.");
  const metadata = validateBcnImportMetadata(snapshot.norm);
  const normalized = normalizeBcnSnapshot(snapshot);
  const validation = validateNormalizedBcnDocument(normalized);
  if (!validation.valid) throw new Error(`BCN document validation failed: ${validation.errors.join("; ")}`);
  const object = await new FilesystemRawStorage().put(sourceObjectKey("bcn-leychile", metadata.normId, checksum, "json"), raw);
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`identity:bcn-leychile:${metadata.normId}`}, 0))`);
    const [existingSource] = await tx.select().from(sourceDocuments).where(and(
      eq(sourceDocuments.sourceKey, "bcn-leychile"),
      eq(sourceDocuments.sourceIdentifier, metadata.normId),
      eq(sourceDocuments.checksum, checksum),
      eq(sourceDocuments.parserVersion, snapshot.source.parser),
    )).limit(1);
    if (existingSource) {
      const [existingBatch] = await tx.select().from(importBatches).where(and(
        eq(importBatches.sourceDocumentId, existingSource.id),
        eq(importBatches.parserVersion, snapshot.source.parser),
      )).limit(1);
      if (existingBatch) return { status: "skipped", batchId: existingBatch.id, checksum, validation };
    }
    const [batch] = await tx.insert(importBatches).values({
      checksum,
      status: "captured",
      itemCount: normalized.nodes.length,
      parserVersion: snapshot.source.parser,
    }).returning();
    const source = existingSource ?? (await tx.insert(sourceDocuments).values({
      sourceName: snapshot.source.name,
      sourceKey: "bcn-leychile",
      normalizedContent: {
        sourceIdentifier: metadata.normId,
        type: metadata.type,
        number: metadata.number,
        title: metadata.title,
        publishedAt: metadata.publishedAt,
        versionDate: metadata.versionDate ?? null,
        status: metadata.status,
        sourceStatus: snapshot.norm.status ?? null,
        organisms: [],
        nodes: normalized.nodes.map((node) => ({ ...node, sourcePartId: node.sourcePartId === undefined ? null : String(node.sourcePartId) })),
        warnings: [...validation.warnings, "Experimental JSON parser: only recognizable articles are extracted; review the complete original before publication."],
      },
      sourceIdentifier: snapshot.norm.normId,
      sourceUrl: snapshot.source.url,
      format: "application/json",
      checksum,
      parser: snapshot.source.parser,
      parserVersion: snapshot.source.parser,
      capturedAt: new Date(snapshot.source.capturedAt),
      storageKey: object.key,
      originalObjectKey: object.key,
    }).returning())[0];
    const [identifier] = await tx.select().from(documentIdentifiers).where(and(
      eq(documentIdentifiers.sourceKey, "bcn-leychile"),
      eq(documentIdentifiers.externalId, metadata.normId),
    )).limit(1);
    const [existingNorm] = identifier ? await tx.select().from(norms).where(eq(norms.id, identifier.normId)).limit(1) : [];
    const norm = existingNorm ?? (await tx.insert(norms).values({
      slug: snapshot.norm.slug,
      type: metadata.type,
      number: snapshot.norm.number,
      title: snapshot.norm.title,
      shortTitle: snapshot.norm.title,
      description: `Norma sincronizada desde ${snapshot.source.name}.`,
      status: metadata.status,
      topics: [],
      publishedAt: new Date(snapshot.norm.publishedAt),
      updatedAt: new Date(metadata.versionDate ?? metadata.publishedAt),
    }).returning())[0];
    if (!norm) throw new Error("Unable to create or resolve BCN norm.");
    if (!identifier) await tx.insert(documentIdentifiers).values({ sourceKey: "bcn-leychile", externalId: metadata.normId, normId: norm.id });
    const versionLabel = `bcn-${checksum.slice(0, 12)}-${snapshot.source.parser}`;
    const [version] = await tx.insert(normVersions).values({
      normId: norm.id,
      versionLabel,
      validFrom: metadata.validFrom ? new Date(metadata.validFrom) : null,
      sourceVersionDate: metadata.versionDate ? new Date(metadata.versionDate) : null,
      isCurrent: false,
      kind: "proposed",
      publicationStatus: "pending_review",
      sourceDocumentId: source.id,
    }).returning();
    const nodes = await tx.insert(normNodes).values(normalized.nodes.map((node) => ({
      versionId: version.id,
      stableKey: node.stableKey,
      type: node.type,
      label: node.label,
      title: node.title,
      text: node.text,
      position: node.position,
    }))).returning();
    await tx.update(importBatches).set({
      status: "pending_review",
      sourceDocumentId: source.id,
      normId: norm.id,
      proposedVersionId: version.id,
    }).where(eq(importBatches.id, batch.id));
    await tx.insert(editorialDecisions).values({
      batchId: batch.id,
      normId: norm.id,
      versionId: version.id,
      action: "submit_review",
      previousStatus: "captured",
      newStatus: "pending_review",
      reason: "BCN snapshot normalized and validated.",
      metadata: { warnings: validation.warnings, nodeCount: nodes.length },
    });
    await tx.insert(auditLogs).values({
      action: "bcn.import.pending_review",
      entityType: "import_batch",
      entityId: batch.id,
      result: "success",
      metadata: { checksum, normId: norm.id, versionId: version.id },
    });
    return { status: "pending_review", batchId: batch.id, versionId: version.id, checksum, validation };
  });
}
