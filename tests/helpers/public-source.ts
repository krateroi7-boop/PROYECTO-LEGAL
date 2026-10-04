import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { sourceDocuments } from "@/db/schema";
/** Explicit test-only provenance; never a null source or a production permission bypass. */
export async function createFixtureSource() {
  const [source] = await getDb().insert(sourceDocuments).values({ sourceName: "Synthetic test fixture", parser: "local-fixture-v1", checksum: randomUUID(), capturedAt: new Date() }).returning();
  return source;
}
