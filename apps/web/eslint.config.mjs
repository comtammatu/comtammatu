import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nextPlugin from "@next/eslint-plugin-next";
import designSystem from "./eslint-plugins/no-arbitrary-tailwind-value.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "design-system": designSystem,
    },
    rules: {
      "design-system/no-arbitrary-tailwind-value": "error",
      "design-system/no-surface-theme-import": "error",
    },
  },
  {
    files: [
      "app/components/foundation/**/*.tsx",
      "app/**/components/*shell.tsx",
      "app/**/layout.tsx",
      "app/employee/components/**/*.tsx",
      "app/inventory/_components/inventory-*.tsx",
      "app/(auth)/**/*.tsx",
    ],
    plugins: {
      "design-system": designSystem,
    },
    rules: {
      "design-system/no-static-ui-inline-style": "error",
    },
  },
  {
    ignores: [".next/", ".turbo/", "node_modules/"],
  },
);
