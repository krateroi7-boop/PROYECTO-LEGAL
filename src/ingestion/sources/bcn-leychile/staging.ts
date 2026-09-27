import { createHash } from "node:crypto";
import { join } from "node:path";
import { FilesystemRawStorage } from "@/ingestion/storage";
import type { BcnStagingSnapshot } from "./types";

/** Resumable staging is separate from the durable, content-addressed evidence store. */
export async function stageBcnSnapshot(outputDir: string, raw: string, snapshot: BcnStagingSnapshot) {
  if (!/^\d+$/.test(snapshot.norm.normId) || !/^bcn-leychile-json-v\d+$/.test(snapshot.source.parser)) {
    throw new Error("Invalid BCN staging identity.");
  }
  const checksum = createHash("sha256").update(raw).digest("hex");
  if (snapshot.source.checksum !== checksum) throw new Error("BCN staging checksum does not match raw content.");
  const prefix = `${snapshot.norm.normId}/${checksum}/${snapshot.source.parser}`;
  const storage = new FilesystemRawStorage(outputDir);
  await storage.put(`${prefix}/source.json`, raw);
  const snapshotKey = `${prefix}/snapshot.json`;
  try {
    await storage.put(snapshotKey, `${JSON.stringify(snapshot, null, 2)}\n`);
  } catch (error) {
    // A later observation may have a different capture time; preserve the original observation.
    const existing = JSON.parse((await storage.get(snapshotKey)).content) as BcnStagingSnapshot;
    if (stagingIdentity(existing) !== stagingIdentity(snapshot)) throw error;
  }
  const storedSnapshot = JSON.parse((await storage.get(snapshotKey)).content) as BcnStagingSnapshot;
  await storage.put(`${prefix}/manifest.json`, `${JSON.stringify({
    source: storedSnapshot.source,
    norm: storedSnapshot.norm,
    articleCount: storedSnapshot.articles.length,
    rawBytes: Buffer.byteLength(raw, "utf8"),
  }, null, 2)}\n`);
  return {
    directory: join(outputDir, prefix),
    rawPath: join(outputDir, prefix, "source.json"),
    snapshotPath: join(outputDir, snapshotKey),
    manifestPath: join(outputDir, prefix, "manifest.json"),
    snapshot: storedSnapshot,
  };
}

function stagingIdentity(snapshot: BcnStagingSnapshot) {
  return JSON.stringify({
    ...snapshot,
    source: { ...snapshot.source, capturedAt: undefined },
    norm: { ...snapshot.norm, capturedAt: undefined },
  });
}
