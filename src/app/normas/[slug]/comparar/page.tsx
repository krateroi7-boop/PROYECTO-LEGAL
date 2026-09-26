import Link from "next/link";
import { notFound } from "next/navigation";
import { compareVersions } from "@/domain/versioning/compare";
import { getVersion, getVersions } from "@/lib/versioning-data";

export default async function ComparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const versions = getVersions(slug);
  if (!versions.length) notFound();
  const from = getVersion(slug, query.desde ?? versions[0].id) ?? versions[0];
  const to = getVersion(slug, query.hasta ?? versions[versions.length - 1].id) ?? versions[versions.length - 1];
  const comparison = compareVersions(from, to);

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
      <header className="border-b border-[#dfe4eb] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><Link href="/" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f6b] text-sm font-bold text-white">L</span><span className="text-lg font-bold tracking-tight">Legis<span className="text-[#d37d42]">data</span></span></Link><Link href={`/normas/${slug}`} className="text-sm font-semibold text-[#526174]">Volver a la norma</Link></div></header>
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d37d42]">Comparador de versiones</p><h1 className="mt-3 text-3xl font-bold text-[#173f6b]">Cambios en {from.law.shortTitle}</h1>
        <form className="mt-7 grid gap-4 rounded-2xl border border-[#e2e6eb] bg-white p-5 md:grid-cols-[1fr_1fr_auto] md:items-end"><label className="text-sm font-semibold text-[#526174]">Versión anterior<select name="desde" defaultValue={from.id} className="mt-2 block w-full rounded-lg border border-[#cbd5df] bg-white px-3 py-2.5 text-sm"><option value={from.id}>{from.label} · {from.validFrom}</option>{versions.filter((v) => v.id !== from.id).map((v) => <option key={v.id} value={v.id}>{v.label} · {v.validFrom}</option>)}</select></label><label className="text-sm font-semibold text-[#526174]">Versión posterior<select name="hasta" defaultValue={to.id} className="mt-2 block w-full rounded-lg border border-[#cbd5df] bg-white px-3 py-2.5 text-sm">{versions.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.validFrom}</option>)}</select></label><button className="rounded-lg bg-[#173f6b] px-5 py-2.5 text-sm font-bold text-white">Comparar</button></form>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{(["modified", "added", "removed", "unchanged"] as const).map((kind) => <div key={kind} className="rounded-xl border border-[#e2e6eb] bg-white p-4"><p className="text-2xl font-bold text-[#173f6b]">{comparison.summary[kind]}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8792a2]">{{ modified: "Modificados", added: "Agregados", removed: "Eliminados", unchanged: "Sin cambios" }[kind]}</p></div>)}</div>
        <div className="mt-6 space-y-4">{comparison.changes.filter((change) => change.kind !== "unchanged").map((change) => <article key={change.key} className="rounded-2xl border border-[#e2e6eb] bg-white p-6"><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${change.kind === "added" ? "bg-[#e8f4ed] text-[#398264]" : change.kind === "removed" ? "bg-[#fbeaea] text-[#b34d4d]" : "bg-[#fff1df] text-[#b76b28]"}`}>{change.kind === "added" ? "Agregado" : change.kind === "removed" ? "Eliminado" : "Modificado"}</span><h2 className="font-bold text-[#173f6b]">Artículo {change.after?.number ?? change.before?.number}</h2></div>{change.kind !== "added" && <div className="mt-5 rounded-lg border-l-4 border-[#d98b8b] bg-[#fff7f7] p-4"><p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#a66a6a]">Texto anterior</p><p className="text-sm leading-7 text-[#526174]">{change.before?.paragraphs.join(" ")}</p></div>}{change.kind !== "removed" && <div className="mt-3 rounded-lg border-l-4 border-[#76ad91] bg-[#f3faf5] p-4"><p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#398264]">Texto posterior</p><p className="text-sm leading-7 text-[#526174]">{change.after?.paragraphs.join(" ")}</p></div>}</article>)}</div>
      </div>
    </main>
  );
}
