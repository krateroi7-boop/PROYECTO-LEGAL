import { ReaderFrame } from "@/components/reader/reader-frame";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compareVersions } from "@/domain/versioning/compare";
import { getVersion } from "@/lib/versioning-data";
import { getReaderVersions } from "@/lib/reader/data";
import { readerUrl } from "@/lib/reader/structure";

export const dynamic = "force-dynamic";
const changeLabels = { modified: "Modificados", added: "Agregados", removed: "Eliminados", unchanged: "Sin cambios" };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const versions = await getReaderVersions(slug);
  if (!versions.length) notFound();
  const fromSummary = query.desde ? versions.find((v) => v.id === query.desde) : versions[0];
  const toSummary = query.hasta ? versions.find((v) => v.id === query.hasta) : versions[versions.length - 1];
  if (!fromSummary || !toSummary) notFound();
  const [from, to] = await Promise.all([getVersion(slug, fromSummary.id), getVersion(slug, toSummary.id)]);
  if (!from || !to) notFound();
  const comparison = compareVersions(from, to);
  return <ReaderFrame><main className="reader-companion reader-comparison">
    <Link href={`/normas/${slug}`}>← Volver a la norma</Link>
    <h1>Cambios en {from.law.shortTitle}</h1>
    <p>Comparación de diferencias textuales entre versiones publicadas. No determina automáticamente efectos jurídicos ni cambios de vigencia.</p>
    <form className="reader-compare-form">{([{ name: "desde", label: "Versión anterior", value: from.id }, { name: "hasta", label: "Versión posterior", value: to.id }] as const).map((field) => <label key={field.name}>{field.label}<select name={field.name} defaultValue={field.value}>{versions.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.dateLabel}</option>)}</select></label>)}<button type="submit">Comparar</button></form>
    <dl className="reader-compare-summary">{(["modified", "added", "removed", "unchanged"] as const).map((kind) => <div key={kind}><dt>{changeLabels[kind]}</dt><dd>{comparison.summary[kind]}</dd></div>)}</dl>
    {comparison.changes.filter((change) => change.kind !== "unchanged").map((change) => <article id={`cambio-${change.key}`} key={change.key} className="reader-comparison-change">
      <p className="reader-change-kind" data-kind={change.kind}>{change.kind === "added" ? "Agregado" : change.kind === "removed" ? "Eliminado" : "Modificado"}</p>
      <h2>{change.after?.label ?? change.before?.label ?? `Artículo ${change.after?.number ?? change.before?.number}`}</h2>
      <div className="reader-comparison-texts">{change.before && <section><h3>Texto anterior</h3><Link href={readerUrl(slug, from.id, change.key)}>Abrir artículo anterior</Link><p>{change.before.paragraphs.join("\n\n")}</p></section>}{change.after && <section><h3>Texto posterior</h3><Link href={readerUrl(slug, to.id, change.key)}>Abrir artículo posterior</Link><p>{change.after.paragraphs.join("\n\n")}</p></section>}</div>
    </article>)}
    {!comparison.changes.some((c) => c.kind !== "unchanged") && <p>No hay diferencias textuales entre las versiones seleccionadas.</p>}
  </main></ReaderFrame>;
}
