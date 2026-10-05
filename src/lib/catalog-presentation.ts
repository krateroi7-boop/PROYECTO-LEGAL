import { publicCorpus } from "@/sources/corpus";
export type CatalogEntry = (typeof publicCorpus)[number] & { readerSlug?: string };
export const normalizeCatalogQuery = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\./g, "").trim();
export function matchingCatalog(entries: CatalogEntry[], query: string) {
  const exact = entries.filter((entry) => normalizeCatalogQuery(entry.name) === normalizeCatalogQuery(query));
  if (exact.length) return exact;
  const terms = normalizeCatalogQuery(query).split(/\s+/).filter(Boolean);
  return entries.filter((entry) => terms.every((term) => normalizeCatalogQuery(entry.name).includes(term)));
}
/** Common names belong to verified source identities, never title similarity. */
export function catalogName(source: string, externalId?: string) {
  return publicCorpus.find((entry) => entry.source === source && entry.externalId === externalId)?.name;
}
export function officialCatalogUrl(entry: CatalogEntry) {
  return `https://www.bcn.cl/leychile/navegar?idNorma=${encodeURIComponent(entry.externalId)}`;
}

export function attachCatalogPublications(entries: CatalogEntry[], publications: { source: string; externalId: string; slug: string }[]): CatalogEntry[] {
  return entries.map((entry) => {
    const publication = publications.find((item) => item.source === entry.source && item.externalId === entry.externalId);
    const { readerSlug: _unused, ...metadata } = entry;
    void _unused;
    return { ...metadata, ...(publication ? { readerSlug: publication.slug } : {}) };
  });
}
