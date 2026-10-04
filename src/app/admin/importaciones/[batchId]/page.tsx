import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/auth/guards";
import { getEditorialDetail } from "@/lib/editorial-detail";
import { approveEditorialBatch, publishEditorialBatch, rejectEditorialBatch } from "@/app/actions/admin";

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const actor = await requireRole(["reviewer", "admin"]);
  const parsed = z.string().uuid().safeParse((await params).batchId);
  if (!parsed.success) notFound();
  const detail = await getEditorialDetail(parsed.data);
  if (!detail) notFound();
  const { batch, source, norm, nodes, previousNodes, publicationAllowed } = detail;
  const previous = new Map(previousNodes.map((node) => [node.stableKey, node]));
  const previousKeys = new Map(previousNodes.map((node) => [node.id, node.stableKey]));
  const currentKeys = new Map(nodes.map((node) => [node.id, node.stableKey]));
  const present = new Set(nodes.map((node) => node.stableKey));
  return <main className="mx-auto max-w-6xl px-6 py-10 text-[#192231]">
    <Link href="/admin/importaciones" className="text-[#173f6b] underline">Importaciones</Link>
    <h1 className="mt-6 text-3xl font-bold text-[#173f6b]">Revisar {source.normalizedContent?.title ?? norm?.title ?? "captura sin normalización"}</h1>
    <p className="mt-3">Estado: {batch.status} · Fuente: {source.sourceName} · Captura: {source.capturedAt.toLocaleString("es-CL")}</p>
    {batch.error ? <p role="alert" className="mt-3">{batch.error}</p> : null}
    <p className="mt-2 break-all font-mono text-xs">SHA-256: {source.checksum}</p>
    <p className="mt-2 text-sm">Normalizador: {source.parserVersion ?? source.parser}</p>
    <a href={`/api/admin/importaciones/${batch.id}/original`} className="mt-4 inline-block text-[#173f6b] underline">Descargar original conservado</a>
    <p className="mt-4">{publicationAllowed ? "Condiciones de uso documentadas." : "Publicación bloqueada hasta documentar las condiciones de uso."} <Link href="/admin/fuentes" className="underline">Revisar fuente</Link></p>
    {source.normalizedContent?.warnings.length ? <ul className="mt-4 list-disc pl-5">{source.normalizedContent.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    {detail.validations.length ? <section className="mt-5"><h2 className="font-bold">Integridad de la representación</h2><ul>{detail.validations.map((item) => <li key={item.id}>{item.severity} · {item.rule}: {item.message}</li>)}</ul></section> : null}
    <div className="mt-6 flex flex-wrap gap-4">
      {batch.status === "pending_review" ? <>
        <form action={approveEditorialBatch}><input type="hidden" name="batchId" value={batch.id} /><button className="rounded bg-[#173f6b] px-4 py-2 text-white">Aprobar revisión editorial</button></form>
        <form action={rejectEditorialBatch} className="flex gap-2"><input type="hidden" name="batchId" value={batch.id} /><input aria-label="Motivo del rechazo" name="reason" required maxLength={2000} className="rounded border p-2" placeholder="Motivo del rechazo" /><button className="rounded border px-4 py-2">Rechazar</button></form>
      </> : null}
      {batch.status === "approved" && publicationAllowed && actor.role === "admin" ? <form action={publishEditorialBatch}><input type="hidden" name="batchId" value={batch.id} /><button className="rounded bg-[#173f6b] px-4 py-2 text-white">Publicar versión revisada</button></form> : null}
    </div>
    <h2 className="mt-10 text-xl font-bold">Texto normalizado y cambios frente a la versión publicada</h2>
    {nodes.map((node) => {
      const old = previous.get(node.stableKey);
      const changed = old && (old.text !== node.text || old.label !== node.label || old.title !== node.title || old.type !== node.type || old.position !== node.position || previousKeys.get(old.parentId ?? "") !== currentKeys.get(node.parentId ?? ""));
      return <section key={node.id} className="mt-4 rounded border border-[#dfe4eb] p-5">
        <h3 className="font-bold">{node.label} · {old ? changed ? "Modificado" : "Sin cambios" : "Nuevo"}</h3>
        {node.title ? <p className="mt-2 font-semibold">{node.title}</p> : null}
        <p className="mt-3 whitespace-pre-wrap leading-7">{node.text}</p>
        {changed ? <details className="mt-3"><summary className="cursor-pointer font-semibold">Texto publicado anterior</summary><p className="mt-2 font-semibold">{old.label}{old.title ? ` · ${old.title}` : ""}</p><p className="mt-2 text-sm">{old.type} · Posición: {old.position} · Padre: {previousKeys.get(old.parentId ?? "") ?? "Raíz"}</p><p className="mt-2 whitespace-pre-wrap leading-7">{old.text}</p></details> : null}
      </section>;
    })}
    {previousNodes.filter((node) => !present.has(node.stableKey)).map((node) => <section key={node.id} className="mt-4 rounded border p-5"><h3 className="font-bold">Ausente en la nueva captura: {node.label}</h3><p className="mt-3 whitespace-pre-wrap">{node.text}</p></section>)}
  </main>;
}
