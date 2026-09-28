"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth/guards";
import { requestReview } from "@/db/repositories/review-requests";

export async function submitReviewRequest(_previous: { message: string; success: boolean }, form: FormData) {
  const actor = await requireUser("/cuenta/revisiones");
  const parsed = z.string().uuid().safeParse(form.get("batchId"));
  if (!parsed.success) return { success: false, message: "La propuesta no es válida." };
  try {
    await requestReview(actor.id, parsed.data);
    revalidatePath("/cuenta/revisiones");
    revalidatePath("/admin/importaciones");
    return { success: true, message: "Solicitud registrada. Puede consultar su estado en Mis solicitudes de revisión." };
  } catch (error) {
    return { success: false, message: error instanceof Error && error.message === "REVIEW_QUOTA" ? "Puede registrar hasta cinco solicitudes nuevas cada 24 horas." : "Esta propuesta no admite una nueva solicitud en este momento." };
  }
}
