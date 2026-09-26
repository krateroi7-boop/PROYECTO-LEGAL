import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { toApiError } from "./errors";

export function apiJson<T>(data: T, init?: ResponseInit, meta: Record<string, unknown> = {}) {
  const requestId = randomUUID();
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", requestId);
  return NextResponse.json({
    data,
    meta: { ...meta, requestId },
  }, { ...init, headers });
}

export function apiJsonWithEtag<T>(request: Request, data: T, init?: ResponseInit, meta: Record<string, unknown> = {}) {
  const payload = JSON.stringify(data);
  const etag = `"${createHash("sha256").update(payload).digest("hex")}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, ...(init?.headers ?? {}) },
    });
  }
  const response = apiJson(data, init, meta);
  response.headers.set("etag", etag);
  return response;
}

export function apiFailure(error: unknown, status = 500) {
  const requestId = randomUUID();
  const body = toApiError(error);
  return NextResponse.json({ error: { ...body, requestId } }, { status, headers: { "x-request-id": requestId } });
}

export function apiStatusForError(error: unknown) {
  if (error instanceof Error && error.message === "DATABASE_UNAVAILABLE") return 503;
  if (error instanceof Error && error.message === "RATE_LIMITED") return 429;
  return 400;
}

export function requireDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_UNAVAILABLE");
  }
}
