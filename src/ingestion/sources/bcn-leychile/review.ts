import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BcnStagingSnapshot } from "./types";

export type BcnReviewManifest = {
  status: "pending_legal_review" | "approved_for_publication";
  legalBasis: "unverified";
  editorialReview: "pending" | "approved";
  source: BcnStagingSnapshot["source"];
  articleCount: number;
  sourceChecksumVerified: boolean;
  reviewedAt: string;
  notes: string[];
};

export async function validateBcnStagingDirectory(directory: string): Promise<BcnReviewManifest> {
  const raw = await readFile(join(directory, "source.json"), "utf8");
  const snapshot = JSON.parse(await readFile(join(directory, "snapshot.json"), "utf8")) as BcnStagingSnapshot;
  const expectedChecksum = createHash("sha256").update(raw).digest("hex");
  const sourceChecksumVerified = expectedChecksum === snapshot.source.checksum;
  if (!sourceChecksumVerified) throw new Error("BCN staging checksum does not match source.json.");
  if (snapshot.articles.length === 0) throw new Error("BCN staging snapshot has no articles.");
  const identifiers = snapshot.articles.map((article) => article.id);
  if (identifiers.some((id) => !id?.trim()) || new Set(identifiers).size !== identifiers.length) {
    throw new Error("BCN staging article identifiers must be present and unique.");
  }

  return {
    status: "pending_legal_review",
    legalBasis: "unverified",
    editorialReview: "pending",
    source: snapshot.source,
    articleCount: snapshot.articles.length,
    sourceChecksumVerified,
    reviewedAt: new Date().toISOString(),
    notes: [
      "No se ha verificado una autorización explícita de redistribución del texto.",
      "El snapshot no debe publicarse ni importarse al corpus público.",
    ],
  };
}

export async function writeBcnReviewManifest(directory: string) {
  const manifest = await validateBcnStagingDirectory(directory);
  await writeFile(join(directory, "review.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}
