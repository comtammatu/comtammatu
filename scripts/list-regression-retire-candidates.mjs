import fs from "node:fs";
import path from "node:path";

// Advisory, read-only lister for tasks/regressions.md retire candidates. It only
// PRINTS for human confirmation — it never edits, never exits non-zero, and is
// NOT in the lint chain. It surfaces two review signals: rules explicitly
// superseded and rules whose name matches a code guard. It does not automate
// dead-file detection: a naive path scan
// false-positives on relative paths, column refs, and section anchors, and would
// pressure deletion of still-valid rules. "Is this rule truly dead" stays the
// owner's judgment; this only narrows where to look.

const REPO_ROOT = process.cwd();
const REG = path.join(REPO_ROOT, "tasks/regressions.md");
const GUARD_SRC = path.join(REPO_ROOT, "scripts/check-regression-guards.mjs");

const text = fs.readFileSync(REG, "utf8");

const ruleNames = new Set();
for (const m of text.matchAll(/^- \[\d{4}-\d{2}-\d{2}\]\s+([A-Z0-9-]+)\s+—/gm)) {
  ruleNames.add(m[1]);
}

const superseded = new Set();
for (const m of text.matchAll(
  /Supersedes\s+(?:\[?\d{4}-\d{2}-\d{2}\]?\s+)?([A-Z0-9-]+)/g,
)) {
  if (ruleNames.has(m[1])) superseded.add(m[1]);
}

const guarded = new Set();
if (fs.existsSync(GUARD_SRC)) {
  const guardSrc = fs.readFileSync(GUARD_SRC, "utf8");
  for (const m of guardSrc.matchAll(/rule:\s*"([A-Z0-9-]+)"/g)) {
    if (ruleNames.has(m[1])) guarded.add(m[1]);
  }
}

const list = (s) => (s.size ? [...s].map((r) => `  - ${r}`).join("\n") : "  (none)");

console.log(`Regression retire candidates (advisory — confirm before deleting):`);
console.log(`\nTotal rules in tasks/regressions.md: ${ruleNames.size}\n`);
console.log(`Superseded (a later rule states "Supersedes … <NAME>"):`);
console.log(list(superseded));
console.log(
  `\nName matches a code guard in check-regression-guards.mjs — verify the guard\nfully covers the prose before retiring:`,
);
console.log(list(guarded));
console.log(
  `\nNot scanned: dead file references — intentionally manual.\nA low candidate count is expected and fine; most rules are still load-bearing.`,
);
