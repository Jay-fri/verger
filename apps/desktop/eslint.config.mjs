// Mirrors apps/web's pattern (its own config, since the root config
// ignores apps/** — see eslint.config.mjs at the repo root).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
