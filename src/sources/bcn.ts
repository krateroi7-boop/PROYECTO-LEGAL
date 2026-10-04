import { parseBcnReference } from "@/ingestion/sources/bcn-leychile/reference";
import { fetchBcnXml } from "@/ingestion/sources/bcn-leychile/xml-client";
import { BCN_XML_PARSER_VERSION, parseBcnXml } from "@/ingestion/sources/bcn-leychile/xml-parser";
import { createSourceResolver } from "./resolver";
import type { LegalSourceConnector } from "./types";

export const bcnConnector: LegalSourceConnector = {
  key: "bcn-leychile", name: "BCN LeyChile", parserVersion: BCN_XML_PARSER_VERSION,
  parseReference(input) {
    try { return parseBcnReference(input); } catch { return null; }
  },
  fetch(reference, validators) {
    // The durable provider budget owns backoff; no hidden retries within one budget slot.
    return fetchBcnXml(reference, { ...validators, retryCount: 0, timeoutMs: 15_000 });
  },
  normalize(raw, observation) {
    const result = parseBcnXml(raw, observation);
    return { ...result.identity, status: result.identity.status === "unknown" ? "desconocida" : "derogada", nodes: result.nodes, warnings: result.warnings, attachments: result.attachments, coverage: result.coverage, sourceMetadata: result.sourceMetadata };
  },
};

export const resolveBcnDocument = createSourceResolver({ connector: bcnConnector });
