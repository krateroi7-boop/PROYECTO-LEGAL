import Link from "next/link";
import { getLaw, searchLaws } from "@/lib/legislation-data";
import { findLocalExact, humanReference } from "@/search/hybrid";
import { DiscoveryResults } from "@/components/legal/discovery-results";
import { ResolutionPanel } from "@/components/legal/resolution-panel";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 500) : "";
  const query = q.trim().toLowerCase();
  const results = await searchLaws(query);
  const reference = humanReference(q);
  const localExact = reference ? await findLocalExact(reference) : undefined;
  if (localExact?.resolution.slug && !results.some((law) => law.slug === localExact.resolution.slug)) {
    const law = await getLaw(localExact.resolution.slug);
    if (law) results.unshift(law);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
      <header className="border-b border-[#dfe4eb] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f6b] text-sm font-bold text-white">L</span><span className="text-lg font-bold tracking-tight">Legis<span className="text-[#d37d42]">data</span></span></Link>
          <Link href="/" className="text-sm font-semibold text-[#526174] hover:text-[#173f6b]">Inicio</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d37d42]">Buscador jurídico</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-[#173f6b]">Buscar en Legisdata</h1>
        <form className="mt-7 flex max-w-3xl overflow-hidden rounded-xl border border-[#cbd5df] bg-white p-1.5 shadow-sm"><input name="q" defaultValue={q} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#9ca8b6]" placeholder="Buscar leyes, artículos, materias o conceptos" /><button className="rounded-lg bg-[#173f6b] px-5 py-3 text-sm font-bold text-white">Buscar</button></form>
        <p className="mt-8 text-sm text-[#697789]">{query ? `Resultados para “${q}”` : "Normas disponibles para explorar"}</p>
        <p className="mt-2 text-sm text-[#697789]">Seleccione una norma para leerla o consultar su estado editorial en Legisdata.</p>
        <h2 className="mt-6 text-xl font-bold text-[#173f6b]">Publicado en Legisdata</h2>
        <div className="mt-4 divide-y divide-[#e2e6eb] rounded-2xl border border-[#e2e6eb] bg-white">
          {results.length ? results.map((law) => <Link href={`/normas/${law.slug}`} key={law.slug} className="block p-6 transition hover:bg-[#f8fafb]"><div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] text-[#d37d42]"><span>{law.type} {law.number}</span><span className="rounded-full bg-[#e8f4ed] px-2.5 py-1 tracking-normal text-[#398264]">{law.status}</span></div><h2 className="mt-3 text-xl font-bold text-[#173f6b]">{law.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#697789]">{law.description}</p><div className="mt-4 flex flex-wrap gap-2">{law.topics.map((topic) => <span key={topic} className="rounded-full bg-[#eef4f8] px-2.5 py-1 text-xs font-semibold text-[#526174]">{topic}</span>)}</div></Link>) : <div className="p-10 text-center text-sm text-[#697789]">No hay publicaciones locales que coincidan con esta búsqueda.</div>}
        </div>
        {localExact ? localExact.revalidationReference ? <ResolutionPanel compact reference={localExact.revalidationReference} initial={localExact.resolution} refresh={!localExact.fresh} /> : null : query ? <DiscoveryResults key={q} query={q} localSlugs={results.map((law) => law.slug)} /> : null}
      </div>
    </main>
  );
}
