import "dotenv/config";
import { syncBcnNorms } from "../src/ingestion/sources/bcn-leychile/sync";

const idsFlag = process.argv.indexOf("--norm-id");
const normIds = idsFlag >= 0 && process.argv[idsFlag + 1] ? [process.argv[idsFlag + 1]] : undefined;
syncBcnNorms({ normIds })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
