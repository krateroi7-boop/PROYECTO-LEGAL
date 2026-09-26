import Link from "next/link";
import { requireUser } from "@/auth/guards";
import { listAnnotations } from "@/db/repositories/users";
import { deleteAnnotationAction } from "@/app/actions/personal";

export default async function NotesPage() {
  const user = await requireUser();
  const notes = process.env.DATABASE_URL ? await listAnnotations(user.id!) : [];
  return <main className="min-h-screen bg-[#f6f7f9] px-6 py-12 text-[#192231]"><div className="mx-auto max-w-4xl"><Link href="/cuenta" className="text-sm font-semibold text-[#526174]">← Mi cuenta</Link><h1 className="mt-6 text-3xl font-bold text-[#173f6b]">Notas privadas</h1>{notes.length ? <div className="mt-6 space-y-3">{notes.map((note) => <article key={note.id} className="rounded-xl border border-[#e2e6eb] bg-white p-5"><p className="text-sm leading-7 text-[#526174]">{note.content}</p><div className="mt-3 flex items-center justify-between gap-4"><p className="text-xs text-[#8792a2]">Nota privada · {note.nodeId ?? note.normId}</p><form action={deleteAnnotationAction}><input type="hidden" name="id" value={note.id} /><button type="submit" className="text-xs font-semibold text-[#a34d3c] hover:underline">Eliminar</button></form></div></article>)}</div> : <p className="mt-6 rounded-xl border border-dashed border-[#cbd5df] bg-white p-8 text-sm text-[#697789]">Todavía no tienes notas privadas.</p>}</div></main>;
}
