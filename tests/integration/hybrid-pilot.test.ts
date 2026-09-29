import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { documentIdentifiers, norms, normVersions } from "@/db/schema";
import { findLocalExact } from "@/search/hybrid";

describe.skipIf(!process.env.DATABASE_URL)("pilot: local publication and verified external identity", () => {
  afterAll(closeDb);
  it("does not revalidate an unrelated local publication by law number, but uses a proven identity when available", async () => {
    const db = getDb();
    const number = String(randomInt(100000000000, 900000000000));
    const externalId = String(randomInt(100000000000, 900000000000));
    const [norm] = await db.insert(norms).values({ slug: `pilot-test-${randomUUID()}`, type: "Ley", number, title: "Publicación sintética", shortTitle: "Prueba", description: "Prueba", status: "desconocida", topics: [], publishedAt: new Date(), updatedAt: new Date() }).returning();
    try {
      await db.insert(normVersions).values({ normId: norm.id, versionLabel: "synthetic", isCurrent: true, publicationStatus: "published" });
      const local = await findLocalExact({ kind: "idLey", value: number });
      expect(local?.resolution).toMatchObject({ status: "published", slug: norm.slug, checkedAt: null });
      expect(local?.revalidationReference).toBeUndefined();
      await db.insert(documentIdentifiers).values({ sourceKey: "bcn-leychile", externalId, normId: norm.id });
      const identified = await findLocalExact({ kind: "idLey", value: number });
      expect(identified?.revalidationReference).toEqual({ kind: "idNorma", value: externalId });
      expect((await findLocalExact({ kind: "idNorma", value: externalId }))?.resolution.slug).toBe(norm.slug);
    } finally {
      await db.delete(documentIdentifiers).where(eq(documentIdentifiers.normId, norm.id));
      await db.delete(norms).where(eq(norms.id, norm.id));
    }
  });
});
