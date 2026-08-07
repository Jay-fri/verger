import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: Db | null = null;

// Lazy on purpose: standalone scripts (src/ingest/*) load .env.local via
// dotenv at runtime, after this module is imported (ESM static imports are
// hoisted ahead of any top-level code in the importing script, so reading
// process.env.DATABASE_URL at *import* time would run before dotenv has had
// a chance to populate it). Deferring the read to first call sidesteps that.
export function getDb(): Db {
  if (dbInstance) return dbInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — copy packages/bible-data/.env.example to .env.local and fill it in.",
    );
  }

  const client = postgres(connectionString, { prepare: false });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}
