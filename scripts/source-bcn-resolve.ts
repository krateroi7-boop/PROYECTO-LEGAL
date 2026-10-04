import { requestIngestion } from "../src/sources/ingestion-service";
import { config } from "dotenv";
import { closeDb } from "../src/db/client";
import { bcnConnector } from "../src/sources/bcn";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const flag = process.argv.indexOf("--reference");
  const input = flag < 0 ? undefined : process.argv[flag + 1];
  const reference = input ? bcnConnector.parseReference(input) : null;
  if (!reference) throw new Error('Uso: npm run source:bcn:resolve -- --reference "Ley 19.880"');
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL y aplique las migraciones antes de resolver una referencia.");
  const result = await requestIngestion(bcnConnector, reference, { kind: "system", purpose: "capture" });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "unavailable") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No fue posible completar la consulta.");
  process.exitCode = 1;
}).finally(closeDb);
