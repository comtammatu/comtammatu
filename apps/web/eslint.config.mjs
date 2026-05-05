import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
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

// Match any Vietnamese diacritic (Latin-1 Supplement + Latin Extended-A/B
// VN-specific + Latin Extended Additional). Catches "Hủy"/"Đã"/"Đơn"/"Bàn"
// etc. but not plain ASCII identifiers. Heuristic for "is this string
// Vietnamese?" — false positives possible for European accented Latin but
// rare in this single-locale codebase.
const VI_DIACRITIC_REGEX =
  /[À-ÿĂ-ăĐ-đƠ-ưẠ-ỹ]/;
const VI_TARGET_ATTRS = /^(title|placeholder|aria-label|alt)$/;

const I18N_BASELINE_PATH = `${__dirname}/eslint-i18n-baseline.json`;
const I18N_BASELINE_DISABLED = process.env.I18N_BASELINE_DISABLE === "1";

function loadI18nBaseline() {
  if (I18N_BASELINE_DISABLED || !existsSync(I18N_BASELINE_PATH)) {
    return new Set();
  }
  const baseline = JSON.parse(readFileSync(I18N_BASELINE_PATH, "utf8"));
  return new Set(Array.isArray(baseline.entries) ? baseline.entries : []);
}

const i18nBaseline = loadI18nBaseline();

function getI18nBaselineKey(context, node) {
  const filename = context.filename ?? context.getFilename?.();
  if (!filename || !node.loc?.start) return null;
  const relPath = relative(__dirname, filename).split(sep).join("/");
  return `${relPath}:${node.loc.start.line}:${node.loc.start.column + 1}`;
}

function reportInlineVietnamese(context, node) {
  const key = getI18nBaselineKey(context, node);
  if (key && i18nBaseline.has(key)) return;
  context.report({ node, messageId: "inlineVN" });
}

// Custom rule: flag inline Vietnamese strings in JSX text nodes and
// user-facing attributes (title/placeholder/aria-label/alt). Severity is
// "warn" for new offenders. Legacy offenders are explicitly baselined in
// `eslint-i18n-baseline.json`; run with `I18N_BASELINE_DISABLE=1` to see the
// full Phase 2 sweep list. Escape hatch: `// eslint-disable-next-line` with
// `vi-allow:` reason for legal-fixed strings (HĐĐT/MST/...) or domain edge cases.
// See tasks/regressions.md MESSAGES-SINGLE-SOURCE (2026-04-27).
const i18nPlugin = {
  rules: {
    "no-inline-vietnamese": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "Disallow inline Vietnamese string literals in JSX. Use ACTIONS_VI/STATES_VI/ERRORS_VI/domain dict from @comtammatu/shared/messages or apps/web/lib/messages/* instead.",
        },
        schema: [],
        messages: {
          inlineVN:
            "Inline Vietnamese in JSX. Import from @comtammatu/shared/messages or apps/web/lib/messages/*. Override: `// eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: <reason>`.",
        },
      },
      create(context) {
        return {
          JSXText(node) {
            if (VI_DIACRITIC_REGEX.test(node.value)) {
              reportInlineVietnamese(context, node);
            }
          },
          JSXAttribute(node) {
            const name = node.name?.name;
            if (typeof name !== "string" || !VI_TARGET_ATTRS.test(name))
              return;
            const value = node.value;
            if (
              value?.type === "Literal" &&
              typeof value.value === "string" &&
              VI_DIACRITIC_REGEX.test(value.value)
            ) {
              reportInlineVietnamese(context, value);
            }
          },
        };
      },
    },
  },
};

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
    files: ["**/*.tsx"],
    plugins: {
      i18n: i18nPlugin,
    },
    rules: {
      "i18n/no-inline-vietnamese": "warn",
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
