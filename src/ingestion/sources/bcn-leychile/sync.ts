import { discoverBcnNorms } from "./discovery";
import { fetchBcnNorm } from "./client";
import { normalizeBcnSnapshot } from "./normalizer";
import { parseBcnNorm } from "./parser";
import { validateNormalizedBcnDocument } from "./validator";
import { validateBcnImportMetadata } from "./metadata";
import { importBcnStaging } from "./import";
import { stageBcnSnapshot } from "./staging";

/** This experimental JSON job processes only an explicit local list; it is not remote discovery. */
export async function syncBcnNorms(options: { normIds?: string[]; outputDir?: string } = {}) {
  const discovery = await discoverBcnNorms();
  const ids = [...new Set(options.normIds ?? discovery.entries.map((entry) => entry.normId))];
  const results: Array<{ normId: string; result: string; checksum?: string; error?: string }> = [];
  for (const normId of ids) {
    try {
      const entry = discovery.entries.find((candidate) => candidate.normId === normId);
      if (!entry?.type || !entry.publishedAt) {
        throw new Error(`BCN JSON sync requires local metadata including type and publishedAt for ${normId}. Use the XML resolver for retrieval by identifier.`);
      }
      const capture = await fetchBcnNorm(normId);
      const metadata = validateBcnImportMetadata({ ...entry, sourceUrl: capture.url, capturedAt: capture.capturedAt });
      const snapshot = parseBcnNorm(capture.raw, metadata);
      const validation = validateNormalizedBcnDocument(normalizeBcnSnapshot(snapshot));
      if (!validation.valid) {
        results.push({ normId, result: "invalid", checksum: capture.checksum, error: validation.errors.join("; ") });
        continue;
      }
      const staged = await stageBcnSnapshot(options.outputDir ?? ".staging/bcn-leychile", capture.raw, snapshot);
      // Files may exist after a database failure. Only a persisted import establishes idempotence.
      const imported = await importBcnStaging(staged.directory);
      results.push({ normId, result: imported.status === "skipped" ? "skipped_unchanged" : "changed_pending_review", checksum: capture.checksum });
    } catch (error) {
      results.push({ normId, result: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { discoverySupported: discovery.supported, results };
}
