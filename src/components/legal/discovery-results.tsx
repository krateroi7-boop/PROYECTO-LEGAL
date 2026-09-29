"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DiscoveryResult } from "@/sources/discovery-types";

export function DiscoveryResults({ query, localSlugs = [] }: { query: string; localSlugs?: string[] }) {
  const [result, setResult] = useState<DiscoveryResult>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = setTimeout(() => { controller.abort(); if (timer) clearTimeout(timer); setResult((old) => old?.candidates.length ? old : { status: "unavailable", candidates: [], cache: "none" }); }, 30_000);
    async function poll() {
      try {
        const response = await fetch(`/api/v1/descubrir?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        const next: DiscoveryResult = body.data ?? { status: "unavailable", candidates: [], cache: "none" };
        setResult(next);
        if (next.status === "in_progress") timer = setTimeout(poll, Math.max(1, next.retryAfterSeconds ?? 2) * 1000);
        else clearTimeout(expiry);
      } catch { if (!controller.signal.aborted) { clearTimeout(expiry); setResult({ status: "unavailable", candidates: [], cache: "none" }); } }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(expiry); if (timer) clearTimeout(timer); };
  }, [query, attempt]);
  const candidates = result?.candidates.filter((candidate) => !candidate.local || !localSlugs.includes(candidate.local.slug)) ?? [];
  return <section className="mt-8" aria-live="polite"><h2 className="text-xl font-bold text-[#173f6b]">{localSlugs.length ? "Más normas para consultar" : "Normas para consultar"}</h2>
    <p className="mt-2 text-sm text-[#697789]">Referencias de BCN / LeyChile. Seleccione una norma para consultar su disponibilidad en Legisdata. La búsqueda no acredita vigencia ni cobertura completa.</p>
    {!result || result.status === "in_progress" ? <p className="mt-4">Buscando más normas…</p> : null}
    {result?.cache === "stale" ? <p className="mt-3 text-sm">Resultados conservados de una consulta anterior; no se pudo actualizar la fuente.</p> : null}
    {result?.status === "unavailable" ? <p className="mt-4">{result.reason === "disabled" ? "El descubrimiento remoto está desactivado en esta instancia." : "BCN no está disponible ahora. Los resultados locales siguen disponibles."}</p> : null}
    {result?.status === "empty" ? <p className="mt-4">No encontramos candidatos con esta búsqueda. Esto no confirma que la norma no exista.</p> : null}
    {result?.status === "available" && !candidates.length ? <p className="mt-4">Los candidatos encontrados ya aparecen entre las publicaciones locales.</p> : null}
    {result?.status === "available" && candidates.length > 0 ? <p className="mt-4 font-semibold">{candidates.length === 1 ? "1 coincidencia disponible para consultar." : `${candidates.length} coincidencias disponibles para consultar.`}</p> : null}
    {candidates.map((candidate) => <article key={`${candidate.source}:${candidate.externalId ?? candidate.resourceUri}`} className="mt-4 rounded-xl border bg-white p-5">
      <p className="text-xs font-bold uppercase text-[#697789]">{candidate.local ? "Publicado en Legisdata" : "Disponible en fuente externa"}</p>
      <h3 className="mt-2 font-bold text-[#173f6b]">{candidate.title ?? "Norma sin título informado"}</h3>
      <p className="mt-2 text-sm">{candidate.type} {candidate.number}{candidate.publicationDate ? ` · ${candidate.publicationDate}` : ""}</p>
      {candidate.organisms?.map((org) => org.name ? <p key={org.uri} className="mt-1 text-sm">{org.name}</p> : null)}
      {candidate.match.strategy === "alias" ? <p className="mt-2 text-xs">Coincidencia mediante un nombre habitual de búsqueda.</p> : null}
      <p className="mt-2 text-xs text-[#697789]">Metadatos BCN · Consulta: {new Date(candidate.provenance.observedAt).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })} · Coincidencia calculada por Legisdata.</p>
      {candidate.reference ? <Link prefetch={false} href={candidate.local ? `/normas/${candidate.local.slug}` : `/consultar?referencia=${encodeURIComponent(`${candidate.reference.kind}:${candidate.reference.value}`)}&busqueda=${encodeURIComponent(query)}${result?.eventId ? `&discovery=${result.eventId}` : ""}`} className="mt-3 inline-block font-semibold underline">{candidate.local ? "Leer en Legisdata" : "Consultar esta norma"}</Link> : <a href={candidate.sourceUrl ?? candidate.resourceUri} rel="noreferrer" target="_blank" className="mt-3 inline-block underline">Ver recurso de la fuente</a>}
    </article>)}
    {result?.status === "unavailable" && result.reason !== "disabled" ? <button onClick={() => setAttempt((value) => value + 1)} className="mt-4 underline">Reintentar búsqueda externa</button> : null}
  </section>;
}
