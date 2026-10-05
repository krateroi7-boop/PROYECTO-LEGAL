import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sourcePolicies, norms, normVersions, documentIdentifiers } from "@/db/schema";
import { publicVersionCondition } from "@/db/public-visibility";
import { publicCorpus } from "@/sources/corpus";
import { bcnConnector } from "@/sources/bcn";
import { sourcePublicationAllowed } from "@/ingestion/editorial/source-policy";
import { attachCatalogPublications, type CatalogEntry } from "./catalog-presentation";

/** Editorial selection is not distribution permission. Only verified public identities get reader links. */
export async function getPublicCatalog(): Promise<CatalogEntry[]> {
  if (!process.env.DATABASE_URL) return attachCatalogPublications(publicCorpus, []);
  try {
    const identities = publicCorpus.map((entry) => and(eq(documentIdentifiers.sourceKey, entry.source), eq(documentIdentifiers.externalId, entry.externalId)));
    const publications = await getDb().select({ source: documentIdentifiers.sourceKey, externalId: documentIdentifiers.externalId, slug: norms.slug })
      .from(documentIdentifiers).innerJoin(norms, eq(norms.id, documentIdentifiers.normId))
      .innerJoin(normVersions, eq(normVersions.normId, norms.id))
      .where(and(eq(normVersions.isCurrent, true), publicVersionCondition(), or(...identities)));
    return attachCatalogPublications(publicCorpus, publications);
  } catch { return attachCatalogPublications(publicCorpus, []); }
}
export async function canOfferBcnIngestion() {
  if (!process.env.DATABASE_URL) return false;
  try {
    const [policy] = await getDb().select().from(sourcePolicies).where(eq(sourcePolicies.sourceKey, bcnConnector.key));
    return sourcePublicationAllowed({ sourceKey: bcnConnector.key, sourceName: bcnConnector.name, parser: bcnConnector.parserVersion }, policy);
  } catch { return false; }
}
