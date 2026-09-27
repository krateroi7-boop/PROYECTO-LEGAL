import Link from "next/link";
import { searchLaws } from "@/lib/legislation-data";
import { parseBcnReference } from "@/ingestion/sources/bcn-leychile/reference";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim().toLowerCase();
  const results = await searchLaws(query);
  let exactReference = false;
  try { parseBcnReference(q); exactReference = true; } catch { /* Free text is searched locally. */ }

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
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-[#173f6b]">Resultados de búsqueda</h1>
        <form className="mt-7 flex max-w-3xl overflow-hidden rounded-xl border border-[#cbd5df] bg-white p-1.5 shadow-sm"><input name="q" defaultValue={q} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#9ca8b6]" placeholder="Buscar leyes, artículos, materias o conceptos" /><button className="rounded-lg bg-[#173f6b] px-5 py-3 text-sm font-bold text-white">Buscar</button></form>
        <p className="mt-8 text-sm text-[#697789]">{query ? `${results.length} resultado${results.length === 1 ? "" : "s"} para “${q}”` : "Normas disponibles para explorar"}</p>
        <p className="mt-2 text-sm text-[#697789]">La búsqueda por palabras cubre los textos publicados en Legisdata. <Link href={exactReference ? `/consultar?referencia=${encodeURIComponent(q)}` : "/consultar"} prefetch={false} className="font-semibold text-[#173f6b] underline">{exactReference ? "Consultar esta referencia en BCN" : "Consultar otra norma por número o enlace BCN"}</Link></p>
        <div className="mt-4 divide-y divide-[#e2e6eb] rounded-2xl border border-[#e2e6eb] bg-white">
          {results.length ? results.map((law) => <Link href={`/normas/${law.slug}`} key={law.slug} className="block p-6 transition hover:bg-[#f8fafb]"><div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] text-[#d37d42]"><span>{law.type} {law.number}</span><span className="rounded-full bg-[#e8f4ed] px-2.5 py-1 tracking-normal text-[#398264]">{law.status}</span></div><h2 className="mt-3 text-xl font-bold text-[#173f6b]">{law.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#697789]">{law.description}</p><div className="mt-4 flex gap-2">{law.topics.map((topic) => <span key={topic} className="rounded-full bg-[#eef4f8] px-2.5 py-1 text-xs font-semibold text-[#526174]">{topic}</span>)}</div></Link>) : <div className="p-10 text-center text-sm text-[#697789]">No encontramos normas que coincidan con tu búsqueda.</div>}
        </div>
      </div>
    </main>
  );
}
