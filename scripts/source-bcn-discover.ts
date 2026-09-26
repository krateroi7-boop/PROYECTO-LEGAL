import "dotenv/config";
import { discoverBcnNorms } from "../src/ingestion/sources/bcn-leychile/discovery";

discoverBcnNorms()
  .then((result) => console.log(JSON.stringify({
    supported: result.supported,
    count: result.entries.length,
    entries: result.entries,
  }, null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
