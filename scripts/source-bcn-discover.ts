import "dotenv/config";
import { discoverBcnNorms } from "../src/ingestion/sources/bcn-leychile/discovery";
import { discoverBcn } from "../src/sources/discovery";
import { closeDb } from "../src/db/client";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--remote")) {
    const index = args.indexOf("--query");
    const query = index >= 0 ? args[index + 1] : undefined;
    if (!query || args.length !== 3) throw new Error("Uso: source:bcn:discover -- --remote --query 'Ley 19.880'");
    if (process.env.BCN_DISCOVERY_ENABLED !== "true") throw new Error("Active BCN_DISCOVERY_ENABLED para el piloto remoto.");
    console.log(JSON.stringify(await discoverBcn(query), null, 2));
  } else {
    if (args.length) throw new Error("El modo de archivo no recibe argumentos.");
    const result = await discoverBcnNorms();
    console.log(JSON.stringify({ supported: result.supported, count: result.entries.length, entries: result.entries }, null, 2));
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error de descubrimiento.");
  process.exitCode = 1;
}).finally(closeDb);
