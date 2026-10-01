import Link from "next/link";
import { requireUser } from "@/auth/guards";
import { listFavorites } from "@/db/repositories/users";
import { deleteFavoriteAction } from "@/app/actions/personal";

export default async function FavoritesPage() {
  const user = await requireUser();
  const favorites = process.env.DATABASE_URL ? await listFavorites(user.id!) : [];
  return <main className="min-h-screen bg-[#f6f7f9] px-6 py-12 text-[#192231]"><div className="mx-auto max-w-4xl"><Link href="/cuenta" className="text-sm font-semibold text-[#526174]">← Mi cuenta</Link><h1 className="mt-6 text-3xl font-bold text-[#173f6b]">Mis favoritos</h1>{favorites.length ? <div className="mt-6 space-y-3">{favorites.map((favorite) => <div key={favorite.id} className="flex items-center justify-between gap-4 rounded-xl border border-[#e2e6eb] bg-white p-5 text-sm text-[#526174]"><div className="min-w-0">{favorite.context ? <><p className="font-semibold text-[#173f6b]">{favorite.context.name}</p><p>{favorite.context.article ?? favorite.context.title}</p>{favorite.context.version && <p className="mt-1 text-xs">{favorite.context.version.label} · {favorite.context.version.dateLabel}</p>}<Link className="mt-3 inline-block underline" href={favorite.context.href}>{favorite.context.article ? "Abrir artículo" : "Abrir norma"}</Link></> : <p>La publicación guardada ya no está disponible. Tu favorito se conserva.</p>}</div><form action={deleteFavoriteAction}><input type="hidden" name="id" value={favorite.id} /><button type="submit" className="text-xs font-semibold text-[#a34d3c] hover:underline">Eliminar</button></form></div>)}</div> : <p className="mt-6 rounded-xl border border-dashed border-[#cbd5df] bg-white p-8 text-sm text-[#697789]">Todavía no tienes favoritos guardados.</p>}</div></main>;
}
