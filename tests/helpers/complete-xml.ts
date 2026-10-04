import { readFileSync } from "node:fs";
import { bcnConnector } from "@/sources/bcn";
export const completeXml = readFileSync("tests/fixtures/bcn-xml-synthetic.xml", "utf8").replace(/<ArchivoBinario\b[^>]*>[\s\S]*?<\/ArchivoBinario>/g, "");
export function syntheticDocument(raw = completeXml) {
  return bcnConnector.normalize(raw, { url: "https://example.test/synthetic", capturedAt: new Date().toISOString(), checksum: "" });
}
