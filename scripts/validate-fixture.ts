import { readFile } from "node:fs/promises";
import { validateFixture } from "../src/domain/legislation/validate";

const path = process.argv[2] ?? "fixtures/legislation/sample.json";
readFile(path, "utf8")
  .then((raw) => {
    const fixture = validateFixture(JSON.parse(raw));
    console.log(`valid: ${fixture.laws.length} norms, schema v${fixture.schemaVersion}`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
