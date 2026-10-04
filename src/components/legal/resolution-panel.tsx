"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Resolution } from "@/sources/resolver";
import type { SourceReference } from "@/sources/types";
import { ReviewRequest } from "./review-request";

export function ResolutionPanel({ reference, initial, discoveryId, compact = false, authenticated = false }: { reference: SourceReference; initial?: Resolution; discoveryId?: string; compact?: boolean; authenticated?: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState(initial);
  const [running, setRunning] = useState(!initial && !compact);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const referenceText = `${reference.kind}:${reference.value}`;
  const run = useCallback(async (method: "GET" | "POST") => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const deadline = Date.now() + 30_000;
    const expiry = setTimeout(() => { controller.abort(); setRunning(false); setError("La comprobación está tardando. Puede volver a intentarlo."); }, 30_000);
    let nextMethod = method;
    try {
      while (!controller.signal.aborted) {
        const response = await fetch(nextMethod === "POST" ? "/api/v1/resolver" : `/api/v1/resolver?${new URLSearchParams({ referencia: referenceText })}`, {
          method: nextMethod, signal: controller.signal, cache: "no-store",
          ...(nextMethod === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referencia: referenceText, ...(discoveryId ? { discovery: discoveryId } : {}) }) } : {}),
        });
        const body = await response.json();
        if (response.status === 401) { setError("Inicie sesión para incorporar esta norma."); break; }
        if (response.status === 429) { setError(`Se alcanzó el límite temporal. Reintente en ${response.headers.get("Retry-After") ?? "60"} segundos.`); break; }
        if (!body.data?.status) throw new Error("unavailable");
        const next: Resolution = body.data;
        setResult(next);
        if (next.status === "published" && next.slug && method === "POST") { router.push(`/normas/${next.slug}`); break; }
        const delay = Math.max(1, next.retryAfterSeconds ?? 2) * 1000;
        if (next.status !== "resolving" || Date.now() + delay >= deadline) break;
        setRunning(true);
        nextMethod = "GET";
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, delay);
          function done() { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); }
          controller.signal.addEventListener("abort", done, { once: true });
        });
      }
    } catch { if (!controller.signal.aborted) setError("No fue posible completar la comprobación. Puede volver a intentarlo."); }
    finally { clearTimeout(expiry); if (!controller.signal.aborted) setRunning(false); }
  }, [referenceText, discoveryId, router]);
  useEffect(() => {
    let cancelled = false;
    // Subscribe after mount; Strict Mode cleanup cancels the first subscription.
    if (!compact && initial?.status !== "published") queueMicrotask(() => { if (!cancelled) void run("GET"); });
    return () => { cancelled = true; active.current?.abort(); };
  }, [initial, compact, run]);
  const labels = { published: "Publicado en Legisdata", pending_review: "Norma recuperada, pendiente de revisión", resolving: "Recuperando la norma", not_found: "La fuente no encontró la norma", unavailable: "La fuente no está disponible temporalmente", not_requested: "Norma aún no incorporada", blocked: "Incorporación no habilitada para esta fuente" };
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
    {result?.status === "blocked" ? <p className="mt-3">La incorporación requiere una política de fuente autorizada. Puede consultar el documento oficial.</p> : null}
    {!running && (!result || ["not_requested", "unavailable", "resolving"].includes(result.status) || error) ? authenticated
      ? <button className="mt-4 font-bold underline" onClick={() => { setRunning(true); setError(""); void run("POST"); }}>Incorporar y leer</button>
      : <Link className="mt-4 inline-block font-bold underline" href={`/api/auth/signin?callbackUrl=${encodeURIComponent(`/consultar?${new URLSearchParams({ referencia: referenceText, ...(discoveryId ? { discovery: discoveryId } : {}) })}`)}`}>Iniciar sesión para incorporar</Link> : null}
  </section>;
}
