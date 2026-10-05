import Link from "next/link";
export function LibraryHeader() {
  return <header className="library-header"><div className="library-wrap library-header-inner"><Link href="/" className="library-brand" aria-label="Legisdata, inicio">Legisdata<span aria-hidden="true">.</span></Link><span className="library-edition">Legislación chilena</span><nav aria-label="Navegación principal"><Link href="/buscar">Biblioteca</Link><Link href="/api/auth/signin">Acceder</Link></nav></div></header>;
}
export function LibraryFooter() {
  return <footer className="library-footer library-wrap"><span className="library-footer-brand">Legisdata</span><span>Legislación chilena · Lectura con contexto y procedencia</span><Link href="/buscar">Buscar una norma</Link></footer>;
}
export function LibrarySearch({ query = "" }: { query?: string }) {
  return <form action="/buscar" className="library-search" role="search"><label htmlFor="legal-query" className="sr-only">Buscar legislación chilena</label><input id="legal-query" name="q" defaultValue={query} placeholder="Buscar leyes, artículos, materias o conceptos" maxLength={500} /><button type="submit">Buscar<span aria-hidden="true"> ↗</span></button></form>;
}
