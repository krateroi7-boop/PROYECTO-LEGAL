import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, editorialDecisions, importBatches, normNodes, normVersions, norms, sourceDocuments } from "@/db/schema";
import { normalizeBcnSnapshot } from "./normalizer";
import { validateNormalizedBcnDocument } from "./validator";
import type { BcnStagingSnapshot } from "./types";

export async function importBcnStaging(directory: string) {
  const raw = await readFile(`${directory}/source.json`, "utf8");
  const snapshot = JSON.parse(await readFile(`${directory}/snapshot.json`, "utf8")) as BcnStagingSnapshot;
  const checksum = createHash("sha256").update(raw).digest("hex");
  if (checksum !== snapshot.source.checksum) throw new Error("BCN staging checksum does not match source.json.");
  const normalized = normalizeBcnSnapshot(snapshot);
  const validation = validateNormalizedBcnDocument(normalized);
  const db = getDb();
  const existing = await db.select().from(importBatches).where(eq(importBatches.checksum, checksum)).limit(1);
  if (existing[0]) return { status: "skipped", batchId: existing[0].id, checksum, validation };
  if (!validation.valid) throw new Error(`BCN document validation failed: ${validation.errors.join("; ")}`);

  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(importBatches).values({
      checksum,
      status: "captured",
      itemCount: normalized.nodes.length,
      parserVersion: snapshot.source.parser,
    }).returning();
    const [source] = await tx.insert(sourceDocuments).values({
      sourceName: snapshot.source.name,
      sourceIdentifier: snapshot.norm.normId,
      sourceUrl: snapshot.source.url,
      format: "application/json",
      checksum,
      parser: snapshot.source.parser,
      parserVersion: snapshot.source.parser,
      capturedAt: new Date(snapshot.source.capturedAt),
      storageKey: `${snapshot.norm.slug}/source.json`,
    }).returning();
    const [existingNorm] = await tx.select().from(norms).where(eq(norms.slug, snapshot.norm.slug)).limit(1);
    const norm = existingNorm ?? (await tx.insert(norms).values({
      slug: snapshot.norm.slug,
      type: "Ley",
      number: snapshot.norm.number,
      title: snapshot.norm.title,
      shortTitle: snapshot.norm.title,
      description: `Norma sincronizada desde ${snapshot.source.name}.`,
      status: "vigente",
      topics: [],
      publishedAt: new Date(snapshot.norm.publishedAt),
      updatedAt: new Date(snapshot.norm.publishedAt),
    }).returning())[0];
    if (!norm) throw new Error("Unable to create or resolve BCN norm.");
    const versionLabel = `bcn-${checksum.slice(0, 12)}`;
    const [version] = await tx.insert(normVersions).values({
      normId: norm.id,
      versionLabel,
      validFrom: new Date(snapshot.norm.publishedAt),
      isCurrent: false,
      kind: "consolidated",
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
