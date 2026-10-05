import { connection } from "next/server";
import { getPublicCatalog } from "@/lib/public-catalog";
import { LibraryHeader, LibraryFooter, LibrarySearch } from "@/components/library/chrome";
import { CatalogCard } from "@/components/library/catalog-card";
export default async function Home() {
  await connection();
  const catalog = await getPublicCatalog();
  return <main className="library-page"><LibraryHeader /><section className="library-wrap library-hero"><p className="library-eyebrow">Una biblioteca para el derecho chileno</p><h1>Buscar legislación chilena</h1><p className="library-lead">Una lectura clara, artículo por artículo.<br />Versiones, referencias y contexto en un mismo lugar.</p><LibrarySearch /><p className="library-search-hint">Por nombre, número de ley o materia.</p></section><section className="library-wrap library-catalog" aria-labelledby="catalog-title"><div className="library-section-heading"><div><p className="library-eyebrow">Biblioteca jurídica</p><h2 id="catalog-title">Normas esenciales</h2></div><p>El punto de partida de nuestra biblioteca.</p></div><div className="catalog-grid">{catalog.map((entry) => <CatalogCard key={`${entry.source}:${entry.externalId}`} entry={entry} />)}</div><p className="library-catalog-note">Las normas señaladas como próximas aún no tienen texto disponible en Legisdata. Puedes consultarlas en su fuente oficial.</p></section><section className="library-wrap library-principles" aria-label="La lectura en Legisdata"><div><h2>El texto, en primer plano.</h2><p>Una edición digital pensada para consultar, recorrer y comprender.</p></div><p>Cuando una norma está disponible, su lectura reúne navegación por artículos, búsqueda en el documento y acceso a sus versiones y procedencia.</p></section><LibraryFooter /></main>;
}
