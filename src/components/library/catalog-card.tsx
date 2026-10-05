import Link from "next/link";
import { officialCatalogUrl, type CatalogEntry } from "@/lib/catalog-presentation";
export function CatalogCard({ entry }: { entry: CatalogEntry }) {
  return <article className="catalog-card"><p className="library-eyebrow">{entry.name.startsWith("Código") ? "Código" : "Ley"}</p><h3>{entry.readerSlug ? <Link href={`/normas/${entry.readerSlug}`}>{entry.name}</Link> : entry.name}</h3><p className="availability">{entry.readerSlug ? "Disponible en Legisdata" : "Próximamente disponible"}</p><div className="catalog-actions">{entry.readerSlug ? <Link href={`/normas/${entry.readerSlug}`}>Leer norma <span aria-hidden="true">→</span></Link> : <Link href={`/buscar?q=${encodeURIComponent(entry.name)}`}>Consultar disponibilidad <span aria-hidden="true">→</span></Link>}<a href={officialCatalogUrl(entry)} target="_blank" rel="noreferrer">Fuente oficial</a></div></article>;
}
