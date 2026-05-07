#!/usr/bin/env node
/**
 * check-no-version-suffixes.mjs
 *
 * Enforces regression rule NO-VERSION-SUFFIXES from tasks/regressions.md.
 *
 * Fails CI if any internal file path, folder, identifier, or import target
 * carries a forbidden version/legacy suffix. comtammatu rebuild is greenfield;
 * versioning drift is technical debt we explicitly avoid from day one.
 *
 * Adapted from matu-superapp/scripts/check-no-version-suffixes.mjs (2026-05-07)
 * — single difference: ALLOWED_PATH_PREFIXES uses docs/plan/adr/ (comtammatu
 * path) instead of docs/adr/ (matu-superapp path).
 *
 * This script is a SUPERSET of check-v2-imports.mjs. Eventually that script
 * can be retired; until then both run.
 *
 * Usage:
 *   node scripts/check-no-version-suffixes.mjs
 *   node scripts/check-no-version-suffixes.mjs --quiet   # only print on failure
 *
 * Exit codes:
 *   0 = clean
 *   1 = forbidden patterns detected
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIET = process.argv.includes("--quiet");

// Directories the walker never enters.
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

// Path prefixes (relative to repo root, forward-slash) that bypass all checks.
// These are the only places versioned filenames are legitimate.
const ALLOWED_PATH_PREFIXES = [
  "supabase/migrations/",
  "docs/plan/adr/",
  "docs/archive/", // archived plan docs may retain legacy naming for traceability
];

// Exact filename allowlist for framework-mandated names.
const ALLOWED_FILENAMES = new Set([
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "next-env.d.ts",
]);

// File extensions whose CONTENT we scan for forbidden identifiers.
// Markdown/text files are intentionally excluded so docs may discuss
// forbidden patterns (e.g., this very rule) without self-tripping.
const CONTENT_SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sql",
]);

// Path/segment-level forbidden tokens.
// Matches when the token is a standalone segment surrounded by separators
// or at start/end of the file basename (without extension).
//
// Note: "new" intentionally excluded from path tokens — it's a Next.js
// convention for create-form routes (`app/.../new/page.tsx`) and a common
// semantic term. Identifier-level check still flags `xxx_new` snake_case
// suffixes (e.g., `dashboard_client_new`) where it indicates a version split.
const FORBIDDEN_PATH_TOKENS = [
  "v[2-9]",
  "v[0-9]{2,}", // v10, v11, ...
  "old",
  "legacy",
  "deprecated",
  "next-gen",
  "nextgen",
];

// Compose path token regex: token must appear as its own segment piece,
// delimited by /, -, _, or ., or at file basename end.
const PATH_TOKEN_REGEX = new RegExp(
  String.raw`(?:^|[/\\\-_.])(?:` + FORBIDDEN_PATH_TOKENS.join("|") + String.raw`)(?:[/\\\-_.]|$)`,
  "i",
);

// Identifier-level forbidden suffix regex for content scanning.
// Matches PascalCase or camelCase identifiers ending in version/legacy markers.
const IDENT_FORBIDDEN_REGEX = new RegExp(
  // PascalCase / camelCase identifier ending with V<digit>+ | Old | New | Legacy | Deprecated
  String.raw`\b[A-Za-z][A-Za-z0-9_]*?(?:V[2-9]|V[0-9]{2,}|Old|New|Legacy|Deprecated)\b` +
    "|" +
    // snake_case identifier ending with _v<digit>+ | _old | _new | _legacy | _deprecated
    String.raw`\b[a-z][a-z0-9_]*?_(?:v[2-9]|v[0-9]{2,}|old|new|legacy|deprecated)\b`,
);

// Tokens we never want to flag despite matching the broad regex.
const IDENT_ALLOWLIST = new Set([
  // Semantic "New" verbs — not version markers
  "ItemNew",
  "TabNew",
  "TabsNew",
  "createNew",
  "isNew",
  "addNew",
  "openNew",
  "sponsorNew",
  "onCreateNew",
  "handleCreateNew",
  "handleCreateNewOnOccupied",
  "deltaNew",
  // Domain semantic identifiers (not versions)
  "contract_new",        // labels/vi.ts: "Hợp đồng mới"
  "order_new",           // notification kind: "Đơn mới"
  "pos.order_new",
  // External API protocol identifiers (not our version)
  "MarkdownV2",          // Telegram Bot API protocol name
  "escapeMarkdownV2",
  // Postgres internal/RPC parameter conventions
  "p_new",               // trigger NEW row payload
  "p_old",               // trigger OLD row payload
  "email_change_token_new",  // auth.users column (Supabase)
  // Vietnamese employee code placeholder format
  "NV001",               // employee ID format example in form placeholder
  // Raw lowercase tokens (still flagged in identifiers via boundary)
  "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9",
]);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function relPath(absPath) {
  return toPosix(path.relative(REPO_ROOT, absPath));
}

function isUnderAllowedPrefix(relativePosixPath) {
  return ALLOWED_PATH_PREFIXES.some((prefix) => relativePosixPath.startsWith(prefix));
}

function walk(rootAbs) {
  const out = [];
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
        out.push(abs);
      }
    }
  }
  return out;
}

function checkPath(relPosix, basename) {
  if (isUnderAllowedPrefix(relPosix)) return null;
  if (ALLOWED_FILENAMES.has(basename)) return null;
  const segments = relPosix.split("/");
  for (const seg of segments) {
    if (PATH_TOKEN_REGEX.test(seg)) {
      return seg;
    }
  }
  return null;
}

function checkContent(relPosix, content) {
  if (isUnderAllowedPrefix(relPosix)) return [];
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("--") ||
      trimmed.startsWith("#")
    ) {
      continue;
    }
    const match = line.match(IDENT_FORBIDDEN_REGEX);
    if (match && !IDENT_ALLOWLIST.has(match[0])) {
      findings.push({ line: i + 1, text: line.trim(), match: match[0] });
    }
  }
  return findings;
}

function main() {
  const allFiles = walk(REPO_ROOT);
  const pathFailures = [];
  const contentFailures = [];

  for (const abs of allFiles) {
    const rel = relPath(abs);
    const base = path.basename(abs);

    const badSegment = checkPath(rel, base);
    if (badSegment) {
      pathFailures.push({ path: rel, segment: badSegment });
      continue;
    }

    const ext = path.extname(abs).toLowerCase();
    if (!CONTENT_SCAN_EXTS.has(ext)) continue;

    let content;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const found = checkContent(rel, content);
    if (found.length > 0) {
      contentFailures.push({ path: rel, hits: found });
    }
  }

  const totalFailures = pathFailures.length + contentFailures.length;

  if (totalFailures === 0) {
    if (!QUIET) {
      console.log("check-no-version-suffixes: clean (no forbidden version/legacy suffixes detected).");
    }
    process.exit(0);
  }

  console.error("check-no-version-suffixes: forbidden patterns detected.");
  console.error("");
  console.error("Regression rule: NO-VERSION-SUFFIXES (tasks/regressions.md).");
  console.error("");

  if (pathFailures.length > 0) {
    console.error(`Path/folder violations (${pathFailures.length}):`);
    for (const f of pathFailures) {
      console.error(`  ${f.path}   [forbidden segment: "${f.segment}"]`);
    }
    console.error("");
  }

  if (contentFailures.length > 0) {
    let hitCount = 0;
    for (const f of contentFailures) hitCount += f.hits.length;
    console.error(`Identifier violations (${hitCount} in ${contentFailures.length} file(s)):`);
    for (const f of contentFailures) {
      for (const h of f.hits) {
        console.error(`  ${f.path}:${h.line}   [${h.match}]   ${h.text}`);
      }
    }
    console.error("");
  }

  console.error("Fix: rename to a semantic name, or replace by codemod in one PR.");
  console.error("Allowed exceptions: supabase/migrations/, docs/plan/adr/, docs/archive/, framework-mandated filenames.");
  process.exit(1);
}

main();
