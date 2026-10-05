import Link from "next/link";
import { redirect } from "next/navigation";
import { bcnConnector } from "@/sources/bcn";
import { findLocalExact } from "@/search/hybrid";
import { auth } from "@/auth";
import { readIngestionState } from "@/sources/ingestion-service";
import { ResolutionPanel } from "@/components/legal/resolution-panel";
import { LibraryHeader, LibraryFooter } from "@/components/library/chrome";
import { catalogName } from "@/lib/catalog-presentation";

export default async function ConsultPage({ searchParams }: { searchParams: Promise<{ q?: string; referencia?: string; discovery?: string; busqueda?: string }> }) {
  const params = await searchParams;
  // All human searches use the same results page. Technical references retain their original contract.
  if (typeof params.q === "string") redirect(`/buscar?q=${encodeURIComponent(params.q.slice(0, 500))}`);
  const input = typeof params.referencia === "string" ? params.referencia : "";
  if (!input) redirect("/buscar");
  const query = typeof params.busqueda === "string" ? params.busqueda.slice(0, 500) : "";
  const back = query ? `/buscar?q=${encodeURIComponent(query)}` : "/buscar";
  const reference = input.length <= 500 ? bcnConnector.parseReference(input) : null;
  let error = reference ? "" : "La referencia no es válida. Busque por número de ley, título o materia.";
  let known;
  if (reference) {
    if (!process.env.DATABASE_URL) error = "La consulta de fuentes externas no está disponible en esta instancia.";
    else {
      try {
        known = await findLocalExact(reference) ?? { resolution: await readIngestionState(bcnConnector, reference), fresh: false };
      } catch { error = "No podemos comprobar la disponibilidad ahora. Inténtalo de nuevo más tarde."; }
    }
  }
  if (!error && known?.resolution.status === "published" && known.resolution.slug) redirect(`/normas/${known.resolution.slug}`);
  const session = await auth();
  const name = reference?.kind === "idNorma" ? catalogName(bcnConnector.key, reference.value) : undefined;
  return <main className="library-page"><LibraryHeader /><div className="library-wrap consult-content">
    <Link href={back} className="text-sm underline">Volver a resultados</Link>
    <p className="library-eyebrow mt-8">Biblioteca jurídica</p>
    <h1>{name ?? "Consultar una norma"}</h1>
    <p className="consult-intro">Consulta su disponibilidad de lectura en Legisdata o accede a la fuente oficial.</p>
    {error ? <p role="alert" className="resolution-panel">{error}</p> : null}
    {!error && reference ? <ResolutionPanel key={`${reference.kind}:${reference.value}`} reference={reference} initial={known?.resolution} authenticated={Boolean(session?.user?.id)} discoveryId={params.discovery} /> : null}
    <Link href={back} className="mt-8 inline-block text-sm underline">Buscar otra norma en Legisdata</Link>
  </div><LibraryFooter /></main>;
}
