import js from "@eslint/js";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import prettier from "eslint-config-prettier/flat";
import { defineConfig } from "eslint/config";
import { cwd } from "node:process";

const ensureArray = (cfg) => (Array.isArray(cfg) ? cfg : cfg ? [cfg] : []);

export default defineConfig([
  {
    ...js.configs.recommended,
    files: ["**/*.{mjs,cjs,js,jsx}"],
  },
  ...ensureArray(tseslint.configs.strict),
  ...ensureArray(tseslint.configs.strictTypeCheckedOnly).map((c) => ({
    ...c,
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: cwd(),
      },
    },
  })),
  {
    files: ["**/*.cts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/typedef": ["error", { parameter: true }],
    },
  },
  {
    files: ["**/*.{ts,tsx,cjs,mjs,js,jsx}"],
    rules: {
      "class-methods-use-this": "error",
    },
  },
  // lint JSON files
  {
    files: ["**/*.json"],
    ignores: ["package-lock.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },

  // lint JSONC files
  {
    files: ["**/*.jsonc"],
    plugins: { json },
    language: "json/jsonc",
    extends: ["json/recommended"],
  },

  // lint JSON5 files
  {
    files: ["**/*.json5"],
    plugins: { json },
    language: "json/json5",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.md"],
    plugins: {
      markdown,
    },
    extends: ["markdown/recommended"],
  },
  {
    files: ["**/*.css"],
    language: "css/css",
    plugins: { css },
    extends: ["css/recommended"],
  },
  {
    ignores: ["**/coverage/**", "**/out/**", "**/node_modules/**"],
  },
  ...ensureArray(prettier),
]);
