import { bcnConnector } from "../../src/sources/bcn";
import { createSourceResolver } from "../../src/sources/resolver";
import { closeDb } from "../../src/db/client";
import { FilesystemRawStorage } from "../../src/ingestion/storage/filesystem";
import { completeXml } from "./complete-xml";
const [key, id, root] = process.argv.slice(2);
const connector = { ...bcnConnector, key, name: "Synthetic multiprocess XML", fetch: async () => {
  await new Promise((done) => setTimeout(done, 400));
  return { kind: "modified" as const, raw: completeXml.replaceAll("987654", id), capturedAt: new Date().toISOString(), url: "https://example.test/multiprocess" };
} };
const resolve = createSourceResolver({ connector, storage: new FilesystemRawStorage(root), minIntervalMs: 0 });
Promise.all(Array.from({ length: 50 }, () => resolve({ kind: "idNorma", value: id }))).then((results) => console.log(JSON.stringify(results.map((r) => r.status)))).catch(() => { process.exitCode = 1; }).finally(closeDb);
