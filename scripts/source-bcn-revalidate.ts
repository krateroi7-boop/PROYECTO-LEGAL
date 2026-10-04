import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { documentIdentifiers, normVersions, sourceCache, sourceLeases } from "../src/db/schema";
import { publicVersionCondition } from "../src/db/public-visibility";
import { bcnConnector } from "../src/sources/bcn";
import { requestIngestion } from "../src/sources/ingestion-service";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
async function main() {
  const db = getDb(), owner = randomUUID(), key = "maintenance:bcn-leychile", now = new Date();
  const rows = await db.selectDistinct({ externalId: documentIdentifiers.externalId }).from(documentIdentifiers)
    .innerJoin(normVersions, eq(normVersions.normId, documentIdentifiers.normId))
    .where(and(eq(documentIdentifiers.sourceKey, bcnConnector.key), eq(normVersions.isCurrent, true), publicVersionCondition(), sql`not exists (select 1 from ${sourceCache} where ${sourceCache.sourceKey} = ${bcnConnector.key} and ${sourceCache.operation} = 'resolve' and ${sourceCache.referenceKind} = 'idNorma' and ${sourceCache.referenceValue} = ${documentIdentifiers.externalId} and ${sourceCache.expiresAt} > now())`)).orderBy(documentIdentifiers.externalId).limit(20);
  if (!process.argv.includes("--execute")) { console.log(JSON.stringify({ mode: "preview", expiredPublished: rows }, null, 2)); return; }
  const lease = await db.insert(sourceLeases).values({ key, sourceKey: bcnConnector.key, owner, expiresAt: new Date(now.getTime() + 300_000) }).onConflictDoUpdate({ target: sourceLeases.key, set: { owner, expiresAt: new Date(now.getTime() + 300_000) }, setWhere: sql`${sourceLeases.expiresAt} <= now()` }).returning();
  if (!lease.length) { console.log("maintenance_in_progress"); return; }
  try {
    for (const row of rows) {
      if (Date.now() - now.getTime() > 240_000) break;
      const result = await requestIngestion(bcnConnector, { kind: "idNorma", value: row.externalId }, { kind: "system", purpose: "revalidate" });
      console.log(JSON.stringify({ externalId: row.externalId, status: result.status, cache: result.cache, retryAfterSeconds: result.retryAfterSeconds }));
      if (result.retryAfterSeconds || ["blocked", "unavailable", "resolving"].includes(result.status)) break;
    }
  } finally { await db.delete(sourceLeases).where(and(eq(sourceLeases.key, key), eq(sourceLeases.owner, owner))); }
}
main().catch(() => { console.error("Mantenimiento interrumpido; se conservan las publicaciones anteriores."); process.exitCode = 1; }).finally(closeDb);
