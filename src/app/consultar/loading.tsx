import { LibraryHeader, LibraryFooter } from "@/components/library/chrome";
export default function Loading() {
  return <main className="library-page"><LibraryHeader /><div className="library-wrap consult-content"><p className="library-eyebrow">Biblioteca jurídica</p><h1>Consultar una norma</h1><p className="consult-intro" role="status">Buscando información de esta norma…</p></div><LibraryFooter /></main>;
}
