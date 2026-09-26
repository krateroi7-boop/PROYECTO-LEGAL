"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/auth/guards";
import { getDb } from "@/db/client";
import { auditLogs, legalRelations } from "@/db/schema";
import { approveImportBatch, publishImportBatch, rejectImportBatch } from "@/ingestion/editorial/workflow";

const reviewSchema = z.object({
  relationId: z.string().uuid(),
  status: z.enum(["verified", "rejected"]),
  reviewNote: z.string().trim().max(2_000).optional(),
});

export async function reviewRelation(formData: FormData) {
  const actor = await requireRole(["reviewer", "admin"]);
  const input = reviewSchema.parse({
    relationId: formData.get("relationId"),
    status: formData.get("status"),
    reviewNote: formData.get("reviewNote") || undefined,
  });
  const db = getDb();

  await db.transaction(async (tx) => {
    const [relation] = await tx.select({ id: legalRelations.id, status: legalRelations.status })
      .from(legalRelations)
      .where(eq(legalRelations.id, input.relationId))
      .limit(1);
    if (!relation) throw new Error("La relación indicada no existe.");
    if (relation.status !== "pending") throw new Error("La relación ya fue revisada.");

    await tx.update(legalRelations).set({
      status: input.status,
      reviewNote: input.reviewNote || null,
      reviewedAt: new Date(),
    }).where(and(eq(legalRelations.id, input.relationId), eq(legalRelations.status, "pending")));

    await tx.insert(auditLogs).values({
      actorId: actor.id,
      action: input.status === "verified" ? "relation.verify" : "relation.reject",
      entityType: "legal_relation",
      entityId: input.relationId,
      result: "success",
      metadata: { reviewNote: input.reviewNote || null },
    });
  });

  revalidatePath("/admin/importaciones");
  revalidatePath("/");
}

const batchSchema = z.object({
  batchId: z.string().uuid(),
  reason: z.string().trim().max(2_000).optional(),
});

export async function approveEditorialBatch(formData: FormData) {
  const actor = await requireRole(["reviewer", "admin"]);
  const input = batchSchema.parse({
    batchId: formData.get("batchId"),
    reason: formData.get("reason") || undefined,
  });
  await approveImportBatch(input.batchId, actor.id, input.reason);
  revalidatePath("/admin/importaciones");
  revalidatePath("/");
}

export async function rejectEditorialBatch(formData: FormData) {
  const actor = await requireRole(["reviewer", "admin"]);
  const input = batchSchema.extend({ reason: z.string().trim().min(1).max(2_000) }).parse({
    batchId: formData.get("batchId"),
    reason: formData.get("reason"),
  });
  await rejectImportBatch(input.batchId, actor.id, input.reason);
  revalidatePath("/admin/importaciones");
}

export async function publishEditorialBatch(formData: FormData) {
  const actor = await requireRole(["admin"]);
  const input = batchSchema.parse({
    batchId: formData.get("batchId"),
    reason: formData.get("reason") || undefined,
  });
  await publishImportBatch(input.batchId, actor.id, input.reason);
  revalidatePath("/admin/importaciones");
  revalidatePath("/");
}
