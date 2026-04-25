import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nextPlugin from "@next/eslint-plugin-next";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Forbid raw Tailwind palette utilities in app code.
// Anchors: only match utilities at start of class string OR after whitespace
// (avoids e.g. `not-bg-purple-50` false-positives).
// Enforces regression rule NO-RAW-TAILWIND-PALETTE-IN-APP (tasks/regressions.md, 2026-04-26):
// inside apps/web/** code MUST NOT use bg-{color}-{n}, text-{color}-{n},
// border-{color}-{n}, etc. with Tailwind palette colors. Use semantic tokens
// (bg-success/10, text-tier-elite, border-destructive). Theme tokens live in
// packages/ui/src/styles/globals.css.
const RAW_TAILWIND_PALETTE_REGEX =
  "(^|\\s)(bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder|caret|accent|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\\b";

const RAW_TAILWIND_PALETTE_MESSAGE =
  "Raw Tailwind palette class detected. Use semantic tokens instead (bg-success/10, text-tier-elite, border-destructive). Defined in packages/ui/src/styles/globals.css Zone B. See tasks/regressions.md NO-RAW-TAILWIND-PALETTE-IN-APP.";

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
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${RAW_TAILWIND_PALETTE_REGEX}/]`,
          message: RAW_TAILWIND_PALETTE_MESSAGE,
        },
        {
          selector: `TemplateElement[value.raw=/${RAW_TAILWIND_PALETTE_REGEX}/]`,
          message: RAW_TAILWIND_PALETTE_MESSAGE,
        },
      ],
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
    ignores: [
      ".next/",
      ".turbo/",
      "node_modules/",
      // Serwist-generated service worker bundle + chunks; minified output.
      "public/sw.js",
      "public/sw.js.map",
      "public/swe-worker-*.js",
      "public/workbox-*.js",
    ],
  },
);
