"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Resolution } from "@/sources/resolver";
import type { SourceReference } from "@/sources/types";
import { ReviewRequest } from "./review-request";

export function ResolutionPanel({ reference, initial, refresh = false, discoveryId, compact = false }: { reference: SourceReference; initial?: Resolution; refresh?: boolean; discoveryId?: string; compact?: boolean }) {
  const [result, setResult] = useState(initial);
  const [running, setRunning] = useState(!initial || refresh);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const referenceText = `${reference.kind}:${reference.value}`;
  useEffect(() => {
    if (initial && !refresh && !attempt) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 30_000;
    const expiry = setTimeout(() => { controller.abort(); if (timer) clearTimeout(timer); setRunning(false); setError("La comprobación está tardando. Puede volver a intentarlo."); }, 30_000);
    async function poll() {
      try {
        const params = new URLSearchParams({ referencia: referenceText });
        if (discoveryId) params.set("discovery", discoveryId);
        const response = await fetch(`/api/v1/resolver?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!body.data?.status) throw new Error("unavailable");
        const next: Resolution = body.data;
        setResult((previous) => ["unavailable", "resolving"].includes(next.status) && previous?.status === "published" ? { ...previous, cache: "stale", reason: next.reason } : next);
        const delay = Math.max(1, next.retryAfterSeconds ?? 2) * 1000;
        if ((next.status === "resolving" || next.reason === "source_backoff") && Date.now() + delay < deadline) {
          timer = setTimeout(poll, delay);
        } else { clearTimeout(expiry); setRunning(false); }
      } catch { if (!controller.signal.aborted) { clearTimeout(expiry); setRunning(false); setError("No fue posible completar la comprobación. Puede volver a intentarlo."); } }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(expiry); if (timer) clearTimeout(timer); };
  }, [referenceText, initial, refresh, discoveryId, attempt]);
  const labels = { published: "Publicado en Legisdata", pending_review: "Norma recuperada, pendiente de revisión", resolving: "Recuperando la norma", not_found: "La fuente no encontró la norma", unavailable: "La fuente no está disponible temporalmente" };
  // Derived navigation link, not metadata returned by discovery; it needs no XML download.
  const sourceUrl = result?.sourceUrl ?? (reference.kind === "idNorma" ? `https://www.bcn.cl/leychile/navegar?idNorma=${encodeURIComponent(reference.value)}` : undefined);
  if (compact) return <aside aria-live="polite" className="mt-3 text-sm text-[#697789]">{running ? "Comprobando si la fuente informa cambios…" : error || (result?.cache === "stale" ? "La última comprobación de la fuente está desactualizada o hay una actualización pendiente de revisión." : "Última comprobación de la fuente disponible.")}{result?.checkedAt ? ` Comprobada el ${new Date(result.checkedAt).toLocaleDateString("es-CL")}.` : ""}</aside>;
  return <section aria-live="polite" className="mt-6 rounded-xl border border-[#e2e6eb] bg-white p-6">
    <h2 className="text-xl font-bold text-[#173f6b]">{result ? labels[result.status] : "Consultando la referencia"}</h2>
    {running ? <p className="mt-2 text-sm">Comprobando la fuente…</p> : null}
    {result?.status === "unavailable" ? <p className="mt-3">No se pudo recuperar el texto desde BCN. Esto no significa que la norma no exista.</p> : null}
    {result?.status === "unavailable" && result.retryAfterSeconds ? <p className="mt-3">{result.reason === "rate-limit" ? "BCN limitó temporalmente las consultas." : "Hay una espera temporal antes de volver a consultar BCN."} Intente nuevamente en aproximadamente {Math.ceil(result.retryAfterSeconds / 60)} {result.retryAfterSeconds <= 60 ? "minuto" : "minutos"}. Puede consultar el enlace oficial mientras tanto.</p> : null}
    {result?.proposal ? <div className="mt-3"><p className="font-semibold">{result.proposal.title}</p><p>{result.proposal.type} {result.proposal.number}</p>{result.proposal.publicationDate ? <p>Publicación informada: {result.proposal.publicationDate.slice(0, 10)}</p> : null}{result.proposal.organisms?.length ? <p>{result.proposal.organisms.join("; ")}</p> : null}</div> : null}
    {result?.status === "pending_review" ? <p className="mt-3">El texto todavía no está disponible en Legisdata porque requiere revisión editorial. Puede solicitar su revisión o consultar la fuente oficial.</p> : null}
    {result?.cache === "stale" ? <p className="mt-3 text-sm">La comprobación está desactualizada o hay cambios pendientes de revisión. La versión publicada se conserva.</p> : null}
    {result?.checkedAt ? <p className="mt-3 text-sm">Última comprobación: {new Date(result.checkedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}.</p> : null}
    {result?.slug && result.versionId ? <Link href={`/normas/${result.slug}/versiones/${result.versionId}`} className="mt-4 inline-block font-bold underline">Leer en Legisdata</Link> : null}
    {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="ml-4 mt-4 inline-block underline">Consultar fuente BCN</a> : null}
    {result?.status === "pending_review" && result.proposal?.requestable ? <ReviewRequest batchId={result.proposal.id} /> : null}
    {error ? <p role="alert" className="mt-3">{error}</p> : null}
    {!running && (error || result?.status === "unavailable" || result?.status === "resolving") ? <button className="mt-4 underline" onClick={() => { setRunning(true); setError(""); setAttempt((value) => value + 1); }}>Reintentar comprobación</button> : null}
  </section>;
}
