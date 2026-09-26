import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverBcnNorms } from "./discovery";
import { fetchBcnNorm } from "./client";
import { BCN_PARSER_VERSION } from "./config";
import { normalizeBcnSnapshot } from "./normalizer";
import { parseBcnNorm } from "./parser";
import { validateNormalizedBcnDocument } from "./validator";
import { importBcnStaging } from "./import";
import type { BcnPilotMetadata } from "./types";

export async function syncBcnNorms(options: { normIds?: string[]; outputDir?: string } = {}) {
  const discovery = await discoverBcnNorms();
  const ids = options.normIds ?? discovery.entries.map((entry) => entry.normId);
  const results: Array<{ normId: string; result: string; checksum?: string; error?: string }> = [];
  for (const normId of ids) {
    try {
      const capture = await fetchBcnNorm(normId);
      const slug = discovery.entries.find((entry) => entry.normId === normId)?.slug ?? `bcn-${normId}`;
      const outputDir = options.outputDir ?? ".staging/bcn-leychile";
      const metadata: BcnPilotMetadata = {
        normId,
        slug,
        number: discovery.entries.find((entry) => entry.normId === normId)?.number ?? normId,
        title: discovery.entries.find((entry) => entry.normId === normId)?.title ?? `Norma ${normId}`,
        publishedAt: discovery.entries.find((entry) => entry.normId === normId)?.publishedAt ?? new Date().toISOString(),
        sourceUrl: capture.url,
        capturedAt: capture.capturedAt,
      };
      const snapshot = parseBcnNorm(capture.raw, metadata);
      const normalized = normalizeBcnSnapshot({ ...snapshot, source: { ...snapshot.source, checksum: capture.checksum, parser: BCN_PARSER_VERSION } });
      const validation = validateNormalizedBcnDocument(normalized);
      if (!validation.valid) {
        results.push({ normId, result: "invalid", checksum: capture.checksum, error: validation.errors.join("; ") });
        continue;
      }
      const directory = join(outputDir, slug, capture.checksum);
      const rawPath = join(directory, "source.json");
      let unchanged = false;
      try {
        unchanged = createHash("sha256").update(await readFile(rawPath)).digest("hex") === capture.checksum;
      } catch {
        unchanged = false;
      }
      if (unchanged) {
        results.push({ normId, result: "skipped_unchanged", checksum: capture.checksum });
        continue;
      }
      await mkdir(directory, { recursive: true });
      await writeFile(rawPath, capture.raw, { encoding: "utf8", flag: "wx" });
      await writeFile(join(directory, "snapshot.json"), `${JSON.stringify({
        ...snapshot,
        source: { ...snapshot.source, checksum: capture.checksum, parser: BCN_PARSER_VERSION },
      }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await writeFile(join(directory, "manifest.json"), `${JSON.stringify({
        source: snapshot.source,
        norm: snapshot.norm,
        articleCount: snapshot.articles.length,
        rawBytes: Buffer.byteLength(capture.raw, "utf8"),
      }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      const imported = await importBcnStaging(directory);
      results.push({ normId, result: imported.status === "skipped" ? "skipped_unchanged" : "changed_pending_review", checksum: capture.checksum });
    } catch (error) {
      results.push({ normId, result: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { discoverySupported: discovery.supported, results };
}
