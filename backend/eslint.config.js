import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    rules: {
      // Placeholder handlers/interface implementations in this scaffolding
      // phase intentionally receive unused parameters (e.g. Express error
      // middleware's required 4-arg signature, IdentityProvider.verify's
      // credential parameter before Phase 6 implements it).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
