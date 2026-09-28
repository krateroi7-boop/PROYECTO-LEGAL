import Link from "next/link";
import { requireRole } from "@/auth/guards";
import { getDb } from "@/db/client";
import { sourcePolicies } from "@/db/schema";
import { sourceRegistry } from "@/sources/registry";
import { recordSourcePolicy } from "@/app/actions/source-policy";
import { getSourceMetrics } from "@/sources/metrics";

export default async function SourcesAdminPage() {
  const actor = await requireRole(["reviewer", "admin"]);
  const policies = await getDb().select().from(sourcePolicies);
  const metrics = await getSourceMetrics("bcn-leychile");
  return <main className="mx-auto max-w-4xl px-6 py-10 text-[#192231]">
    <Link href="/admin/importaciones" className="text-[#173f6b] underline">Revisión editorial</Link>
    <h1 className="mt-6 text-3xl font-bold text-[#173f6b]">Condiciones de uso de las fuentes</h1>
    <section className="mt-6 rounded border p-5"><h2 className="font-bold">Operación BCN · últimos 30 días</h2><p className="mt-2">Aciertos de caché: {metrics.cacheHitRatio === null ? "Sin datos" : `${Math.round(metrics.cacheHitRatio * 100)}%`} · Conversión de descubrimiento: {metrics.discoveryConversion === null ? "Sin datos" : `${Math.round(metrics.discoveryConversion * 100)}%`}</p><p className="mt-2">Propuestas pendientes: {metrics.pending.count}{metrics.pending.oldest ? ` · Más antigua: ${new Date(metrics.pending.oldest).toLocaleDateString("es-CL")}` : ""}</p><table className="mt-4 w-full text-left text-sm"><thead><tr><th>Operación / evento</th><th>Resultado</th><th>Cantidad</th><th>Media ms</th></tr></thead><tbody>{metrics.events.map((event) => <tr key={`${event.operation}:${event.kind}:${event.outcome}`}><td>{event.operation} / {event.kind}</td><td>{event.outcome}</td><td>{event.count}</td><td>{event.averageMs ?? "—"}</td></tr>)}</tbody></table></section>
    <ul className="mt-3 text-sm">{metrics.cacheByOperation.map((item) => <li key={item.operation}>{item.operation}: {item.ratio === null ? "Sin datos" : `${Math.round(item.ratio * 100)}% de aciertos`} · negativos {item.negative} · desactualizados {item.stale}</li>)}</ul>
    <p className="mt-3 text-sm">Representaciones: {metrics.changes.map((item) => `${item.change}: ${item.count}`).join(" · ") || "Sin cambios registrados"}. Un checksum distinto no acredita un cambio jurídico.</p>
    <p className="mt-4 leading-7">Registre la evidencia que habilita la reproducción y distribución previstas para Legisdata. Una respuesta técnica exitosa de la fuente no sustituye esta revisión. Cada documento conserva su aprobación editorial independiente.</p>
    {sourceRegistry.map((source) => {
      const policy = policies.find((item) => item.sourceKey === source.key);
      return <section key={source.key} className="mt-8 rounded-xl border border-[#dfe4eb] p-6">
        <h2 className="text-xl font-bold">{source.name}</h2>
        <p className="mt-2">{policy?.publicationAllowed ? "Publicación habilitada por revisión registrada" : "Publicación bloqueada o pendiente de revisión"}</p>
        <p className="mt-2 text-sm text-[#697789]">{source.limitation}</p>
        {policy?.reviewedAt ? <p className="mt-2 text-sm">Revisado: {policy.reviewedAt.toLocaleString("es-CL")} · Responsable: {policy.reviewedBy}</p> : null}
        {actor.role === "admin" ? <form action={recordSourcePolicy} className="mt-5 grid gap-3">
          <input type="hidden" name="sourceKey" value={source.key} />
          <label className="grid gap-1 text-sm">Documento de respaldo (URL)<input type="url" name="evidenceUrl" defaultValue={policy?.evidenceUrl ?? ""} required className="rounded border p-2" /></label>
          <label className="grid gap-1 text-sm">Fundamento y alcance de la decisión<textarea name="reason" minLength={10} maxLength={2000} required className="rounded border p-2" /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="attested" className="mt-1" />He verificado las condiciones aplicables a la conservación, presentación y redistribución de este contenido en Legisdata.</label>
          <div className="flex gap-3"><button name="decision" value="allow" className="rounded bg-[#173f6b] px-4 py-2 font-semibold text-white">Registrar habilitación</button><button name="decision" value="block" className="rounded border px-4 py-2">Bloquear publicación</button></div>
        </form> : null}
      </section>;
    })}
  </main>;
}
