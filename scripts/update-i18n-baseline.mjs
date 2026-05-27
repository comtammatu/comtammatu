#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(repoRoot, "apps/web");
const outPath = resolve(webRoot, "eslint-i18n-baseline.json");

const result = spawnSync(
  "pnpm",
  ["--filter", "@comtammatu/web", "exec", "eslint", ".", "-f", "json"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      I18N_BASELINE_DISABLE: "1",
    },
    maxBuffer: 50 * 1024 * 1024,
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0 && !result.stdout) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const entries = [];
for (const file of JSON.parse(result.stdout)) {
  const relPath = relative(webRoot, file.filePath).split(sep).join("/");
  for (const message of file.messages) {
    if (message.ruleId !== "i18n/no-inline-vietnamese") continue;
    entries.push(`${relPath}:${message.line}:${message.column}`);
  }
}

entries.sort();

writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      version: 1,
      rule: "i18n/no-inline-vietnamese",
      description:
        "Baseline for tracked inline Vietnamese JSX copy. New occurrences not listed here still report in pnpm lint.",
      generatedAt: new Date().toISOString().slice(0, 10),
      count: entries.length,
      entries,
    },
    null,
    2,
  )}\n`,
);

console.log(`Updated ${relative(repoRoot, outPath)} with ${entries.length} entries.`);
