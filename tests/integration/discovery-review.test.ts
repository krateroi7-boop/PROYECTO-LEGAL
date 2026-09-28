import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { auditLogs, editorialReviewRequests, importBatches, sourceBudgets, sourceCache, sourceDocuments, sourceLeases, sourceObservations, users } from "@/db/schema";
import { requestReview, listReviewRequests } from "@/db/repositories/review-requests";
import { createDiscoveryService } from "@/sources/discovery";
import { recordDiscoverySelection, getSourceMetrics } from "@/sources/metrics";
import { cleanSourceTemporaries } from "@/sources/cleanup";
import type { LegalDiscoveryConnector, SearchCandidate } from "@/sources/discovery-types";

const sources: string[] = [], userIds: string[] = [], batches: string[] = [];
function fixture() {
  const key = `discovery-test-${randomUUID()}`;
  sources.push(key);
  let time = Date.now();
  const now = () => new Date(time);
  const candidate: SearchCandidate = { source: key, resourceUri: "https://datos.bcn.cl/recurso/test", externalId: "210676", reference: { kind: "idNorma", value: "210676" }, title: "Metadatos sintéticos", match: { strategy: "number", fields: ["number"] }, provenance: { endpoint: "https://datos.bcn.cl/sparql", observedAt: now().toISOString(), adapterVersion: "test-v1" } };
  const discover = vi.fn<LegalDiscoveryConnector["discover"]>(async () => ({ candidates: [candidate], discarded: 0 }));
  const connector = { key, version: "test-v1", discover };
  return { key, connector, candidate, now, discover, advance: (ms: number) => { time += ms; }, service: createDiscoveryService({ connector, now, enabled: () => true, minIntervalMs: 0 }) };
}

describe.skipIf(!process.env.DATABASE_URL)("discovery, coordination and review requests in PostgreSQL", () => {
  afterEach(async () => {
    const db = getDb();
    for (const source of sources.splice(0)) {
      await db.delete(sourceObservations).where(eq(sourceObservations.sourceKey, source));
      await db.delete(sourceCache).where(eq(sourceCache.sourceKey, source));
      await db.delete(sourceLeases).where(eq(sourceLeases.sourceKey, source));
      await db.delete(sourceBudgets).where(eq(sourceBudgets.sourceKey, source));
    }
    if (batches.length) { await db.delete(auditLogs).where(inArray(auditLogs.entityId, batches)); await db.delete(importBatches).where(inArray(importBatches.id, batches.splice(0))); }
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds.splice(0)));
  });
  afterAll(closeDb);

  it("caches selective metadata without documents, editorial proposals, or plaintext queries", async () => {
    const f = fixture();
    expect(await f.service("Ley 19.880")).toMatchObject({ status: "available", cache: "fetched" });
    expect(await f.service("19880")).toMatchObject({ status: "available", cache: "hit" });
    expect(f.discover).toHaveBeenCalledOnce();
    const entries = await getDb().select().from(sourceCache).where(eq(sourceCache.sourceKey, f.key));
    expect(entries[0]).toMatchObject({ operation: "metadata", sourceDocumentId: null });
    expect(entries[0].referenceValue).toMatch(/^[a-f0-9]{64}$/);
    expect(entries[0].expiresAt.getTime() - entries[0].checkedAt.getTime()).toBe(86400000);
    expect(await getDb().select().from(sourceDocuments).where(eq(sourceDocuments.sourceKey, f.key))).toEqual([]);
    f.advance(3600001);
    expect((await f.service("Ley 19880")).cache).toBe("hit");
    await f.service("procedimiento administrativo");
    f.advance(3600001);
    expect((await f.service("procedimiento administrativo")).cache).toBe("fetched");
    const events = await getDb().select().from(sourceObservations).where(eq(sourceObservations.sourceKey, f.key));
    expect(JSON.stringify(events)).not.toContain("procedimiento administrativo");
  });

  it("uses distinct negative TTL and never caches timeout as absence", async () => {
    const f = fixture();
    f.discover.mockResolvedValueOnce({ candidates: [], discarded: 0 });
    expect((await f.service("inexistente")).status).toBe("empty");
    expect((await f.service("inexistente")).cache).toBe("negative");
    f.advance(300001);
    f.discover.mockRejectedValueOnce({ kind: "timeout" });
    expect(await f.service("inexistente")).toMatchObject({ status: "unavailable", reason: "timeout" });
    expect((await f.service("inexistente")).status).toBe("unavailable");
    expect(f.discover).toHaveBeenCalledTimes(2);
    f.advance(30001);
    expect((await f.service("inexistente")).status).toBe("available");
  });

  it("serves explicitly stale metadata during outages only within its bounded window", async () => {
    const f = fixture();
    await f.service("procedimiento administrativo");
    f.advance(3600001);
    f.discover.mockRejectedValue({ kind: "timeout" });
    expect(await f.service("procedimiento administrativo")).toMatchObject({ status: "available", cache: "stale" });
    f.advance(86400000);
    expect(await f.service("procedimiento administrativo")).toMatchObject({ status: "unavailable", candidates: [] });
  });

  it("coordinates separate Node processes with a shared expiring reservation", async () => {
    const f = fixture();
    const run = () => promisify(execFile)(process.execPath, ["--import", "tsx", "tests/helpers/lease-contender.ts", f.key], { env: process.env });
    const replies = (await Promise.all([run(), run()])).map(({ stdout }) => JSON.parse(stdout.trim()));
    expect(replies.filter((r) => r.lease)).toHaveLength(1);
    expect(replies.filter((r) => r.reason === "in_progress")).toHaveLength(1);
    expect(await f.service("Ley 19880")).toMatchObject({ status: "in_progress" });
    expect(f.discover).not.toHaveBeenCalled();
    f.advance(Date.now() - f.now().getTime() + 31000);
    expect((await f.service("Ley 19880")).status).toBe("available");
  });

  it("counts only a valid first selection per server-issued search event", async () => {
    const f = fixture();
    const result = await f.service("Ley 19880");
    await recordDiscoverySelection(result.eventId!, "999");
    await Promise.all([recordDiscoverySelection(result.eventId!, "210676"), recordDiscoverySelection(result.eventId!, "210676")]);
    const rows = await getDb().select().from(sourceObservations).where(and(eq(sourceObservations.sourceKey, f.key), eq(sourceObservations.eventKind, "discovery_selected")));
    expect(rows).toHaveLength(1);
    expect((await getSourceMetrics(f.key)).discoveryConversion).toBe(1);
  });

  it("requires an existing user, serializes the five-request quota, and derives status from the editorial batch", async () => {
    const user = randomUUID(); userIds.push(user);
    await getDb().insert(users).values({ id: user });
    const rows = await getDb().insert(importBatches).values(Array.from({ length: 6 }, () => ({ checksum: randomUUID(), status: "pending_review" as const }))).returning();
    batches.push(...rows.map((row) => row.id));
    await expect(requestReview("nonexistent-user", rows[0].id)).rejects.toThrow();
    const requests = await Promise.allSettled(rows.map((row) => requestReview(user, row.id)));
    expect(requests.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(requests.filter((r) => r.status === "rejected")).toHaveLength(1);
    const [existing] = await getDb().select().from(editorialReviewRequests).where(eq(editorialReviewRequests.userId, user));
    expect((await requestReview(user, existing.batchId)).id).toBe(existing.id);
    await getDb().update(importBatches).set({ status: "rejected" }).where(eq(importBatches.id, existing.batchId));
    expect((await listReviewRequests(user)).find((r) => r.id === existing.id)?.status).toBe("rejected");
    expect(await listReviewRequests("another-user")).toEqual([]);
    const states = await getDb().select().from(importBatches).where(inArray(importBatches.id, batches));
    expect(states.filter((row) => row.status === "pending_review")).toHaveLength(5);
  });

  it("cleans expired metrics but preserves resolution capture evidence", async () => {
    const f = fixture();
    const old = new Date(Date.now() - 31 * 86400000);
    await getDb().insert(sourceObservations).values([
      { sourceKey: f.key, cacheKey: "test", observedAt: old, outcome: "captured", eventKind: "upstream", operation: "resolve" },
      { sourceKey: f.key, cacheKey: "test", observedAt: old, outcome: "hit", eventKind: "cache", operation: "resolve" },
      { sourceKey: f.key, cacheKey: "test", observedAt: old, outcome: "empty", eventKind: "upstream", operation: "discover" },
    ]);
    await cleanSourceTemporaries();
    const remaining = await getDb().select().from(sourceObservations).where(eq(sourceObservations.sourceKey, f.key));
    expect(remaining.map((event) => event.outcome)).toEqual(["captured"]);
  });
});
