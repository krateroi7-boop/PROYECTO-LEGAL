import { describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { normVersions, norms, searchDocuments } from "@/db/schema";

const databaseAvailable = Boolean(process.env.DATABASE_URL);

describe.skipIf(!databaseAvailable)("PostgreSQL persistence", () => {
  it("contains imported norms with one current version and indexed documents", async () => {
    const db = getDb();
    const [normCount] = await db.select({ value: count() }).from(norms);
    const [currentCount] = await db.select({ value: count() }).from(normVersions).where(eq(normVersions.isCurrent, true));
    const [searchCount] = await db.select({ value: count() }).from(searchDocuments);

    expect(Number(normCount.value)).toBeGreaterThan(0);
    expect(Number(currentCount.value)).toBe(Number(normCount.value));
    expect(Number(searchCount.value)).toBeGreaterThanOrEqual(Number(normCount.value));
  });
});
