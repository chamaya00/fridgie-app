import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", ".wrangler/", "node_modules/", "docs/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain Node scripts: name the globals they use rather than add a package for them.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly", URLSearchParams: "readonly", crypto: "readonly", Request: "readonly", Response: "readonly", Headers: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
    },
  },
);
