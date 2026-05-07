#!/usr/bin/env node
/**
 * convert-regressions-to-named-format.mjs
 *
 * One-shot conversion script for B54 (W0' Phase 1.4):
 * Converts `tasks/regressions.md` from date-prefix bullet format to
 * matu-superapp's `**RULE-NAME**:` named-rule format. Enables
 * `scripts/check-doc-cross-references.mjs` to validate rule references
 * + lets agents grep/load specific rules without scanning 62k-token file.
 *
 * Conversion:
 *   FROM:  - [YYYY-MM-DD] RULE-NAME — body...
 *   TO:    - **RULE-NAME**: body... (caught YYYY-MM-DD)
 *
 * Lines already in `**RULE-NAME**:` format are preserved unchanged.
 * Non-rule lines (headers, blank, prose) preserved unchanged.
 *
 * Idempotent: safe to re-run.
 *
 * Usage:
 *   node scripts/convert-regressions-to-named-format.mjs
 *   node scripts/convert-regressions-to-named-format.mjs --dry-run
 *
 * After successful run + verify: this script can be retired.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = path.join(REPO_ROOT, "tasks", "regressions.md");
const DRY_RUN = process.argv.includes("--dry-run");

// Pattern: bullet line starting with `- [YYYY-MM-DD] RULE-NAME — body`
const DATE_PREFIX_REGEX = /^- \[(\d{4}-\d{2}-\d{2})\] ([A-Z][A-Z0-9-]+) — (.+)$/;

// Pattern: hybrid `- [DATE] **RULE** — body` (intermediate state from Phase 0 additions)
const HYBRID_REGEX = /^- \[(\d{4}-\d{2}-\d{2})\] \*\*([A-Z][A-Z0-9-]+)\*\* — (.+)$/;

// Pattern: already converted — skip
const NAMED_RULE_REGEX = /^- \*\*([A-Z][A-Z0-9-]+)\*\*\s*:/;

function main() {
  const original = fs.readFileSync(TARGET, "utf8");
  const lines = original.split("\n");

  let converted = 0;
  let alreadyDone = 0;
  let unmatched = 0;
  const out = [];

  for (const line of lines) {
    // Already in named format? Keep as-is.
    if (NAMED_RULE_REGEX.test(line)) {
      alreadyDone++;
      out.push(line);
      continue;
    }

    // Hybrid: `- [DATE] **RULE** — body` → strip date prefix + flip — to :
    const h = line.match(HYBRID_REGEX);
    if (h) {
      const [, date, ruleName, body] = h;
      const trailingDate = body.includes(`(caught ${date})`) ? "" : ` (caught ${date})`;
      out.push(`- **${ruleName}**: ${body}${trailingDate}`);
      converted++;
      continue;
    }

    // Date-prefix bullet? Convert.
    const m = line.match(DATE_PREFIX_REGEX);
    if (m) {
      const [, date, ruleName, body] = m;
      const trailingDate = body.includes(`(caught ${date})`) ? "" : ` (caught ${date})`;
      out.push(`- **${ruleName}**: ${body}${trailingDate}`);
      converted++;
      continue;
    }

    // Non-rule line — preserve.
    if (line.startsWith("- [") && !DATE_PREFIX_REGEX.test(line) && !HYBRID_REGEX.test(line)) {
      unmatched++;
    }
    out.push(line);
  }

  console.log(`Total lines: ${lines.length}`);
  console.log(`Converted to named-rule format: ${converted}`);
  console.log(`Already in named format (skipped): ${alreadyDone}`);
  console.log(`Bullet entries that did not match pattern: ${unmatched} (review if >0)`);

  if (DRY_RUN) {
    console.log("\n--dry-run: no file written.");
    process.exit(0);
  }

  fs.writeFileSync(TARGET, out.join("\n"), "utf8");
  console.log(`\nWrote ${TARGET}`);
}

main();
