import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDiscoverySparql, createBcnDiscovery, normalizeDiscoveryResponse } from "@/sources/bcn-discovery";
import { parseDiscoveryQuery } from "@/sources/discovery-query";
import { parseBcnReference } from "@/ingestion/sources/bcn-leychile/reference";

const uri = "http://datos.bcn.cl/recurso/cl/ley/ministerio/2003-05-29/19880";
const row = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { type: key === "norm" ? "uri" : "literal", value }]));
const data = (...rows: Record<string, string>[]) => ({ results: { bindings: rows.map(row) } });
const query = parseDiscoveryQuery("Ley 19.880");
const normalize = (input: unknown) => normalizeDiscoveryResponse(input, query, "2026-09-28T00:00:00Z");

describe("bounded BCN SPARQL metadata contract", () => {
  afterEach(() => vi.useRealTimers());
  it.each(["19880", "19.880", "Ley 19.880", "LEY 19880"])("normalizes law numbers and uses typed comparison: %s", (input) => {
    expect(parseDiscoveryQuery(input)).toMatchObject({ reference: { kind: "idLey", value: "19880" } });
    expect(buildDiscoverySparql(parseDiscoveryQuery(input))).toContain('"19880"^^xsd:string');
    expect(buildDiscoverySparql(parseDiscoveryQuery(input))).toContain("bcn:RootNorm");
  });
  it("preserves the technical bare-ID contract while human input means law number", () => {
    expect(parseBcnReference("19880")).toEqual({ kind: "idNorma", value: "19880" });
    expect(parseDiscoveryQuery("idNorma:210676").reference).toEqual({ kind: "idNorma", value: "210676" });
    expect(parseDiscoveryQuery("https://www.bcn.cl/leychile/navegar?idNorma=210676").reference?.value).toBe("210676");
  });
  it("keeps approved aliases separate and uses the evidenced subject", () => {
    expect(parseDiscoveryQuery("Ley de transparencia")).toMatchObject({ number: "20285", strategy: "alias" });
    expect(buildDiscoverySparql(parseDiscoveryQuery("procedimiento administrativo"))).toContain("<http://datos.bcn.cl/recurso/tema/procedimiento-administrativo>");
    expect(buildDiscoverySparql(parseDiscoveryQuery("acceso a la información pública"))).toContain('REPLACE(');
  });
  it("never executes user-provided SPARQL and rejects unsupported URLs", () => {
    const sparql = buildDiscoverySparql(parseDiscoveryQuery('título \" } UNION { ?s ?p ?o } #'));
    expect(sparql).not.toContain("UNION");
    expect(sparql).toContain("LIMIT 10");
    expect(() => parseDiscoveryQuery("https://evil.invalid/norma")).toThrow();
    expect(() => parseDiscoveryQuery("a".repeat(501))).toThrow();
  });
  it("deduplicates root IDs, RDF date variants and omits contradictory fields", () => {
    const result = normalize(data({ norm: uri, id: "210676", title: "Título A", date: "2003-05-29" }, { norm: uri, id: "210676", title: "Título B", date: "2003-05-29T00:00:00Z" }, { norm: `${uri}/es@2003-05-29`, id: "210676" }));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ reference: { kind: "idNorma", value: "210676" }, publicationDate: "2003-05-29" });
    expect(result.candidates[0].title).toBeUndefined();
    expect(result.candidates[0].sourceUrl).toBeUndefined();
    expect(result.discarded).toBe(1);
  });
  it.each([undefined, "0", "-1", "abc", "9999999999999"])("does not resolve missing or invalid identity %s", (id) => {
    const result = normalize(data({ norm: uri, ...(id ? { id } : {}), date: "2026-99-99" }));
    expect(result.candidates[0].reference).toBeUndefined();
    expect(result.candidates[0].publicationDate).toBeUndefined();
  });
  it("drops unsafe resource URLs and caps output at ten candidates", () => {
    expect(normalize(data({ norm: "javascript:alert(1)", id: "1" })).candidates).toHaveLength(0);
    expect(normalize(data(...Array.from({ length: 15 }, (_, i) => ({ norm: `${uri}/${i}`, id: String(i + 1) })))).candidates).toHaveLength(10);
  });
  it("does not choose arbitrarily between contradictory identifiers on one resource", () => {
    const result = normalize(data({ norm: uri, id: "210676" }, { norm: uri, id: "276363" }));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].reference).toBeUndefined();
  });
  it("distinguishes a valid empty response from malformed or oversized payloads", async () => {
    const empty = createBcnDiscovery(vi.fn(async () => Response.json(data())));
    expect((await empty.discover(query)).candidates).toEqual([]);
    await expect(createBcnDiscovery(vi.fn(async () => Response.json({}))).discover(query)).rejects.toMatchObject({ kind: "invalid-response" });
    await expect(createBcnDiscovery(vi.fn(async () => new Response("x".repeat(524289)))).discover(query)).rejects.toMatchObject({ kind: "payload-limit" });
  });
  it("respects Retry-After without retrying or following redirects", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 429, headers: { "Retry-After": "120" } }));
    await expect(createBcnDiscovery(fetch).discover(query)).rejects.toMatchObject({ kind: "rate-limit", retryAfterMs: 120000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toHaveLength(2);
  });
  it("aborts a stalled HTTP call after eight seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const result = expect(createBcnDiscovery(fetch).discover(query)).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(8001);
    await result;
    expect(fetch).toHaveBeenCalledOnce();
  });
});
