#!/usr/bin/env node
/**
 * check-doc-cross-references.mjs
 *
 * Enforces the SAME-PR-DOC-SYNC and NO-DOC-GRAVEYARD regression rules.
 *
 * For every Markdown file in the repo (outside skipped dirs), the script
 * checks three classes of cross-reference:
 *
 *   1. ADR references — every "ADR-NNNN" mention (e.g., "ADR-0007") must
 *      have a matching `docs/plan/adr/NNNN-*.md` file present in the repo.
 *
 *   2. Doc/script link targets — every fenced or backtick-wrapped path
 *      that looks like a repo-internal file must exist on disk.
 *
 *   3. Regression rule references — every UPPER-CASE-WITH-DASHES rule name
 *      mentioned in a non-rule doc must appear in `tasks/regressions.md`.
 *
 * Adapted from matu-superapp/scripts/check-doc-cross-references.mjs
 * (2026-05-07) — differences:
 *   - ADR path: docs/plan/adr/ (comtammatu) vs docs/adr/ (matu-superapp)
 *   - EXPECTED_RUNTIME_PATHS: empty initially; populate as planned-but-not-yet
 *     paths emerge during W0' work.
 *
 * Usage:
 *   node scripts/check-doc-cross-references.mjs
 *   node scripts/check-doc-cross-references.mjs --quiet
 *
 * Exit codes:
 *   0 = clean
 *   1 = orphan reference detected
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIET = process.argv.includes("--quiet");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "coverage",
  ".pnpm-store",
  ".cache",
]);

const SCAN_EXTS = new Set([".md"]);

// Tokens that look like ADR placeholders or example rule names but are not real references.
const EXAMPLE_TOKEN_ALLOWLIST = new Set([
  "ADR-NNNN",
  "OLD-RULE-NAME",
]);

// Files whose mentions we skip entirely.
// CHANGELOG/worklog/archive contain historical references to files that may
// have been moved or removed; these are immutable history, not current truth.
const SCAN_SKIP_FILES = new Set([
  "CHANGELOG.md",
]);

// Path prefixes we skip — historical/archival docs reference paths that
// existed at write-time but may have moved.
const SKIP_PATH_PREFIXES = [
  "docs/worklog/",
  "docs/archive/",
];

// Paths the docs reference as planned deliverables that don't exist yet.
// As W0' work lands real files at these paths, the entries can be removed
// (the script will see the file exists and pass).
const EXPECTED_RUNTIME_PATHS = new Set([
  // Populate as planning work progresses. Examples that may belong here later:
  // "packages/shared/src/labels/vi.ts",
  // "packages/shared/src/auth/module-acl.ts",
  // "apps/web/app/admin/kitchen-sink/page.tsx",
]);

function walk(rootAbs) {
  const files = [];
  const stack = [rootAbs];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        files.push(abs);
      }
    }
  }
  return files;
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function relPath(absPath) {
  return toPosix(path.relative(REPO_ROOT, absPath));
}

function fileExists(absPath) {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function collectExistingAdrNumbers() {
  const adrDir = path.join(REPO_ROOT, "docs", "plan", "adr");
  const numbers = new Set();
  let entries;
  try {
    entries = fs.readdirSync(adrDir);
  } catch {
    return numbers;
  }
  for (const name of entries) {
    const m = name.match(/^(\d{4})-.+\.md$/);
    if (m) numbers.add(m[1]);
  }
  return numbers;
}

function collectRegressionRuleNames() {
  const regressionsAbs = path.join(REPO_ROOT, "tasks", "regressions.md");
  const names = new Set();
  let content;
  try {
    content = fs.readFileSync(regressionsAbs, "utf8");
  } catch {
    return names;
  }
  // Rule names appear as `**RULE-NAME**:` at the start of bullets.
  const ruleRegex = /\*\*([A-Z][A-Z0-9-]+)\*\*\s*:/g;
  let m;
  while ((m = ruleRegex.exec(content)) !== null) {
    names.add(m[1]);
  }
  return names;
}

const ADR_REF_REGEX = /\bADR-(\d{4}|NNNN)\b/g;

const RULE_NAME_REGEX = /\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+){2,})\b/g;

const PATH_LINK_REGEX = /`([a-zA-Z0-9_./-]+\.(?:md|mjs|cjs|js|ts|tsx|jsx|json|sql|yaml|yml|toml|dart|css|html|sh))`/g;

function scanFile(absPath, adrNumbers, ruleNames) {
  const rel = relPath(absPath);
  if (SCAN_SKIP_FILES.has(rel)) return [];
  if (SKIP_PATH_PREFIXES.some((p) => rel.startsWith(p))) return [];
  const ext = path.extname(absPath).toLowerCase();
  if (!SCAN_EXTS.has(ext)) return [];

  let content;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return [];
  }

  const findings = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // (1) ADR references
    let m;
    ADR_REF_REGEX.lastIndex = 0;
    while ((m = ADR_REF_REGEX.exec(line)) !== null) {
      const num = m[1];
      if (num === "NNNN") continue;
      if (!adrNumbers.has(num)) {
        findings.push({
          line: i + 1,
          kind: "missing-adr",
          token: `ADR-${num}`,
          text: line.trim(),
        });
      }
    }

    // (2) Path link targets
    PATH_LINK_REGEX.lastIndex = 0;
    while ((m = PATH_LINK_REGEX.exec(line)) !== null) {
      const refPath = m[1];
      if (refPath.startsWith("http://") || refPath.startsWith("https://")) continue;
      if (refPath.startsWith("/")) continue;
      if (!refPath.includes("/")) continue;
      if (EXPECTED_RUNTIME_PATHS.has(refPath)) continue;
      const targetAbs = path.join(REPO_ROOT, refPath);
      if (!fileExists(targetAbs)) {
        findings.push({
          line: i + 1,
          kind: "missing-link-target",
          token: refPath,
          text: line.trim(),
        });
      }
    }

    // (3) Regression rule name references (only in non-regressions.md files)
    if (!rel.endsWith("tasks/regressions.md")) {
      RULE_NAME_REGEX.lastIndex = 0;
      while ((m = RULE_NAME_REGEX.exec(line)) !== null) {
        const name = m[1];
        if (EXAMPLE_TOKEN_ALLOWLIST.has(name)) continue;
        const before = line.substring(0, m.index);
        const after = line.substring(m.index + name.length);
        const inBackticks = before.endsWith("`") && after.startsWith("`");
        const followsRuleWord = /\b(?:rule|regression|enforces?|enforced by|per)\s+`?$/i.test(before);
        if (!(inBackticks || followsRuleWord)) continue;
        if (!ruleNames.has(name)) {
          findings.push({
            line: i + 1,
            kind: "missing-rule",
            token: name,
            text: line.trim(),
          });
        }
      }
    }
  }

  return findings.map((f) => ({ ...f, path: rel }));
}

function main() {
  const adrNumbers = collectExistingAdrNumbers();
  const ruleNames = collectRegressionRuleNames();

  const files = walk(REPO_ROOT);
  const allFindings = [];

  for (const abs of files) {
    const findings = scanFile(abs, adrNumbers, ruleNames);
    allFindings.push(...findings);
  }

  if (allFindings.length === 0) {
    if (!QUIET) {
      console.log(
        `check-doc-cross-references: clean (${adrNumbers.size} ADRs, ${ruleNames.size} rules indexed; no orphan references).`
      );
    }
    process.exit(0);
  }

  console.error("check-doc-cross-references: orphan references detected.");
  console.error("");
  console.error("Regression rule: SAME-PR-DOC-SYNC (tasks/regressions.md).");
  console.error("");

  const grouped = {
    "missing-adr": [],
    "missing-link-target": [],
    "missing-rule": [],
  };
  for (const f of allFindings) grouped[f.kind].push(f);

  if (grouped["missing-adr"].length > 0) {
    console.error(`Missing ADRs (${grouped["missing-adr"].length}):`);
    for (const f of grouped["missing-adr"]) {
      console.error(`  ${f.path}:${f.line}   [${f.token}]   ${f.text}`);
    }
    console.error("");
  }
  if (grouped["missing-link-target"].length > 0) {
    console.error(`Broken doc/file links (${grouped["missing-link-target"].length}):`);
    for (const f of grouped["missing-link-target"]) {
      console.error(`  ${f.path}:${f.line}   [${f.token}]   ${f.text}`);
    }
    console.error("");
  }
  if (grouped["missing-rule"].length > 0) {
    console.error(`Unknown regression rule names (${grouped["missing-rule"].length}):`);
    for (const f of grouped["missing-rule"]) {
      console.error(`  ${f.path}:${f.line}   [${f.token}]   ${f.text}`);
    }
    console.error("");
  }

  console.error("Fix: update the orphan references, or add the missing target file/rule.");
  process.exit(1);
}

main();
