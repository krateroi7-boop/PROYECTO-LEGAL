/** Commercial entitlement seam. Editorial roles deliberately do not participate. */
export type IngestionAccount = { id: string };
export type IngestionEntitlement = (account: IngestionAccount) => boolean | Promise<boolean>;
export async function canRequestIngestion(account: IngestionAccount | null | undefined, entitlement: IngestionEntitlement = () => true) {
  return Boolean(account?.id && await entitlement(account));
}
export function canReadPublishedNorm(publication: { publicationStatus: string; sourceAllowed: boolean }) {
  return publication.publicationStatus === "published" && publication.sourceAllowed;
}
