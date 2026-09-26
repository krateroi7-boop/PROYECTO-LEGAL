import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

let client: postgres.Sql | undefined;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for database access.");
  }
  client ??= postgres(url, { max: 5, prepare: false });
  return drizzle(client, { schema });
}

export async function closeDb() {
  if (!client) return;
  await client.end();
  client = undefined;
}
