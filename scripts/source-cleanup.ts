import "dotenv/config";
import { closeDb } from "../src/db/client";
import { cleanSourceTemporaries } from "../src/sources/cleanup";

cleanSourceTemporaries().then((result) => console.log(JSON.stringify(result))).catch(() => { console.error("No fue posible limpiar los datos temporales de fuentes."); process.exitCode = 1; }).finally(closeDb);
