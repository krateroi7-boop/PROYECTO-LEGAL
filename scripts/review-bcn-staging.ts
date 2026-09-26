import { config } from "dotenv";
import { writeBcnReviewManifest } from "../src/ingestion/sources/bcn-leychile/review";

config({ path: ".env.local" });
config();

async function main() {
  const directory = process.env.BCN_STAGING_DIR
    ? `${process.env.BCN_STAGING_DIR}/ley-19880`
    : ".staging/bcn-leychile/ley-19880";
  const manifest = await writeBcnReviewManifest(directory);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
