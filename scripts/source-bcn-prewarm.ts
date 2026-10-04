import { config } from "dotenv";
import { closeDb } from "../src/db/client";
import { bcnConnector } from "../src/sources/bcn";
import { publicCorpus } from "../src/sources/corpus";
import { requestIngestion } from "../src/sources/ingestion-service";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
async function main() {
  if (!process.argv.includes("--execute")) { console.log(JSON.stringify({ mode: "preview", documents: publicCorpus }, null, 2)); return; }
  for (const document of publicCorpus) {
    const result = await requestIngestion(bcnConnector, { kind: "idNorma", value: document.externalId }, { kind: "system", purpose: "prewarm" });
    console.log(JSON.stringify({ externalId: document.externalId, status: result.status, slug: result.slug, retryAfterSeconds: result.retryAfterSeconds }));
    if (["blocked", "unavailable", "resolving"].includes(result.status)) { process.exitCode = 1; break; }
  }
}
main().catch(() => { console.error("Precarga interrumpida; consulte configuración, política y observaciones."); process.exitCode = 1; }).finally(closeDb);
