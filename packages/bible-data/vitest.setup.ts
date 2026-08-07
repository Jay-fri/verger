import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Resolved relative to this file, not process.cwd() — so DATABASE_URL loads
// correctly whether tests are run via `pnpm --filter @verger/bible-data
// test` (cwd = this package) or `pnpm test` from the repo root (cwd = repo
// root, via the Vitest workspace in vitest.workspace.ts).
config({ path: fileURLToPath(new URL(".env.local", import.meta.url)) });
