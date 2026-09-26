import { readFile } from "node:fs/promises";
import { z } from "zod";

const discoveryEntrySchema = z.object({
  normId: z.string().regex(/^\d+$/),
  slug: z.string().min(1),
  number: z.string().min(1),
  title: z.string().min(1),
  publishedAt: z.string().datetime().optional(),
  lastKnownChecksum: z.string().length(64).optional(),
});

export type BcnDiscoveryEntry = z.infer<typeof discoveryEntrySchema>;

export async function discoverBcnNorms(path = process.env.BCN_DISCOVERY_FILE) {
  if (!path) return { supported: false as const, entries: [] as BcnDiscoveryEntry[] };
  const raw = await readFile(path, "utf8");
  const value = JSON.parse(raw);
  return { supported: true as const, entries: z.array(discoveryEntrySchema).parse(value) };
}
