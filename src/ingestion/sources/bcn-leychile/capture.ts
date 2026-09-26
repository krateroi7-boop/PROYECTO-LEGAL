import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseBcnNorm } from "./parser";
import { bcnConfig } from "./config";
import type { BcnPilotMetadata, BcnStagingSnapshot } from "./types";

const DEFAULT_ENDPOINT = bcnConfig.apiUrl;

export type BcnCaptureResult = {
  rawPath: string;
  snapshotPath: string;
  manifestPath: string;
  snapshot: BcnStagingSnapshot;
};

export async function captureBcnNorm(options: {
  metadata: BcnPilotMetadata;
  outputDir: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<BcnCaptureResult> {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const url = new URL(endpoint);
  url.searchParams.set("idNorma", options.metadata.normId);
  url.searchParams.set("agrupa_partes", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Legisdata-staging/1.0 (research; contact required)",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`BCN request timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`BCN request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`BCN request failed with HTTP ${response.status}.`);
  const raw = await response.text();
  const snapshot = parseBcnNorm(raw, options.metadata);
  const checksum = createHash("sha256").update(raw).digest("hex");
  const stampedSnapshot = {
    ...snapshot,
    source: { ...snapshot.source, checksum },
  };
  const capturedAt = options.metadata.capturedAt;
  const manifest = {
    source: stampedSnapshot.source,
    norm: stampedSnapshot.norm,
    articleCount: stampedSnapshot.articles.length,
    rawBytes: Buffer.byteLength(raw, "utf8"),
  };
  const base = join(options.outputDir, options.metadata.slug);
  const rawPath = join(base, "source.json");
  const snapshotPath = join(base, "snapshot.json");
  const manifestPath = join(base, "manifest.json");
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, raw, { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error(`Staging capture already exists: ${rawPath}`);
    throw error;
  });
  await writeFile(snapshotPath, `${JSON.stringify(stampedSnapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, capturedAt }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { rawPath, snapshotPath, manifestPath, snapshot: stampedSnapshot };
}

export { DEFAULT_ENDPOINT };
