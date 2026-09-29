import Link from "next/link";
import { redirect } from "next/navigation";
import { bcnConnector } from "@/sources/bcn";
import { findLocalExact } from "@/search/hybrid";
import { readSourceResolution } from "@/sources/resolver";
import { recordDiscoverySelection } from "@/sources/metrics";
import { ResolutionPanel } from "@/components/legal/resolution-panel";

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
        known = await findLocalExact(reference) ?? await readSourceResolution(bcnConnector, reference);
        if (params.discovery && reference.kind === "idNorma") await recordDiscoverySelection(params.discovery, reference.value);
      } catch { error = "No fue posible consultar la persistencia. Inténtelo nuevamente más tarde."; }
    }
  }
  if (!error && known?.resolution.status === "published" && known.resolution.slug) redirect(`/normas/${known.resolution.slug}`);
  return <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
    <header className="border-b border-[#dfe4eb] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><Link href="/" className="text-lg font-bold text-[#173f6b]">Legisdata</Link><Link href={back} className="text-sm font-semibold text-[#526174]">Volver a resultados</Link></div></header>
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d37d42]">Consulta de norma</p>
      <h1 className="mt-3 text-3xl font-bold text-[#173f6b]">Consultar en Legisdata</h1>
      <p className="mt-3 text-sm text-[#697789]">Fuente: BCN / LeyChile. La disponibilidad de lectura depende de la revisión editorial.</p>
      {error ? <p role="alert" className="mt-6 rounded-xl bg-white p-6 text-[#a94c4c]">{error}</p> : null}
      {!error && reference ? <ResolutionPanel key={`${reference.kind}:${reference.value}`} reference={reference} initial={known?.resolution} refresh={known ? !known.fresh : false} discoveryId={params.discovery} /> : null}
      <Link href={back} className="mt-8 inline-block font-semibold text-[#173f6b] underline">Buscar otra norma en Legisdata</Link>
    </div>
  </main>;
}
