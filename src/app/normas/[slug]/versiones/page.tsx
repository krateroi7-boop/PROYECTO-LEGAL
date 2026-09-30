import { ReaderFrame } from "@/components/reader/reader-frame";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaw } from "@/lib/legislation-data";
import { getReaderVersions } from "@/lib/reader/data";

export const dynamic = "force-dynamic";

export default async function VersionHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [law, versions] = await Promise.all([getLaw(slug), getReaderVersions(slug)]);
  if (!law) notFound();
  return (
    <ReaderFrame><main className="min-h-screen bg-[var(--r-bg)] px-6 py-10 text-[var(--r-ink)]">
      <div className="mx-auto max-w-4xl">
        <Link href={`/normas/${slug}`} className="text-sm font-semibold text-[var(--r-accent)]">Volver a la norma</Link>
        <h1 className="mt-6 text-3xl font-bold text-[var(--r-accent)]">Historial de {law.type} {law.number}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--r-muted)]">Versiones conservadas y publicadas en Legisdata. Este listado puede no incluir todo el historial de la fuente.</p>
        {versions.length > 1 ? <Link href={`/normas/${slug}/comparar`} className="mt-5 inline-block font-semibold text-[var(--r-accent)] underline">Comparar versiones</Link> : null}
        <ol className="mt-6 space-y-3">
          {[...versions].reverse().map((version) => <li key={version.id} className="rounded-xl border border-[var(--r-line)] bg-[var(--r-paper)] p-5">
            <Link href={`/normas/${slug}/versiones/${version.id}`} className="font-semibold text-[var(--r-accent)] underline">{version.label}</Link>
            <p className="mt-2 text-sm text-[var(--r-muted)]">{version.dateLabel}{version.validTo ? ` · Hasta ${version.validTo}` : ""}{version.isCurrent ? " · Versión de consulta actual" : ""}</p>
          </li>)}
        </ol>
        {!versions.length ? <p className="mt-6 text-sm text-[var(--r-muted)]">No hay versiones adicionales disponibles.</p> : null}
      </div>
    </main></ReaderFrame>
  );
}
