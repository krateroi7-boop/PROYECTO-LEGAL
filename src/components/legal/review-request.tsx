"use client";
import Link from "next/link";
import { useActionState } from "react";
import { submitReviewRequest } from "@/app/actions/review-request";

export function ReviewRequest({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState(submitReviewRequest, { message: "", success: false });
  return <div className="mt-5 border-t pt-4">
    <p className="text-sm">Puede solicitar revisión con su cuenta. La solicitud no garantiza una fecha de publicación.</p>
    <form action={action} className="mt-3"><input type="hidden" name="batchId" value={batchId} /><button disabled={pending || state.success} className="rounded bg-[#173f6b] px-4 py-2 text-white disabled:opacity-60">{pending ? "Registrando…" : state.success ? "Revisión solicitada" : "Solicitar revisión"}</button></form>
    {state.message ? <p role="status" className="mt-2 text-sm">{state.message}</p> : null}
    <Link href="/cuenta/revisiones" className="mt-3 inline-block text-sm underline">Mis solicitudes de revisión</Link>
  </div>;
}
