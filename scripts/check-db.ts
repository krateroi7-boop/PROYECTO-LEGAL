import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exitCode = 1;
} else {
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  sql`select 1`
    .then(() => console.log("database: connected"))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
