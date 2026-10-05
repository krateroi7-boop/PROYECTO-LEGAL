import Link from "next/link";
import { getLawSummary, searchLaws } from "@/lib/legislation-data";
import { findLocalExact, humanReference } from "@/search/hybrid";
import { getPublicCatalog, canOfferBcnIngestion } from "@/lib/public-catalog";
import { matchingCatalog } from "@/lib/catalog-presentation";
import { LibraryHeader, LibraryFooter, LibrarySearch } from "@/components/library/chrome";
import { DiscoveryResults } from "@/components/legal/discovery-results";
import { ResolutionPanel } from "@/components/legal/resolution-panel";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 500) : "";
  const query = q.trim().toLowerCase();
  const catalog = await getPublicCatalog();
  let results: Awaited<ReturnType<typeof searchLaws>> = [];
  let localUnavailable = false;
  try { results = await searchLaws(query); } catch { localUnavailable = true; }
  const reference = humanReference(q);
  let localExact;
  try { localExact = reference ? await findLocalExact(reference) : undefined; } catch { localUnavailable = true; }
  if (localExact?.resolution.slug && !results.some((law) => law.slug === localExact.resolution.slug)) {
    const law = await getLawSummary(localExact.resolution.slug);
    if (law) results.unshift(law);
  }
  const initialEntries = matchingCatalog(catalog, q).filter((entry) => !entry.readerSlug || !results.some((law) => law.slug === entry.readerSlug));
  return <main className="library-page"><LibraryHeader /><div className="library-wrap library-search-content"><div className="library-search-heading"><p className="library-eyebrow">Biblioteca jurídica</p><h1>Buscar en Legisdata</h1><LibrarySearch query={q} /></div><p className="search-query-label">{query ? `Resultados para “${q}”` : "Explora nuestra selección de legislación chilena."}</p>
    {results.length ? <section className="search-section" aria-label="Textos disponibles"><h2>Disponible en Legisdata</h2>{results.map((law) => {
      const common = catalog.find((entry) => entry.readerSlug === law.slug)?.name;
      return <Link href={`/normas/${law.slug}`} key={law.slug} className="search-result block"><p className="availability">{law.type} {law.number} · Disponible en Legisdata</p><h3>{common ?? law.title}</h3>{common && common !== law.title ? <p className="formal-title">{law.title}</p> : null}<p className="result-description">{law.description}</p><p className="result-actions">Leer norma <span aria-hidden="true">→</span></p></Link>;
    })}</section> : query ? <p className="search-feedback">{localUnavailable ? "La consulta de textos no está disponible ahora. Puedes explorar la biblioteca y las fuentes oficiales." : "No hay textos disponibles en Legisdata para esta búsqueda."}</p> : null}
    {localExact ? localExact.revalidationReference ? <ResolutionPanel compact reference={localExact.revalidationReference} initial={localExact.resolution} /> : null : <DiscoveryResults key={q} query={q} initialEntries={initialEntries} localSlugs={results.map((law) => law.slug)} ingestionAvailable={await canOfferBcnIngestion()} />}
  </div><LibraryFooter /></main>;
}
