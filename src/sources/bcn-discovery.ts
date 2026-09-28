import { z } from "zod";
import type { DiscoveryQuery, LegalDiscoveryConnector, SearchCandidate } from "./discovery-types";

export const BCN_SPARQL_ENDPOINT = "https://datos.bcn.cl/sparql";
export const BCN_DISCOVERY_VERSION = "bcn-sparql-v1";
const literal = (value: string) => JSON.stringify(value); // SPARQL short literals share these escapes; never interpolate into shell commands.
const prefixes = `PREFIX bcn: <http://datos.bcn.cl/ontologies/bcn-norms#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX frbr: <http://purl.org/vocab/frbr/core#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

export function buildDiscoverySparql(query: DiscoveryQuery) {
  const foldedTitle = [["á", "a"], ["é", "e"], ["í", "i"], ["ó", "o"], ["ú", "u"], ["ü", "u"]].reduce((expression, [from, to]) => `REPLACE(${expression}, "${from}", "${to}")`, "LCASE(STR(?matchedTitle))");
  let selection: string;
  if (query.number || query.reference?.kind === "idLey") selection = `?norm bcn:hasNumber ${literal(query.number ?? query.reference!.value)}^^xsd:string .`;
  else if (query.reference) selection = `?norm bcn:leychileCode ${literal(query.reference.value)}^^xsd:integer .`;
  else if (query.subjectUri) selection = `?norm frbr:subject <${query.subjectUri}> .`;
  else selection = `?norm dc:title ?matchedTitle . FILTER(${query.terms.map((term) => `CONTAINS(${foldedTitle}, ${literal(term)})`).join(" && ")})`;
  const typeFilter = query.lawOnly ? "?norm bcn:type <http://datos.bcn.cl/recurso/cl/norma/tipo#ley> ." : "";
  return `${prefixes}
SELECT ?norm ?id ?title ?number ?date ?typeName ?org ?orgName ?url WHERE {
 { SELECT DISTINCT ?norm WHERE { ?norm a bcn:RootNorm . ${selection} ${typeFilter} } LIMIT 10 }
 OPTIONAL { ?norm bcn:leychileCode ?id }
 OPTIONAL { ?norm dc:title ?title }
 OPTIONAL { ?norm bcn:hasNumber ?number }
 OPTIONAL { ?norm bcn:publishDate ?date }
 OPTIONAL { ?norm bcn:type ?type . ?type bcn:hasName ?typeName }
 OPTIONAL { ?norm bcn:createdBy ?org . OPTIONAL { ?org rdfs:label ?orgName } }
 OPTIONAL { ?norm bcn:hasHtmlDocument ?url }
} LIMIT 100`;
}

const binding = z.object({ type: z.string(), value: z.string() });
const resultSchema = z.object({ results: z.object({ bindings: z.array(z.record(z.string(), binding)).max(100) }) });
const safeBcnUri = (value?: string) => {
  if (!value) return undefined;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && /(^|\.)bcn\.cl$|(^|\.)leychile\.cl$/.test(url.hostname) && !url.username && !url.password && !url.port ? value : undefined; } catch { return undefined; }
};

export function normalizeDiscoveryResponse(input: unknown, query: DiscoveryQuery, observedAt: string) {
  const rows = resultSchema.parse(input).results.bindings;
  const grouped = new Map<string, typeof rows>();
  const idsByUri = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.norm?.value && row.id?.value) {
      const ids = idsByUri.get(row.norm.value) ?? new Set<string>();
      ids.add(row.id.value);
      idsByUri.set(row.norm.value, ids);
    }
  }
  let discarded = 0;
  for (const row of rows) {
    const uri = safeBcnUri(row.norm?.value);
    if (!uri || /\/[^/]+@\d{4}-/.test(uri)) { discarded++; continue; }
    const id = /^[1-9]\d{0,11}$/.test(row.id?.value ?? "") ? row.id.value : undefined;
    if (row.id && !id) discarded++;
    const key = (idsByUri.get(uri)?.size ?? 0) > 1 ? uri : id ?? uri;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const candidates: SearchCandidate[] = [];
  for (const group of grouped.values()) {
    const unique = (name: string) => [...new Set(group.map((row) => row[name]?.value).filter((value): value is string => Boolean(value)))];
    const single = (name: string) => { const values = unique(name); return values.length === 1 ? values[0] : undefined; };
    const id = single("id");
    const validId = id && /^[1-9]\d{0,11}$/.test(id) ? id : undefined;
    const dateValues = unique("date").map((value) => value.slice(0, 10));
    const date = new Set(dateValues).size === 1 ? dateValues[0] : undefined;
    const organisms = [...new Set(unique("org").filter((uri) => Boolean(safeBcnUri(uri))))].map((uri) => {
      const names = group.filter((row) => row.org?.value === uri).map((row) => row.orgName?.value).filter((name): name is string => Boolean(name));
      return { uri, name: names.sort((a, b) => a.localeCompare(b, "es"))[0] };
    });
    candidates.push({ source: "bcn-leychile", resourceUri: group[0].norm.value, externalId: validId, reference: validId ? { kind: "idNorma", value: validId } : undefined, title: single("title"), number: single("number"), type: single("typeName"), publicationDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : undefined, organisms: organisms.length ? organisms : undefined, sourceUrl: safeBcnUri(single("url")), match: { strategy: query.strategy, fields: [query.strategy === "subject" ? "subject" : query.operation === "metadata" ? "identifier" : "title"] }, provenance: { endpoint: BCN_SPARQL_ENDPOINT, observedAt, adapterVersion: BCN_DISCOVERY_VERSION } });
  }
  return { candidates: candidates.sort((a, b) => (a.title ?? a.resourceUri).localeCompare(b.title ?? b.resourceUri, "es")).slice(0, 10), discarded };
}

export class DiscoveryError extends Error {
  constructor(public kind: string, public httpStatus?: number, public retryAfterMs = 30_000) { super(kind); }
}

export function createBcnDiscovery(fetchImpl: typeof fetch = fetch): LegalDiscoveryConnector {
  return { key: "bcn-leychile", version: BCN_DISCOVERY_VERSION, async discover(query) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const url = new URL(BCN_SPARQL_ENDPOINT);
      url.searchParams.set("query", buildDiscoverySparql(query));
      const response = await fetchImpl(url, { signal: controller.signal, redirect: "manual", cache: "no-store", headers: { Accept: "application/sparql-results+json", "User-Agent": process.env.BCN_USER_AGENT ?? "Legisdata-discovery/1.0" } });
      if (response.status !== 200) {
        await response.body?.cancel();
        const retry = response.headers.get("retry-after");
        const ms = retry ? /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) : 30_000;
        throw new DiscoveryError(response.status === 429 ? "rate-limit" : "upstream", response.status, Number.isFinite(ms) ? ms : 30_000);
      }
      if (!response.body || Number(response.headers.get("content-length")) > 524_288) { await response.body?.cancel(); throw new DiscoveryError("payload-limit", 200); }
      const reader = response.body.getReader();
      const abort = () => { void reader.cancel().catch(() => undefined); };
      controller.signal.addEventListener("abort", abort, { once: true });
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (controller.signal.aborted) throw new DiscoveryError("timeout");
          if (done) break;
          bytes += value.length;
          if (bytes > 524_288) { await reader.cancel(); throw new DiscoveryError("payload-limit", 200); }
          chunks.push(value);
        }
      } finally { controller.signal.removeEventListener("abort", abort); reader.releaseLock(); }
      try { return normalizeDiscoveryResponse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))), query, new Date().toISOString()); }
      catch { throw new DiscoveryError("invalid-response", 200); }
    } catch (error) { if (error instanceof DiscoveryError) throw error; throw new DiscoveryError(controller.signal.aborted ? "timeout" : "upstream"); }
    finally { clearTimeout(timeout); }
  } };
}
