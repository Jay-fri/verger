import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as a standalone CLI, so .env.local isn't loaded automatically.
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // This package owns only the `verses` table — schema.ts declares no
  // references outside the public schema, but keep this explicit and
  // consistent with apps/web's drizzle.config.ts.
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
