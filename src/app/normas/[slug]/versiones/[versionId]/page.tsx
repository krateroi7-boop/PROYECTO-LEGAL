import Link from "next/link";
import { notFound } from "next/navigation";
import { getVersion, getVersions } from "@/lib/versioning-data";

export function generateStaticParams() {
  return Object.entries({ "ley-19880": getVersions("ley-19880") }).flatMap(([slug, versions]) =>
    versions.map((version) => ({ slug, versionId: version.id })),
  );
}

export default async function HistoricalVersionPage({ params }: { params: Promise<{ slug: string; versionId: string }> }) {
  const { slug, versionId } = await params;
  const version = getVersion(slug, versionId);
  if (!version) notFound();

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
      <header className="border-b border-[#dfe4eb] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><Link href="/" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f6b] text-sm font-bold text-white">L</span><span className="text-lg font-bold tracking-tight">Legis<span className="text-[#d37d42]">data</span></span></Link><Link href={`/normas/${slug}`} className="text-sm font-semibold text-[#526174]">Volver a la norma</Link></div></header>
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
        <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d37d42]">Versión histórica · {version.validFrom}</p><h1 className="mt-3 text-3xl font-bold leading-tight text-[#173f6b]">{version.law.title}</h1><p className="mt-3 text-sm text-[#697789]">{version.label} · {version.id}</p></div>
        <section className="rounded-2xl border border-[#e2e6eb] bg-white px-6 py-8 md:px-12"><p className="mb-8 border-b border-[#edf0f3] pb-6 text-sm leading-7 text-[#697789]">{version.law.description}</p>{version.law.articles.map((article) => <article id={article.id} key={article.id} className="border-t border-[#edf0f3] py-7 first:border-t-0 first:pt-0"><h2 className="mb-3 text-lg font-bold text-[#173f6b]">Artículo {article.number}{article.title ? ` · ${article.title}` : ""}</h2>{article.paragraphs.map((paragraph) => <p key={paragraph} className="mb-3 text-[17px] leading-8 text-[#2e3d4f]">{paragraph}</p>)}</article>)}</section>
      </div>
    </main>
  );
}
