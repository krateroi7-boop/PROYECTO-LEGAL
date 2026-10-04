import { fixturesAllowed } from "@/lib/data-mode";
type PublicationSource = { sourceKey: string | null; sourceName: string; parser: string };
export type PublicationPolicy = { publicationAllowed: boolean; publicationMode?: "manual_review" | "auto_publish_validated"; usageScope?: string | null; evidenceUrl: string | null; reviewedAt: Date | null; reviewedBy: string | null };

export function publicationSourceKey(source: PublicationSource) {
  return source.sourceKey ?? (source.sourceName === "BCN LeyChile" ? "bcn-leychile" : null);
}

export function sourcePublicationAllowed(source: PublicationSource, policy?: PublicationPolicy | null) {
  if (source.parser.startsWith("bcn-leychile-json-")) return false;
  if (source.parser === "local-fixture-v1") return !publicationSourceKey(source) && fixturesAllowed();
  if (!publicationSourceKey(source)) return false;
  if (!policy?.publicationAllowed || !policy.reviewedAt || !policy.reviewedBy?.trim()) return false;
  if (!Number.isFinite(policy.reviewedAt.getTime()) || policy.reviewedAt.getTime() > Date.now()) return false;
  try {
    const evidence = new URL(policy.evidenceUrl ?? "");
    return evidence.protocol === "https:" || evidence.protocol === "http:";
  } catch {
    return false;
  }
}

export const COMMERCIAL_FULLTEXT_SCOPE = "preserve-and-redistribute-commercial-fulltext";
export function publicationMode(source: PublicationSource, policy?: PublicationPolicy | null) {
  if (!sourcePublicationAllowed(source, policy)) return "blocked";
  return policy?.publicationMode ?? "manual_review";
}
/** Certification is tied to parser code, never an arbitrary environment variable. */
export function automaticPublicationAllowed(source: PublicationSource, policy: PublicationPolicy | null | undefined) {
  return publicationMode(source, policy) === "auto_publish_validated"
    && policy?.usageScope === COMMERCIAL_FULLTEXT_SCOPE
    && source.parser === "bcn-leychile-xml-v3";
}
