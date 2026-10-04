import { corpusReference } from "./corpus";
import { parseBcnReference } from "@/ingestion/sources/bcn-leychile/reference";
import type { DiscoveryQuery } from "./discovery-types";

// Search hints, not official titles or a mirror of the legal corpus.
export const searchAliases: Readonly<Record<string, string>> = { "ley de transparencia": "20285" };
const subjects: Readonly<Record<string, string>> = {
  "procedimiento administrativo": "http://datos.bcn.cl/recurso/tema/procedimiento-administrativo",
  "transparencia de la funcion publica": "http://datos.bcn.cl/recurso/tema/transparencia-de-la-funcion-publica",
};
export function parseDiscoveryQuery(input: string): DiscoveryQuery {
  const text = input.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!text || text.length > 500) throw new Error("INVALID_DISCOVERY_QUERY");
  const normalized = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const alias = searchAliases[normalized];
  const number = text.match(/^(?:ley\s*(?:(?:n[.°ºo]*|número)\s*)?)?(\d{1,3}(?:\.\d{3})+|\d+)$/i)?.[1]?.replaceAll(".", "") ?? alias;
  if (number && /^[1-9]\d{0,11}$/.test(number)) return { normalized: alias ? normalized : `ley ${number}`, number, reference: { kind: "idLey", value: number }, operation: "metadata", strategy: alias ? "alias" : "number", terms: [], lawOnly: true };
  try {
    const hint = corpusReference(text);
    const reference = hint ?? parseBcnReference(text);
    return { normalized: hint ? `corpus-v1:${normalized}` : `${reference.kind}:${reference.value}`, reference, operation: "metadata", strategy: hint ? "alias" : "identifier", terms: [], lawOnly: false };
  } catch { /* Textual discovery follows; URLs and malformed explicit identifiers are not free-text searches. */ }
  if (/https?:\/\/|^id(?:norma|ley)\s*[:=]/i.test(text)) throw new Error("INVALID_DISCOVERY_QUERY");
  const terms = normalized.match(/[\p{L}\p{N}]+/gu)?.filter((word) => !["ley", "de", "la", "el", "los", "las", "y", "en", "del", "sobre"].includes(word)).slice(0, 6) ?? [];
  if (!terms.length || terms.some((term) => term.length > 80)) throw new Error("INVALID_DISCOVERY_QUERY");
  return { normalized, operation: "discover", strategy: subjects[normalized] ? "subject" : "title", terms, subjectUri: subjects[normalized], lawOnly: /^ley\b/.test(normalized) || Boolean(subjects[normalized]) };
}
