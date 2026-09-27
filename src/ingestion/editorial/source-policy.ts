type PublicationSource = { sourceKey: string | null; sourceName: string; parser: string };
type PublicationPolicy = { publicationAllowed: boolean; evidenceUrl: string | null; reviewedAt: Date | null; reviewedBy: string | null };

export function publicationSourceKey(source: PublicationSource) {
  return source.sourceKey ?? (source.sourceName === "BCN LeyChile" ? "bcn-leychile" : null);
}

export function sourcePublicationAllowed(source: PublicationSource, policy?: PublicationPolicy | null) {
  if (!publicationSourceKey(source)) return source.parser === "local-fixture-v1";
  if (!policy?.publicationAllowed || !policy.reviewedAt || !policy.reviewedBy?.trim()) return false;
  if (!Number.isFinite(policy.reviewedAt.getTime()) || policy.reviewedAt.getTime() > Date.now()) return false;
  try {
    const evidence = new URL(policy.evidenceUrl ?? "");
    return evidence.protocol === "https:" || evidence.protocol === "http:";
  } catch {
    return false;
  }
}
