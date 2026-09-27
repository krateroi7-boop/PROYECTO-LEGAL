import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { inspectBcnSnapshot } from "../src/ingestion/sources/bcn-leychile/inspect";
import type { BcnStagingSnapshot } from "../src/ingestion/sources/bcn-leychile/types";

config({ path: ".env.local" });
config();

const pathFlag = process.argv.indexOf("--path");
const directory = pathFlag >= 0 ? process.argv[pathFlag + 1] : undefined;
if (!directory) throw new Error("Uso: npm run source:bcn:inspect -- --path <directorio-de-captura>");

readFile(`${directory}/snapshot.json`, "utf8")
  .then((raw) => console.log(JSON.stringify(inspectBcnSnapshot(JSON.parse(raw) as BcnStagingSnapshot), null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
