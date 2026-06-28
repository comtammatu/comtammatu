#!/usr/bin/env node
// Fail if the inline-Vietnamese baseline grew versus origin/main.
// apps/web/eslint-i18n-baseline.json grandfathers existing inline strings; it
// must only shrink. Without this guard a literal->ternary/template refactor (or
// any newly-inline string the rule can see) silently re-baselines and the
// surface grows while CI stays green.
//
// CI note: the lint job must have origin/main available (fetch it, or use
// fetch-depth: 0). When the ref is missing the check skips rather than blocks.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const FILE = "apps/web/eslint-i18n-baseline.json";

function countOf(json) {
  const parsed = JSON.parse(json);
  return typeof parsed.count === "number"
    ? parsed.count
    : Array.isArray(parsed.entries)
      ? parsed.entries.length
      : 0;
}

const current = countOf(readFileSync(FILE, "utf8"));

let base;
try {
  base = countOf(
    execSync(`git show origin/main:${FILE}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  console.warn(
    `[i18n-baseline] origin/main:${FILE} unavailable — skipping no-grow check.`,
  );
  process.exit(0);
}

if (current > base) {
  console.error(
    `[i18n-baseline] FAIL: inline-Vietnamese baseline grew ${base} -> ${current} (+${current - base}).\n` +
      `The baseline may only shrink. Extract the new strings into the copy contract\n` +
      `(packages/shared/src/messages/* or packages/shared/src/labels/vi.ts) instead of\n` +
      `grandfathering them via 'pnpm lint:i18n:baseline'.`,
  );
  process.exit(1);
}

console.log(
  `[i18n-baseline] OK: ${current} <= ${base} (no growth vs origin/main).`,
);
