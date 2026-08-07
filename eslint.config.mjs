// Lints packages/* only — apps/web has its own eslint.config.mjs (eslint-config-next).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "apps/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
