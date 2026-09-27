import { parseBcnNorm } from "./parser";
import { bcnConfig } from "./config";
import { stageBcnSnapshot } from "./staging";
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
  if (!/^\d+$/.test(options.metadata.normId)) throw new Error("BCN source identifier must be numeric.");
  url.searchParams.set("idNorma", options.metadata.normId);
  url.searchParams.set("agrupa_partes", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let raw: string;
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": bcnConfig.userAgent,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`BCN request failed with HTTP ${response.status}.`);
    raw = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`BCN request timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`BCN request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  const snapshot = parseBcnNorm(raw, { ...options.metadata, sourceUrl: url.toString() });
  return stageBcnSnapshot(options.outputDir, raw, snapshot);
}

export { DEFAULT_ENDPOINT };
