"use server";

import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth/guards";
import { getDb } from "@/db/client";
import { auditLogs, sourcePolicies } from "@/db/schema";
import { COMMERCIAL_FULLTEXT_SCOPE } from "@/ingestion/editorial/source-policy";
import { sourceRegistry } from "@/sources/registry";

export async function recordSourcePolicy(form: FormData) {
  const actor = await requireRole(["admin"]);
  const input = z.object({
    sourceKey: z.string().refine((key) => sourceRegistry.some((source) => source.key === key)),
    publicationMode: z.enum(["manual_review", "auto_publish_validated"]).default("manual_review"),
    usageScope: z.enum(["", COMMERCIAL_FULLTEXT_SCOPE]).default(""),
    decision: z.enum(["allow", "block"]),
    evidenceUrl: z.string().url().refine((value) => { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }),
    reason: z.string().trim().min(10).max(2_000),
    attested: z.boolean(),
  }).refine((value) => value.publicationMode !== "auto_publish_validated" || value.usageScope === COMMERCIAL_FULLTEXT_SCOPE, "La automatización exige alcance comercial de texto completo.").refine((value) => value.decision !== "allow" || value.attested, "Debe confirmar la revisión de las condiciones de uso.").parse({
    publicationMode: form.get("publicationMode") ?? undefined, usageScope: form.get("usageScope") ?? undefined,
    sourceKey: form.get("sourceKey"), decision: form.get("decision"), evidenceUrl: form.get("evidenceUrl"), reason: form.get("reason"), attested: form.get("attested") === "on",
  });
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`source-policy:${input.sourceKey}`}, 0))`);
    const [previous] = await tx.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, input.sourceKey)).for("update");
    const values = { publicationMode: input.publicationMode, usageScope: input.usageScope || null, publicationAllowed: input.decision === "allow", evidenceUrl: input.evidenceUrl, reviewedAt: new Date(), reviewedBy: actor.id };
    await tx.insert(sourcePolicies).values({ sourceKey: input.sourceKey, ...values }).onConflictDoUpdate({ target: sourcePolicies.sourceKey, set: values });
    await tx.insert(auditLogs).values({ actorId: actor.id, action: "source.policy", entityType: "source_policy", entityId: input.sourceKey, result: "success", metadata: { previous: previous ?? null, decision: input.decision, publicationMode: input.publicationMode, usageScope: input.usageScope, evidenceUrl: input.evidenceUrl, reason: input.reason } });
  });
  revalidatePath("/", "layout");
}
