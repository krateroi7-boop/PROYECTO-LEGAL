import { describe, expect, it, vi } from "vitest";
import { fetchBcnXml, BCN_XML_ENDPOINT } from "@/ingestion/sources/bcn-leychile/xml-client";

const reference = { kind: "idLey" as const, value: "19880" };
const xml = '<?xml version="1.0" encoding="UTF-8"?><Norma normaId="123"/>';
const now = () => Date.parse("2026-09-26T12:00:00.000Z");

describe("BCN XML transport", () => {
  it("fetches the fixed XML endpoint, records validators and preserves original content", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(xml, { headers: { "content-type": "text/xml; charset=UTF-8", etag: '"fixture"', "last-modified": "Sat, 26 Sep 2026 10:00:00 GMT" } }));
    const result = await fetchBcnXml(reference, { fetchImpl, now });
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BCN_XML_ENDPOINT}?opt=7&idLey=19880`);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual", cache: "no-store" });
    expect(result).toMatchObject({ kind: "modified", httpStatus: 200, raw: xml, etag: '"fixture"', capturedAt: "2026-09-26T12:00:00.000Z" });
    if (result.kind === "modified") expect(result.checksum).toHaveLength(64);
  });

  it("sends conditional validators and treats 304 as an observation without a new capture", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 304, headers: { etag: '"fixture"' } }));
    const result = await fetchBcnXml(reference, { fetchImpl, etag: '"fixture"', lastModified: "Sat, 26 Sep 2026 10:00:00 GMT" });
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get("if-none-match")).toBe('"fixture"');
    expect(headers.get("if-modified-since")).toBe("Sat, 26 Sep 2026 10:00:00 GMT");
    expect(result.kind).toBe("not-modified");
    expect(result).not.toHaveProperty("raw");
    await expect(fetchBcnXml(reference, { fetchImpl })).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it.each([[404, "not-found"], [410, "not-found"], [401, "upstream"], [403, "upstream"], [302, "upstream"]])("classifies HTTP %s and does not retry it", async (status, kind) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status }));
    await expect(fetchBcnXml(reference, { fetchImpl })).rejects.toMatchObject({ kind, httpStatus: status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors once and respects Retry-After", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "2" } })).mockResolvedValueOnce(new Response(xml));
    expect((await fetchBcnXml(reference, { fetchImpl, sleep })).kind).toBe("modified");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("exposes a long backoff without blocking on a new request", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("busy", { status: 429, headers: { "retry-after": "120" } }));
    await expect(fetchBcnXml(reference, { fetchImpl })).rejects.toMatchObject({ kind: "rate-limit", retryAfterMs: 120_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("lets the shared source budget disable transport retries", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("unavailable", { status: 503 }));
    await expect(fetchBcnXml(reference, { fetchImpl, retryCount: 0 })).rejects.toMatchObject({ kind: "upstream", httpStatus: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([["<html>Auth page</html>", "text/html"], ["<Norma>", "text/xml"], ['<!DOCTYPE Norma [<!ENTITY x "x">]><Norma>&x;</Norma>', "text/xml"]])("rejects non-XML and unsafe XML responses", async (body, contentType) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(body, { headers: { "content-type": contentType } }));
    await expect(fetchBcnXml(reference, { fetchImpl })).rejects.toMatchObject({ kind: "invalid-response" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("limits both declared and streamed payloads", async () => {
    const headerSets: HeadersInit[] = [{ "content-length": "999" }, {}];
    for (const headers of headerSets) {
      await expect(fetchBcnXml(reference, { fetchImpl: async () => new Response(xml, { headers }), maxBodyBytes: 10 })).rejects.toMatchObject({ kind: "payload-limit" });
    }
  });

  it("applies the timeout before headers and during a stalled body", async () => {
    await expect(fetchBcnXml(reference, { fetchImpl: () => new Promise(() => undefined), timeoutMs: 5, retryCount: 0 })).rejects.toMatchObject({ kind: "timeout" });
    const cancel = vi.fn();
    await expect(fetchBcnXml(reference, { fetchImpl: async () => new Response(new ReadableStream({ cancel })), timeoutMs: 5, retryCount: 0 })).rejects.toMatchObject({ kind: "timeout" });
    expect(cancel).toHaveBeenCalled();
  });

  it("does not request invalid identifiers", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(fetchBcnXml({ kind: "idNorma", value: "../../etc/passwd" }, { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
