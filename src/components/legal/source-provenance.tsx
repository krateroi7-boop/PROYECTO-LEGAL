import type { Law } from "@/lib/legislation";

export function SourceProvenance({ law }: { law: Law }) {
  const source = law.provenance;
  return (
    <section id="fuente" className="rounded-2xl border border-[#e2e6eb] bg-white p-5 text-sm text-[#697789]">
      <h2 className="mb-2 font-semibold text-[#173f6b]">Procedencia</h2>
      {source ? <>
        <p>{source.sourceName}</p>
        {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block font-semibold text-[#173f6b] underline">Consultar fuente</a> : null}
        <p className="mt-3">Capturado el {new Date(source.capturedAt).toLocaleDateString("es-CL", { timeZone: "UTC" })}.</p>
        <p className="mt-2 text-xs leading-5">La fecha de captura indica cuándo se obtuvo esta copia; no acredita una comprobación posterior de vigencia.</p>
        <details className="mt-3 text-xs"><summary className="cursor-pointer">Identificación de la copia</summary><p className="mt-2 break-all">SHA-256: {source.checksum}</p>{law.versionId ? <p className="mt-2 break-all">Versión: {law.versionId}</p> : null}</details>
      </> : <p>{process.env.DATABASE_URL ? "Esta versión no tiene una fuente documental vinculada." : "Contenido de demostración. No constituye una reproducción verificada de la fuente jurídica."}</p>}
    </section>
  );
}
