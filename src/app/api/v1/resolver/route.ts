import { z } from "zod";
import { auth } from "@/auth";
import { apiFailure, apiJson, apiStatusForError, requireDatabase } from "@/api/http";
import { enforceRateLimit } from "@/api/rate-limit";
import { bcnConnector } from "@/sources/bcn";
import { readIngestionState, requestIngestion, IngestionAccessError } from "@/sources/ingestion-service";
import { IngestionQuotaError } from "@/sources/ingestion-quota";
import { findLocalExact } from "@/search/hybrid";
import { recordDiscoverySelection } from "@/sources/metrics";
import type { Resolution } from "@/sources/resolver";

const inputSchema = z.object({ referencia: z.string().trim().min(1).max(500), discovery: z.string().uuid().optional() }).strict();
function resultResponse(result: Resolution) {
  const status = { published: 200, not_requested: 200, blocked: 403, pending_review: 202, resolving: 202, not_found: 404, unavailable: result.reason === "invalid_document" ? 502 : 503 }[result.status];
  return apiJson(result, { status, headers: { "Cache-Control": "no-store", ...(result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : {}) } }, { coverage: "exact_reference", source: bcnConnector.key });
}
function failure(error: unknown) {
  if (error instanceof IngestionQuotaError) return apiJson({ status: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } });
  if (error instanceof IngestionAccessError) return apiFailure(error, error.status);
  const knownStatus = apiStatusForError(error);
  return apiFailure(error, error instanceof z.ZodError || error instanceof SyntaxError ? 400 : knownStatus === 400 ? 500 : knownStatus);
}
function parseReference(input: string) {
  return bcnConnector.parseReference(input);
}
const invalid = () => apiJson({ status: "invalid_reference", message: "Indique una referencia BCN reconocida." }, { status: 400, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    enforceRateLimit(request);
    const input = inputSchema.shape.referencia.parse(new URL(request.url).searchParams.get("referencia"));
    const reference = parseReference(input);
    if (!reference) return invalid();
    requireDatabase();
    return resultResponse((await findLocalExact(reference))?.resolution ?? await readIngestionState(bcnConnector, reference));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new IngestionAccessError(401);
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
      throw new IngestionAccessError(403);
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return apiFailure(new Error("INVALID_REQUEST"), 413);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const reader = request.body?.getReader();
    if (reader) try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 4096) { await reader.cancel(); return apiFailure(new Error("INVALID_REQUEST"), 413); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const raw = Buffer.concat(chunks).toString("utf8");
    const input = inputSchema.parse(JSON.parse(raw));
    const reference = parseReference(input.referencia);
    if (!reference) return invalid();
    requireDatabase();
    const local = await findLocalExact(reference);
    const result = local?.resolution ?? await requestIngestion(bcnConnector, reference, { kind: "account", account: { id: session.user.id } });
    if (input.discovery && reference.kind === "idNorma") await recordDiscoverySelection(input.discovery, reference.value);
    return resultResponse(result);
  } catch (error) { return failure(error); }
}
