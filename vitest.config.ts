import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Lets `pnpm test` from the repo root run each package's own
    // vitest.config.ts (env setup, etc.) with the correct per-package cwd,
    // instead of one flat config applied to every test file regardless of
    // which package it's in.
    projects: ["apps/*", "packages/*"],
  },
});
