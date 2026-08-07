import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Resolved relative to this file, not process.cwd() — see
// packages/bible-data/vitest.setup.ts for why.
config({ path: fileURLToPath(new URL(".env.local", import.meta.url)) });
