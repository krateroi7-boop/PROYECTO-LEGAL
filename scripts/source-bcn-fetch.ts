import { config } from "dotenv";
import { fetchBcnNorm } from "../src/ingestion/sources/bcn-leychile/client";
import { FilesystemRawStorage } from "../src/ingestion/storage";
import { bcnConfig } from "../src/ingestion/sources/bcn-leychile/config";

config({ path: ".env.local" });
config();

const idFlag = process.argv.indexOf("--norm-id");
const normId = idFlag >= 0 ? process.argv[idFlag + 1] : undefined;
if (!normId) {
  console.error("Usage: npm run source:bcn:fetch -- --norm-id <id>");
  process.exitCode = 1;
} else {
  fetchBcnNorm(normId)
    .then(async (capture) => {
      const storage = new FilesystemRawStorage(process.env.LEGISDATA_STORAGE_ROOT ?? ".staging");
      const object = await storage.put(`bcn-leychile/norms/${normId}/captures/${capture.checksum}/raw.json`, capture.raw);
      console.log(JSON.stringify({
        source: capture.source,
        sourceIdentifier: capture.sourceIdentifier,
        url: capture.url,
        capturedAt: capture.capturedAt,
        checksum: capture.checksum,
        storageKey: object.key,
        timeoutMs: bcnConfig.timeoutMs,
      }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
