import Link from "next/link";
import { toggleFavorite, createAnnotation } from "@/app/actions/personal";

export function LegalActions({
  slug,
  stableKey,
  versionId,
  isAuthenticated,
}: {
  slug: string;
  stableKey?: string;
  versionId?: string;
  isAuthenticated: boolean;
}) {
  if (!isAuthenticated) {
    return (
      <Link
        href={`/api/auth/signin?callbackUrl=/normas/${slug}`}
        className="text-xs font-semibold text-[#173f6b] underline underline-offset-2"
      >
        Inicia sesión para guardar y anotar
      </Link>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-[#e2e6eb] bg-[#f8fafb] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={toggleFavorite}>
          <input type="hidden" name="slug" value={slug} />
          {versionId ? <input type="hidden" name="versionId" value={versionId} /> : null}
          {stableKey ? <input type="hidden" name="stableKey" value={stableKey} /> : null}
          <button type="submit" className="rounded-md border border-[#cbd5df] bg-white px-3 py-2 text-xs font-semibold text-[#173f6b] hover:bg-[#eef4f8]">
            Guardar favorito
          </button>
        </form>
        {stableKey ? (
          <form action={createAnnotation} className="flex min-w-0 flex-1 gap-2">
            <input type="hidden" name="slug" value={slug} />
            {versionId ? <input type="hidden" name="versionId" value={versionId} /> : null}
            <input type="hidden" name="stableKey" value={stableKey} />
            <input name="content" required maxLength={10000} placeholder="Añadir una nota privada..." className="min-w-0 flex-1 rounded-md border border-[#cbd5df] bg-white px-3 py-2 text-xs text-[#2e3d4f] outline-none focus:border-[#173f6b]" />
            <button type="submit" className="rounded-md bg-[#173f6b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0f3155]">Guardar nota</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
