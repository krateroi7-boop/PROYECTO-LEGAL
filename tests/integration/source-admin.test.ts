import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { auditLogs, sourcePolicies, users } from "@/db/schema";

const state = vi.hoisted(() => ({ key: `admin-test-${Date.now()}`, actor: "", denied: false }));
vi.mock("@/sources/registry", () => ({ sourceRegistry: [{ key: state.key }] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth/guards", () => ({ requireRole: vi.fn(async (roles: string[]) => {
  if (!roles.includes("admin") || state.denied) throw new Error("Access denied");
  return { id: state.actor, role: "admin" };
}) }));
import { recordSourcePolicy } from "@/app/actions/source-policy";

describe.skipIf(!process.env.DATABASE_URL)("source usage administration", () => {
  afterAll(closeDb);
  it("requires authorization and attestation, and serializes initial policy audit history", async () => {
    const db = getDb();
    state.actor = randomUUID();
    await db.insert(users).values({ id: state.actor, role: "admin", email: `${state.actor}@example.invalid` });
    const form = (decision: string, attested = true) => {
      const value = new FormData();
      value.set("sourceKey", state.key);
      value.set("decision", decision);
      value.set("evidenceUrl", "https://example.invalid/synthetic-policy");
      value.set("reason", "Synthetic test decision with documented scope.");
      if (attested) value.set("attested", "on");
      return value;
    };
    try {
      state.denied = true;
      await expect(recordSourcePolicy(form("allow"))).rejects.toThrow("Access denied");
      state.denied = false;
      await expect(recordSourcePolicy(form("allow", false))).rejects.toThrow();
      const invalidEvidence = form("allow");
      invalidEvidence.set("evidenceUrl", "file:///secret");
      await expect(recordSourcePolicy(invalidEvidence)).rejects.toThrow();
      expect(await db.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, state.key))).toHaveLength(0);

      await Promise.all([recordSourcePolicy(form("allow")), recordSourcePolicy(form("block", false))]);
      const decisions = await db.select().from(auditLogs).where(eq(auditLogs.entityId, state.key));
      expect(decisions).toHaveLength(2);
      const metadata = decisions.map((row) => row.metadata as { previous: null | { publicationAllowed: boolean }; decision: string });
      expect(metadata.filter((row) => row.previous === null)).toHaveLength(1);
      const first = metadata.find((row) => row.previous === null)!;
      const second = metadata.find((row) => row.previous !== null)!;
      expect(second.previous!.publicationAllowed).toBe(first.decision === "allow");
      const [policy] = await db.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, state.key));
      expect(policy.publicationAllowed).toBe(second.decision === "allow");
      expect(policy.reviewedBy).toBe(state.actor);
    } finally {
      state.denied = false;
      await db.delete(auditLogs).where(eq(auditLogs.entityId, state.key));
      await db.delete(sourcePolicies).where(eq(sourcePolicies.sourceKey, state.key));
      await db.delete(users).where(eq(users.id, state.actor));
    }
  });
});
