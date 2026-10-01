import { ReaderFrame } from "@/components/reader/reader-frame";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLaw } from "@/lib/legislation-data";
import { getReaderVersions } from "@/lib/reader/data";
import { readerDate } from "@/lib/reader/presentation";

export const dynamic = "force-dynamic";

export default async function VersionHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [law, versions] = await Promise.all([getLaw(slug), getReaderVersions(slug)]);
  if (!law) notFound();
  return <ReaderFrame><main className="reader-companion">
    <Link href={`/normas/${slug}`}>← Volver a la norma</Link>
    <h1>Historial de {law.type} {law.number}</h1>
    <p>Versiones conservadas y publicadas en Legisdata. Este listado puede no incluir todo el historial de la fuente.</p>
    {versions.length > 1 && <Link className="reader-history-compare" href={`/normas/${slug}/comparar`}>Comparar versiones</Link>}
    <ol className="reader-timeline">{[...versions].reverse().map((version) => {
      const index = versions.indexOf(version), previous = versions[index - 1];
      return <li key={version.id}><h2>{version.dateLabel}</h2><p>{version.label}</p>{version.validTo && <p>Hasta {readerDate(version.validTo)}</p>}<div className="reader-timeline-links"><Link href={`/normas/${slug}/versiones/${version.id}`}>Ver texto</Link>{previous && <Link href={`/normas/${slug}/comparar?desde=${previous.id}&hasta=${version.id}`}>Comparar</Link>}</div></li>;
    })}</ol>
    {!versions.length && <p>No hay versiones adicionales disponibles.</p>}
  </main></ReaderFrame>;
}
