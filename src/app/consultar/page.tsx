import Link from "next/link";
import { bcnConnector, resolveBcnDocument } from "@/sources/bcn";
import type { Resolution } from "@/sources/resolver";

export default async function ConsultPage({ searchParams }: { searchParams: Promise<{ referencia?: string }> }) {
  const { referencia = "" } = await searchParams;
  const reference = referencia.length <= 500 ? bcnConnector.parseReference(referencia) : null;
  let result: Resolution | undefined;
  let error = "";
  if (referencia) {
    if (!reference) error = "Indique una ley, un ID BCN o una URL LeyChile reconocida. Por ejemplo: Ley 19.880.";
    else if (!process.env.DATABASE_URL) error = "La consulta de fuentes externas no está disponible en esta instancia.";
    else {
      try { result = await resolveBcnDocument(reference); }
      catch { error = "No fue posible completar la consulta. Inténtelo nuevamente más tarde."; }
    }
  }
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-6 py-10 text-[#192231]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-bold text-[#173f6b]">Legisdata</Link>
        <h1 className="mt-10 text-3xl font-bold text-[#173f6b]">Consultar una norma en BCN</h1>
        <p className="mt-4 leading-7 text-[#526174]">Busque una ley por su número, un identificador BCN o un enlace de LeyChile. Los textos recuperados pasan por revisión antes de incorporarse a la lectura pública.</p>
        <form className="mt-6 flex flex-wrap gap-3">
          <label className="w-full text-sm font-semibold" htmlFor="referencia">Ley, ID BCN o enlace</label>
          <input id="referencia" name="referencia" defaultValue={referencia} maxLength={500} required placeholder="Ley 19.880" className="min-w-0 flex-1 rounded-lg border border-[#cbd5df] bg-white px-4 py-3" />
          <button className="rounded-lg bg-[#173f6b] px-5 py-3 font-bold text-white">Consultar</button>
        </form>
        {error ? <p role="alert" className="mt-6 rounded-xl bg-white p-6 text-[#a94c4c]">{error}</p> : null}
        {result ? <section aria-live="polite" className="mt-6 rounded-xl border border-[#e2e6eb] bg-white p-6">
          <h2 className="text-xl font-bold text-[#173f6b]">{{ published: "Norma disponible", pending_review: "Norma recuperada, pendiente de revisión", not_found: "La fuente no encontró la norma", unavailable: "La fuente no está disponible temporalmente" }[result.status]}</h2>
          {result.status === "pending_review" ? <p className="mt-3 leading-7">La captura está conservada para revisión. Puede consultar el documento directamente en LeyChile mientras se completa ese proceso.</p> : null}
          {result.cache === "stale" ? <p className="mt-3 leading-7">{result.status === "published" ? "Mostramos la última versión publicada. Hay una actualización pendiente de revisión o no fue posible comprobar la fuente ahora." : "No fue posible actualizar la comprobación de la fuente en este momento."}</p> : null}
          {result.checkedAt ? <p className="mt-3 text-sm text-[#697789]">Última comprobación de la fuente: {new Date(result.checkedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}.</p> : null}
          {result.slug && result.versionId ? <Link href={`/normas/${result.slug}/versiones/${result.versionId}`} className="mt-5 inline-block font-bold text-[#173f6b] underline">Leer en Legisdata</Link> : null}
          {result.sourceUrl ? <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="ml-4 mt-5 inline-block font-semibold text-[#173f6b] underline">Consultar fuente BCN</a> : null}
          {result.retryAfterSeconds && result.status === "unavailable" ? <p className="mt-3 text-sm text-[#697789]">Puede volver a intentarlo en {result.retryAfterSeconds} segundos.</p> : null}
        </section> : null}
        <p className="mt-8 text-sm text-[#697789]">Para buscar por palabras en los documentos ya disponibles, use el <Link href="/buscar" className="underline">buscador de Legisdata</Link>.</p>
      </div>
    </main>
  );
}
