import { config } from "dotenv";
import { writeBcnReviewManifest } from "../src/ingestion/sources/bcn-leychile/review";

config({ path: ".env.local" });
config();

async function main() {
  const pathFlag = process.argv.indexOf("--path");
  const directory = pathFlag >= 0 ? process.argv[pathFlag + 1] : undefined;
  if (!directory) throw new Error("Uso: npm run corpus:bcn:review -- --path <directorio-de-captura>");
  const manifest = await writeBcnReviewManifest(directory);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
