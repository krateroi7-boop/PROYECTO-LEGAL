import { describe, expect, it } from "vitest";
import { and, count, countDistinct, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { normVersions, searchDocuments } from "@/db/schema";

const databaseAvailable = Boolean(process.env.DATABASE_URL);

describe.skipIf(!databaseAvailable)("PostgreSQL persistence", () => {
  it("contains imported norms with one current version and indexed documents", async () => {
    const db = getDb();
    const [normCount] = await db.select({ value: countDistinct(normVersions.normId) }).from(normVersions).where(eq(normVersions.publicationStatus, "published"));
    const [currentCount] = await db.select({ value: count() }).from(normVersions).where(and(eq(normVersions.isCurrent, true), eq(normVersions.publicationStatus, "published")));
    const [searchCount] = await db.select({ value: count() }).from(searchDocuments);

    expect(Number(normCount.value)).toBeGreaterThan(0);
    expect(Number(currentCount.value)).toBe(Number(normCount.value));
    expect(Number(searchCount.value)).toBeGreaterThanOrEqual(Number(normCount.value));
  });
});
