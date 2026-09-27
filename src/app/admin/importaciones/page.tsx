import Link from "next/link";
import { requireRole } from "@/auth/guards";
import {
  approveEditorialBatch,
  publishEditorialBatch,
  rejectEditorialBatch,
  reviewRelation,
} from "@/app/actions/admin";
import { getEditorialBatches } from "@/lib/editorial-data";
import { getReviewRelations } from "@/lib/relations-data";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function ImportReviewPage() {
  const actor = await requireRole(["reviewer", "admin"]);
  const [batches, relations] = await Promise.all([getEditorialBatches(), getReviewRelations()]);
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#192231]">
      <header className="border-b border-[#dfe4eb] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f6b] text-sm font-bold text-white">L</span>
            <span className="text-lg font-bold tracking-tight">Legis<span className="text-[#d37d42]">data</span></span>
          </Link>
          <span className="rounded-full bg-[#fff1df] px-3 py-1 text-xs font-bold text-[#b76b28]">
            {actor.role === "admin" ? "Administración editorial" : "Revisión editorial"}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d37d42]">Administración</p>
        <h1 className="mt-3 text-3xl font-bold text-[#173f6b]">Importaciones y revisión</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#697789]">
          Los lotes sincronizados desde fuentes externas permanecen fuera de la web pública hasta que se revisan y publican explícitamente.
        </p>
        <Link href="/admin/fuentes" className="mt-3 inline-block text-sm font-semibold text-[#173f6b] underline">Condiciones de uso de las fuentes</Link>
        <section className="mt-8 overflow-hidden rounded-2xl border border-[#e2e6eb] bg-white">
          <div className="border-b border-[#edf0f3] bg-[#f8fafb] px-6 py-4">
            <h2 className="font-bold text-[#173f6b]">Lotes editoriales</h2>
          </div>
          {batches.length === 0 ? (
            <p className="px-6 py-8 text-sm text-[#697789]">No hay lotes persistidos en esta instancia.</p>
          ) : (
            <div className="divide-y divide-[#edf0f3]">
              {batches.map((batch) => (
                <div key={batch.id} className="grid gap-5 px-6 py-6 lg:grid-cols-[1fr_170px_180px_260px] lg:items-center">
                  <div>
                    <p className="font-bold text-[#173f6b]">{batch.normTitle ?? "Norma pendiente de resolver"}</p>
                    <p className="mt-1 text-xs text-[#697789]">{batch.normSlug ?? "sin slug"} · {batch.itemCount} nodos</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-[#8792a2]">{batch.checksum}</p>
                    <Link href={`/admin/importaciones/${batch.id}`} className="mt-2 inline-block text-sm font-semibold text-[#173f6b] underline">Revisar texto, diferencias y evidencia</Link>
                  </div>
                  <div>
                    <span className="rounded-full bg-[#eef3f8] px-3 py-1 text-xs font-bold capitalize text-[#526174]">
                      {statusLabel(batch.status)}
                    </span>
                    <p className="mt-2 text-xs text-[#8792a2]">{batch.versionLabel ?? "sin versión propuesta"}</p>
                  </div>
                  <div className="text-xs text-[#697789]">
                    <p>Capturado: {(batch.sourceCapturedAt ?? batch.startedAt).toLocaleString("es-CL")}</p>
                    <p className="mt-1">{batch.sourceName ?? "Fuente sin identificar"}</p>
                    {!batch.publicationAllowed ? <p className="mt-1 text-[#a94c4c]">Publicación bloqueada hasta verificar condiciones de uso.</p> : null}
                    {batch.rejectionReason ? <p className="mt-1 text-[#a94c4c]">{batch.rejectionReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {batch.status === "pending_review" ? (
                      <>
                        <form action={approveEditorialBatch}>
                          <input type="hidden" name="batchId" value={batch.id} />
                          <button className="rounded-lg bg-[#e8f4ed] px-3 py-2 text-xs font-bold text-[#398264]" type="submit">Aprobar</button>
                        </form>
                        <form action={rejectEditorialBatch} className="flex gap-2">
                          <input type="hidden" name="batchId" value={batch.id} />
                          <input className="w-36 rounded-lg border border-[#dfe4eb] px-2 py-2 text-xs" name="reason" placeholder="Motivo rechazo" required />
                          <button className="rounded-lg bg-[#fff0f0] px-3 py-2 text-xs font-bold text-[#a94c4c]" type="submit">Rechazar</button>
                        </form>
                      </>
                    ) : null}
                    {batch.status === "approved" && batch.publicationAllowed && actor.role === "admin" ? (
                      <form action={publishEditorialBatch}>
                        <input type="hidden" name="batchId" value={batch.id} />
                        <button className="rounded-lg bg-[#173f6b] px-3 py-2 text-xs font-bold text-white" type="submit">Publicar</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="mt-10 overflow-hidden rounded-2xl border border-[#e2e6eb] bg-white">
          <div className="border-b border-[#edf0f3] bg-[#f8fafb] px-6 py-4">
            <h2 className="font-bold text-[#173f6b]">Relaciones detectadas</h2>
            <p className="mt-1 text-xs text-[#697789]">Sólo las verificadas aparecen como enlaces públicos.</p>
          </div>
          <div className="divide-y divide-[#edf0f3]">
            {relations.map((relation) => (
              <div key={relation.id} className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_1fr_140px_210px] md:items-center">
                <div><p className="font-bold text-[#173f6b]">{relation.sourceLabel}</p><p className="mt-1 text-xs text-[#8792a2]">{relation.evidence}</p></div>
                <p className="font-semibold text-[#526174]">{relation.targetLabel}</p>
                <p className="capitalize text-[#526174]">{relation.type}</p>
                <div>
                  {relation.status === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={reviewRelation}><input type="hidden" name="relationId" value={relation.id} /><input type="hidden" name="status" value="verified" /><button className="rounded-lg bg-[#e8f4ed] px-2.5 py-1.5 text-xs font-bold text-[#398264]" type="submit">Verificar</button></form>
                      <form action={reviewRelation}><input type="hidden" name="relationId" value={relation.id} /><input type="hidden" name="status" value="rejected" /><button className="rounded-lg bg-[#fff0f0] px-2.5 py-1.5 text-xs font-bold text-[#a94c4c]" type="submit">Rechazar</button></form>
                    </div>
                  ) : <span className="rounded-full bg-[#eef3f8] px-3 py-1 text-xs font-bold text-[#526174]">{relation.status}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
