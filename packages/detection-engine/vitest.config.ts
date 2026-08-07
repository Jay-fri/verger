import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // The mock-transcript integration test embeds a model load + several
    // real DB round trips; default 5s per-test timeout is too tight.
    testTimeout: 30000,
  },
});
