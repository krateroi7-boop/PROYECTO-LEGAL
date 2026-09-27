import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaw } from "@/lib/legislation-data";
import { getVerifiedRelations } from "@/lib/relations-data";
import { getVersions } from "@/lib/versioning-data";
import { SourceProvenance } from "@/components/legal/source-provenance";
import { auth } from "@/auth";
import { LegalActions } from "@/components/personal/legal-actions";

export const dynamic = "force-dynamic";

export default async function LawPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const law = await getLaw(slug);
  if (!law) notFound();
  const [relations, versions] = await Promise.all([getVerifiedRelations(slug), getVersions(slug)]);
  const session = process.env.DATABASE_URL ? await auth() : null;

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
      <header className="border-b border-[#dfe4eb] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f6b] text-sm font-bold text-white">L</span>
            <span className="text-lg font-bold tracking-tight">Legis<span className="text-[#d37d42]">data</span></span>
          </Link>
          <Link href="/#normas" className="text-sm font-semibold text-[#526174] hover:text-[#173f6b]">Volver al catálogo</Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:px-10">
        <aside className="hidden lg:block">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-[#8792a2]">En esta norma</p>
          <nav className="space-y-1 border-l border-[#dfe4eb] pl-4 text-sm">
            {law.articles.map((article) => (
              <a key={article.id} href={`#${article.id}`} className="block py-2 text-[#526174] hover:text-[#173f6b]">{article.label ?? `Artículo ${article.number}`}</a>
            ))}
            <a href="#fuente" className="block py-2 text-[#526174] hover:text-[#173f6b]">Procedencia</a>
          </nav>
        </aside>
        <article className="min-w-0">
          <div className="mb-8">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] text-[#d37d42]">
              <span>{law.type} {law.number}</span><span className="h-1 w-1 rounded-full bg-[#d37d42]" /><span className="text-[#398264]">{law.status}</span>
            </div>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-[-0.03em] text-[#173f6b] md:text-4xl">{law.title}</h1>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#697789]"><span>Publicada el {law.published}</span><span>{law.updated}</span></div>
          </div>
          <div className="mb-8 flex gap-2 border-b border-[#dfe4eb] text-sm font-semibold">
            <span className="border-b-2 border-[#d37d42] px-4 py-3 text-[#173f6b]">Texto disponible</span>
            <Link href={`/normas/${law.slug}/versiones`} className="px-4 py-3 text-[#8792a2] hover:text-[#173f6b]">Historial</Link>
            {versions.length > 1 ? <Link href={`/normas/${law.slug}/comparar`} className="px-4 py-3 text-[#8792a2] hover:text-[#173f6b]">Comparar versiones</Link> : null}
          </div>
          <section className="rounded-2xl border border-[#e2e6eb] bg-white px-6 py-8 shadow-[0_8px_30px_rgba(22,45,72,0.04)] md:px-12">
            <p className="mb-10 border-b border-[#edf0f3] pb-8 text-base leading-8 text-[#526174]">{law.description}</p>
            <div className="mb-10">
              {law.articles.map((article) => (
                <section id={article.id} key={article.id} className="scroll-mt-8 border-t border-[#edf0f3] py-8 first:border-t-0 first:pt-0">
                  <h2 className="mb-4 text-lg font-bold text-[#173f6b]">{article.label ?? `Artículo ${article.number}`}{article.title ? ` · ${article.title}` : ""}</h2>
                  {article.paragraphs.map((paragraph) => <p key={paragraph} className="mb-4 text-[17px] leading-8 text-[#2e3d4f]">{paragraph}</p>)}
                  <a href={law.versionId ? `/normas/${slug}/versiones/${law.versionId}#${article.id}` : `#${article.id}`} className="text-xs font-bold text-[#d37d42]">Enlace a esta versión ↗</a>
                  {process.env.DATABASE_URL ? <LegalActions slug={slug} stableKey={article.id} versionId={law.versionId} isAuthenticated={Boolean(session?.user?.id)} /> : null}
                </section>
              ))}
            </div>
          </section>
        </article>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-[#e2e6eb] bg-white p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-[#8792a2]">Información</p>
            <dl className="space-y-4 text-sm"><div><dt className="text-[#8792a2]">Estado</dt><dd className="font-semibold text-[#398264]">{law.status}</dd></div><div><dt className="text-[#8792a2]">Publicación</dt><dd className="font-medium">{law.published}</dd></div><div><dt className="text-[#8792a2]">Artículos</dt><dd className="font-medium">{law.articles.filter((node) => !node.type || node.type === "articulo").length} artículos</dd></div></dl>
          </section>
          <section className="rounded-2xl border border-[#e2e6eb] bg-[#eef4f8] p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#173f6b]">Materias</p>
            <div className="flex flex-wrap gap-2">{law.topics.map((topic) => <span key={topic} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#526174]">{topic}</span>)}</div>
          </section>
          <section className="rounded-2xl border border-[#e2e6eb] bg-white p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-[#8792a2]">Relaciones verificadas</p>
            {relations.length ? <div className="space-y-3">{relations.map((relation) => { const targetSlug = relation.sourceSlug === slug ? relation.targetSlug : relation.sourceSlug; const targetLabel = relation.sourceSlug === slug ? relation.targetLabel : relation.sourceLabel; return <Link key={relation.id} href={`/normas/${targetSlug}`} className="block rounded-lg bg-[#f8fafb] p-3 hover:bg-[#eef4f8]"><span className="block text-xs font-bold uppercase tracking-[0.1em] text-[#d37d42]">{relation.type}</span><span className="mt-1 block text-sm font-semibold text-[#173f6b]">{targetLabel}</span></Link>; })}</div> : <p className="text-sm leading-6 text-[#697789]">No hay relaciones verificadas disponibles.</p>}
          </section>
          <SourceProvenance law={law} />
        </aside>
      </div>
    </main>
  );
}
