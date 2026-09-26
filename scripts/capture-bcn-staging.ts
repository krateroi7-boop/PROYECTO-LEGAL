import { config } from "dotenv";
import { captureBcnNorm, DEFAULT_ENDPOINT } from "../src/ingestion/sources/bcn-leychile/capture";

config({ path: ".env.local" });
config();

async function main() {
  const result = await captureBcnNorm({
    endpoint: process.env.BCN_LEYCHILE_ENDPOINT ?? DEFAULT_ENDPOINT,
    outputDir: process.env.BCN_STAGING_DIR ?? ".staging/bcn-leychile",
    metadata: {
      normId: "210676",
      slug: "ley-19880",
      number: "19.880",
      title: "Establece bases de los procedimientos administrativos que rigen los actos de los órganos de la Administración del Estado",
      publishedAt: "2003-05-29T00:00:00.000Z",
      sourceUrl: "https://www.bcn.cl/leychile/navegar?idNorma=210676",
      capturedAt: new Date().toISOString(),
    },
  });

  console.log(JSON.stringify({
    status: "staged",
    rawPath: result.rawPath,
    snapshotPath: result.snapshotPath,
    manifestPath: result.manifestPath,
    articleCount: result.snapshot.articles.length,
    checksum: result.snapshot.source.checksum,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
