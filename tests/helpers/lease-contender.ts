import { getDb, closeDb } from "../../src/db/client";
import { acquireLease } from "../../src/sources/leases";
const source = process.argv[2];
getDb().transaction((tx) => acquireLease(tx, `${source}:test`, source, new Date(), 0)).then((result) => console.log(JSON.stringify(result))).finally(closeDb);
