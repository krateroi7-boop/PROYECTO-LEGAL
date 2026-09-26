import { config } from "dotenv";
import { importFixture } from "../src/ingestion/fixtures/import";
import { closeDb } from "../src/db/client";

config({ path: ".env.local" });
config();

const path = process.argv[2] ?? "fixtures/legislation/sample.json";

importFixture(path)
  .then((result) => console.log(`${result.status}: ${result.checksum}`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
