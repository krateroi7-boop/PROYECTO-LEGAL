import { z } from "zod";
import type { SourceReference } from "./types";

export const candidateSchema = z.object({
  source: z.string(), resourceUri: z.string().url(), externalId: z.string().regex(/^[1-9]\d{0,11}$/).optional(),
  reference: z.object({ kind: z.enum(["idNorma", "idLey"]), value: z.string().regex(/^[1-9]\d{0,11}$/) }).optional(),
  title: z.string().optional(), number: z.string().optional(), type: z.string().optional(), publicationDate: z.string().optional(),
  organisms: z.array(z.object({ uri: z.string().url(), name: z.string().optional() })).optional(), sourceUrl: z.string().url().optional(),
  match: z.object({ strategy: z.enum(["number", "title", "subject", "alias", "identifier"]), fields: z.array(z.string()) }),
  provenance: z.object({ endpoint: z.string().url(), observedAt: z.string(), adapterVersion: z.string() }),
  local: z.object({ slug: z.string(), versionId: z.string(), needsRevalidation: z.boolean() }).optional(),
});
export type SearchCandidate = z.infer<typeof candidateSchema>;
export type DiscoveryQuery = { normalized: string; operation: "discover" | "metadata"; strategy: SearchCandidate["match"]["strategy"]; number?: string; reference?: SourceReference; terms: string[]; subjectUri?: string; lawOnly: boolean };
export interface LegalDiscoveryConnector {
  key: string;
  version: string;
  discover(query: DiscoveryQuery): Promise<{ candidates: SearchCandidate[]; discarded: number }>;
}
export type DiscoveryResult = { status: "available" | "empty" | "unavailable" | "in_progress"; candidates: SearchCandidate[]; cache: "hit" | "negative" | "fetched" | "stale" | "none"; checkedAt?: string; retryAfterSeconds?: number; reason?: string; eventId?: string };
