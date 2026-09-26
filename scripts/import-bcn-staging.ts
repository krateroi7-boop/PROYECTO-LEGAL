import "dotenv/config";
import { importBcnStaging } from "../src/ingestion/sources/bcn-leychile/import";
import { closeDb } from "../src/db/client";

const pathFlag = process.argv.indexOf("--path");
const directory = pathFlag >= 0 ? process.argv[pathFlag + 1] : ".staging/bcn-leychile/ley-19880";

if (!directory) throw new Error("Usage: npm run source:bcn:import -- --path <directory>");

importBcnStaging(directory)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
