import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sourcePolicies } from "@/db/schema";
import { canRequestIngestion, type IngestionAccount, type IngestionEntitlement } from "@/auth/ingestion-access";
import { sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";
import { createSourceResolver, readSourceResolution, type Resolution } from "./resolver";
import { consumeIngestionQuota } from "./ingestion-quota";
import type { LegalSourceConnector, SourceReference } from "./types";
import type { RawStorage } from "@/ingestion/storage/types";

export class IngestionAccessError extends Error {
  constructor(public status: 401 | 403) { super(status === 401 ? "AUTHENTICATION_REQUIRED" : "INGESTION_FORBIDDEN"); }
}
class SourceBlockedError extends Error {}
export type IngestionActor = { kind: "account"; account: IngestionAccount | null } | { kind: "system"; purpose: "capture" | "prewarm" | "revalidate" };

/** Server/internal entry point. Never accept an actor or entitlement from HTTP input. */
export async function requestIngestion(connector: LegalSourceConnector, reference: SourceReference, actor: IngestionActor,
  options: { entitlement?: IngestionEntitlement; storage?: RawStorage } = {}): Promise<Resolution> {
  if (actor.kind === "account" && !await canRequestIngestion(actor.account, options.entitlement))
    throw new IngestionAccessError(actor.account?.id ? 403 : 401);
  const source = { sourceKey: connector.key, sourceName: connector.name, parser: connector.parserVersion };
  const blocked: Resolution = { status: "blocked", cache: "none", source: connector.key, reference, checkedAt: null, reason: "source_policy" };
  // Explicit administrative capture may retain private evidence while distribution remains blocked.
  const privateCapture = actor.kind === "system" && actor.purpose === "capture";
  const [policy] = await getDb().select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, connector.key));
  if (!privateCapture && !sourcePublicationAllowed(source, policy)) return blocked;
  try {
    return await createSourceResolver({ connector, storage: options.storage,
      beforeAcquire: async (tx) => {
        const [current] = await tx.select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, connector.key)).for("share");
        if (!privateCapture && !sourcePublicationAllowed(source, current)) throw new SourceBlockedError();
      },
      onAcquired: actor.kind === "account" ? (tx, at) => consumeIngestionQuota(tx, actor.account!.id, at) : undefined,
    })(reference);
  } catch (error) { if (error instanceof SourceBlockedError) return blocked; throw error; }
}

/** Only persisted state; no metrics writes, acquisition, or recovery on GET. */
export async function readIngestionState(connector: LegalSourceConnector, reference: SourceReference): Promise<Resolution> {
  const stored = await readSourceResolution(connector, reference);
  if (stored) return stored.resolution;
  const [policy] = await getDb().select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, connector.key));
  const allowed = sourcePublicationAllowed({ sourceKey: connector.key, sourceName: connector.name, parser: connector.parserVersion }, policy);
  return { status: allowed ? "not_requested" : "blocked", source: connector.key, reference, cache: "none", checkedAt: null };
}
