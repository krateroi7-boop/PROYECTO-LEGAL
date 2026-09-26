import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { importBatches, normEvents, normNodes, normVersions, norms, searchDocuments, sourceDocuments } from "@/db/schema";
import { validateFixture } from "@/domain/legislation/validate";

export async function importFixture(path: string) {
  const raw = await readFile(path, "utf8");
  const checksum = createHash("sha256").update(raw).digest("hex");
  const fixture = validateFixture(JSON.parse(raw));
  const db = getDb();
  const existing = await db.select().from(importBatches).where(eq(importBatches.checksum, checksum)).limit(1);
  if (existing[0]?.status === "published") return { status: "skipped", checksum };

  const [batch] = await db.insert(importBatches).values({
    checksum,
    status: "validated",
    itemCount: fixture.laws.length,
  }).returning();

  try {
    await db.transaction(async (tx) => {
      const [insertedSource] = await tx.insert(sourceDocuments).values({
        sourceName: fixture.source.name,
        sourceUrl: fixture.source.url,
        checksum,
        parser: "local-fixture-v1",
        capturedAt: new Date(fixture.source.capturedAt),
      }).onConflictDoNothing().returning();
      const source = insertedSource ?? (await tx.select().from(sourceDocuments).where(eq(sourceDocuments.checksum, checksum)).limit(1))[0];

      for (const law of fixture.laws) {
        const [insertedNorm] = await tx.insert(norms).values({
          slug: law.slug,
          type: law.type,
          number: law.number,
          title: law.title,
          shortTitle: law.shortTitle,
          description: law.description,
          status: law.status === "Modificada" ? "modificada" : "vigente",
          topics: law.topics,
          publishedAt: parseSpanishDate(law.published),
          updatedAt: parseSpanishDate(law.updated.replace("Última modificación: ", "")),
        }).onConflictDoNothing().returning();
        const norm = insertedNorm ?? (await tx.select().from(norms).where(eq(norms.slug, law.slug)).limit(1))[0];
        if (!norm) throw new Error(`Unable to resolve norm after import: ${law.slug}`);

        if (!insertedNorm) {
          await tx.update(norms).set({
            type: law.type,
            number: law.number,
            title: law.title,
            shortTitle: law.shortTitle,
            description: law.description,
            status: law.status === "Modificada" ? "modificada" : "vigente",
            topics: law.topics,
            publishedAt: parseSpanishDate(law.published),
            updatedAt: parseSpanishDate(law.updated.replace("Última modificación: ", "")),
          }).where(eq(norms.id, norm.id));
        }

        const validFrom = parseSpanishDate(law.published);
        const versionLabel = `fixture-${checksum.slice(0, 12)}`;
        const [existingVersion] = await tx.select().from(normVersions).where(
          and(eq(normVersions.normId, norm.id), eq(normVersions.versionLabel, versionLabel)),
        ).limit(1);
        if (existingVersion) continue;

        const currentVersions = await tx.select().from(normVersions).where(
          and(eq(normVersions.normId, norm.id), eq(normVersions.isCurrent, true)),
        );
        for (const currentVersion of currentVersions) {
          await tx.update(normVersions).set({
            isCurrent: false,
            validTo: validFrom,
          }).where(eq(normVersions.id, currentVersion.id));
        }

        const [version] = await tx.insert(normVersions).values({
          normId: norm.id,
          versionLabel,
          validFrom,
          isCurrent: true,
          kind: "consolidated",
          publicationStatus: "published",
          publishedAt: new Date(),
          publishedBy: "fixture-import",
          sourceDocumentId: source?.id,
        }).returning();

        await tx.insert(normEvents).values({
          normId: norm.id,
          versionId: version.id,
          sourceDocumentId: source?.id,
          type: "published",
          eventDate: validFrom,
          description: `Versión importada desde ${fixture.source.name}.`,
        });

        const insertedNodes = await tx.insert(normNodes).values(law.articles.map((article, position) => ({
          versionId: version.id,
          stableKey: article.id,
          type: "articulo" as const,
          label: `Artículo ${article.number}`,
          title: article.title,
          text: article.paragraphs.join("\n\n"),
          position,
        }))).returning();
        await tx.delete(searchDocuments).where(eq(searchDocuments.normId, norm.id));

        await tx.insert(searchDocuments).values([
          {
            normId: norm.id,
            versionId: version.id,
            documentType: "norm",
            slug: norm.slug,
            number: norm.number,
            type: norm.type,
            title: norm.title,
            topics: law.topics.join(" "),
            content: `${norm.description}\n${law.articles.map((article) => article.paragraphs.join(" ")).join("\n")}`,
          },
          ...law.articles.map((article, index) => ({
            normId: norm.id,
            versionId: version.id,
            nodeId: insertedNodes[index]?.id,
            documentType: "node" as const,
            slug: norm.slug,
            number: norm.number,
            type: norm.type,
            title: article.title ?? `Artículo ${article.number}`,
            topics: law.topics.join(" "),
            nodeLabel: article.id,
            content: article.paragraphs.join("\n"),
          })),
        ]);
      }
      await tx.update(importBatches).set({ status: "published", completedAt: new Date() }).where(eq(importBatches.id, batch.id));
    });
  } catch (error) {
    await db.update(importBatches).set({ status: "publication_failed", error: error instanceof Error ? error.message : "Unknown import error", completedAt: new Date() }).where(eq(importBatches.id, batch.id));
    throw error;
  }
  return { status: "published", checksum };
}

function parseSpanishDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = value.match(/(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i);
  if (!match) throw new Error(`Unsupported date: ${value}`);
  const months: Record<string, number> = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
  const month = months[match[2].toLowerCase()];
  if (month === undefined) throw new Error(`Unsupported month: ${match[2]}`);
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}
