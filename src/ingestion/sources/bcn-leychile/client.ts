import { createHash } from "node:crypto";
import { bcnConfig, BCN_SOURCE_NAME } from "./config";

export type BcnRawCapture = {
  source: typeof BCN_SOURCE_NAME;
  sourceIdentifier: string;
  url: string;
  capturedAt: string;
  httpStatus: number;
  raw: string;
  checksum: string;
};

let lastRequestAt = 0;
let requestsThisRun = 0;

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function fetchBcnNorm(sourceIdentifier: string, options: {
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): Promise<BcnRawCapture> {
  if (!/^\d+$/.test(sourceIdentifier)) throw new Error("BCN source identifier must be numeric.");
  if (requestsThisRun >= bcnConfig.maxRequestsPerRun) throw new Error("BCN request limit reached for this run.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const url = new URL(bcnConfig.apiUrl);
  url.searchParams.set("idNorma", sourceIdentifier);
  url.searchParams.set("agrupa_partes", "1");

  const elapsed = now() - lastRequestAt;
  if (elapsed < bcnConfig.minRequestIntervalMs) await wait(bcnConfig.minRequestIntervalMs - elapsed);
  let lastError: unknown;
  for (let attempt = 0; attempt <= bcnConfig.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), bcnConfig.timeoutMs);
    try {
      requestsThisRun += 1;
      const response = await fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": bcnConfig.userAgent },
        signal: controller.signal,
      });
      lastRequestAt = now();
      if (!response.ok) throw new Error(`BCN request failed with HTTP ${response.status}.`);
      const raw = await response.text();
      try {
        JSON.parse(raw);
      } catch {
        throw new Error("BCN response is not valid JSON.");
      }
      return {
        source: BCN_SOURCE_NAME,
        sourceIdentifier,
        url: url.toString(),
        capturedAt: new Date(now()).toISOString(),
        httpStatus: response.status,
        raw,
        checksum: createHash("sha256").update(raw).digest("hex"),
      };
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError"
        ? new Error(`BCN request timed out after ${bcnConfig.timeoutMs}ms.`)
        : error;
      if (attempt < bcnConfig.retryCount) await wait(bcnConfig.retryBaseDelayMs * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function resetBcnRequestBudget() {
  requestsThisRun = 0;
  lastRequestAt = 0;
}
