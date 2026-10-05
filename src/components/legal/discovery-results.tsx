"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DiscoveryResult } from "@/sources/discovery-types";
import { catalogName, officialCatalogUrl, type CatalogEntry } from "@/lib/catalog-presentation";
import { CatalogCard } from "@/components/library/catalog-card";

export function DiscoveryResults({ query, localSlugs = [], initialEntries = [], ingestionAvailable = false }: { query: string; localSlugs?: string[]; initialEntries?: CatalogEntry[]; ingestionAvailable?: boolean }) {
  const [result, setResult] = useState<DiscoveryResult>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!query.trim()) return;
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
  const remainingEntries = initialEntries.filter((entry) => !candidates.some((candidate) => candidate.source === entry.source && candidate.externalId === entry.externalId));
  return <section className="search-section" aria-live="polite"><h2>{query ? "Más normas para consultar" : "Normas esenciales"}</h2>
    {remainingEntries.length ? <div className="catalog-grid">{remainingEntries.map((entry) => <CatalogCard key={`${entry.source}:${entry.externalId}`} entry={entry} />)}</div> : null}
    {query && (!result || result.status === "in_progress") ? <p className="search-feedback">Buscando más normas…</p> : null}
    {result?.cache === "stale" ? <p className="search-feedback">Mostramos resultados de una consulta anterior. La fuente no pudo actualizarse ahora.</p> : null}
    {result?.status === "unavailable" ? <p className="search-feedback">{result.reason === "disabled" ? "La búsqueda ampliada no está disponible en este momento." : "La fuente externa no está disponible ahora. Los textos de Legisdata siguen disponibles."}</p> : null}
    {result?.status === "empty" ? <p className="search-feedback">No encontramos más normas con esta búsqueda. Puedes intentar otro nombre o consultar la fuente oficial.</p> : null}
    {result?.status === "available" && !candidates.length ? <p className="search-feedback">Las normas encontradas ya aparecen entre los textos disponibles.</p> : null}
    {candidates.map((candidate) => {
      const name = catalogName(candidate.source, candidate.externalId) ?? candidate.title ?? "Norma sin título informado";
      const selected = initialEntries.find((entry) => entry.source === candidate.source && entry.externalId === candidate.externalId);
      const localSlug = candidate.local?.slug ?? selected?.readerSlug;
      const official = candidate.sourceUrl ?? (selected ? officialCatalogUrl(selected) : candidate.resourceUri);
      return <article key={`${candidate.source}:${candidate.externalId ?? candidate.resourceUri}`} className="search-result">
        <p className="availability">{localSlug ? "Disponible en Legisdata" : "Encontrada, pendiente de incorporación"}</p>
        <h3>{localSlug ? <Link href={`/normas/${localSlug}`}>{name}</Link> : name}</h3>
        {candidate.title && name !== candidate.title ? <p className="formal-title">{candidate.title}</p> : null}
        <p className="result-meta">{[candidate.type, candidate.number].filter(Boolean).join(" ")}{candidate.publicationDate ? ` · Publicación: ${candidate.publicationDate}` : ""}</p>
        {candidate.organisms?.map((org) => org.name ? <p key={org.uri} className="result-meta">{org.name}</p> : null)}
        {!localSlug ? <p className="result-description">Esta norma fue encontrada. Su texto aún no está disponible en Legisdata.</p> : null}
        <div className="result-actions">
          {localSlug ? <Link href={`/normas/${localSlug}`}>Leer en Legisdata</Link> : ingestionAvailable && candidate.reference ? <Link prefetch={false} href={`/consultar?referencia=${encodeURIComponent(`${candidate.reference.kind}:${candidate.reference.value}`)}&busqueda=${encodeURIComponent(query)}${result?.eventId ? `&discovery=${result.eventId}` : ""}`}>Consultar esta norma</Link> : null}
          <a href={official} rel="noreferrer" target="_blank">Consultar fuente oficial</a>
        </div>
      </article>;
    })}
    {result?.status === "unavailable" && result.reason !== "disabled" ? <button onClick={() => setAttempt((value) => value + 1)} className="result-actions underline">Reintentar búsqueda externa</button> : null}
  </section>;
}
