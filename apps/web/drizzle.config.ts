import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as a standalone CLI, not through Next.js, so .env.local
// isn't loaded automatically the way it is for `next dev`/`next build`.
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in.");
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
