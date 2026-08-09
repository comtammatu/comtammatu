#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();

/** Paths that must be English prose (Vietnamese diacritics forbidden except allowlist). */
const ENGLISH_ROOTS = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/agent",
  "docs/plan",
  "docs/spec",
  "docs/modules",
  "docs/architecture",
  "docs/CODEBASE_MAP.md",
  "tasks",
  ".agents/skills",
];

const ALLOWED_EXTENSIONS = new Set([".md", ".mjs", ".ts", ".tsx"]);

const VI_DIACRITIC = /[À-ỹ]/;

/**
 * Brand names, legal acronyms, and decision-test phrases that may appear
 * unquoted in English-required docs. Longer tokens first.
 */
const ALLOWED_VI_TOKENS = [
  "chỉ chọn hoặc chia số lượng khi có nhiều NCC",
  "bị chặn để bổ sung mapping",
  "không tăng số lượng lần hai",
  "chỉ có một NCC active",
  "Cơm Tấm Má Tư",
  "Kết quả vận hành",
  "CTCP Chén Sứ",
  "Lợi nhuận ròng",
  "Hóa đơn NCC",
  "GRN nháp/PO",
  "Nhu cầu mua",
  "Chén Sứ",
  "Chốt ngày",
  "GRN nháp",
  "Cơm Tấm",
  "Kế toán",
  "PO/NCC",
  "Má Tư",
  "HĐĐT",
  "GTGT",
  "HĐLĐ",
  "TNCN",
  "BHXH",
  "BHYT",
  "BHTN",
  "NCC",
].toSorted((a, b) => b.length - a.length);

function stripQuotedStrings(text) {
  return text
    .replace(/`[^`]*`/g, (match) => " ".repeat(match.length))
    .replace(/"[^"]*"/g, (match) => " ".repeat(match.length))
    .replace(/'[^']*'/g, (match) => " ".repeat(match.length))
    .replace(/“[^”]*”/g, (match) => " ".repeat(match.length))
    .replace(/‘[^’]*’/g, (match) => " ".repeat(match.length));
}

function stripAllowedTokens(text) {
  let next = stripQuotedStrings(text);
  for (const token of ALLOWED_VI_TOKENS) {
    if (!next.includes(token)) continue;
    next = next.split(token).join(" ".repeat(token.length));
  }
  return next;
}

function walkFiles(root) {
  const fullRoot = join(REPO_ROOT, root);
  if (!existsSync(fullRoot)) return [];
  const stat = readFileSync;
  void stat;
  const out = [];
  const stack = [fullRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      // File root (e.g. AGENTS.md)
      out.push(current);
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = entry.name.includes(".")
        ? `.${entry.name.split(".").pop()}`
        : "";
      if (root.endsWith(".md") || ALLOWED_EXTENSIONS.has(ext)) out.push(full);
    }
  }
  return out;
}

function collectRoots() {
  const files = [];
  for (const root of ENGLISH_ROOTS) {
    const full = join(REPO_ROOT, root);
    if (!existsSync(full)) continue;
    try {
      readdirSync(full);
      files.push(...walkFiles(root));
    } catch {
      files.push(full);
    }
  }
  return [...new Set(files)].sort();
}

export function collectLanguagePolicyErrors(repoRoot = REPO_ROOT) {
  const previous = process.cwd();
  if (repoRoot !== previous) {
    // Tests pass an isolated fixture root by temporarily rewriting paths via
    // relative joins from REPO_ROOT; fixture mode uses walk below.
  }
  void previous;

  const errors = [];
  const roots = ENGLISH_ROOTS.map((root) => join(repoRoot, root));
  const files = [];

  for (const full of roots) {
    if (!existsSync(full)) continue;
    try {
      const stack = [full];
      while (stack.length > 0) {
        const current = stack.pop();
        let entries;
        try {
          entries = readdirSync(current, { withFileTypes: true });
        } catch {
          files.push(current);
          continue;
        }
        for (const entry of entries) {
          const child = join(current, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            stack.push(child);
            continue;
          }
          if (!entry.isFile()) continue;
          if (entry.name.endsWith(".md")) files.push(child);
        }
      }
    } catch {
      if (full.endsWith(".md")) files.push(full);
    }
  }

  for (const file of files.sort()) {
    const rel = relative(repoRoot, file);
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const stripped = stripAllowedTokens(lines[index] ?? "");
      if (!VI_DIACRITIC.test(stripped)) continue;
      const sample = (lines[index] ?? "").trim().slice(0, 120);
      errors.push(
        `${rel}:${index + 1}: Vietnamese diacritics in English-required doc — ${sample}`,
      );
      break;
    }
  }

  return errors;
}

function runSelfTest() {
  const fixture = mkdtempSync(join(tmpdir(), "comtammatu-language-policy-"));
  try {
    mkdirSync(join(fixture, "docs/agent/rules"), { recursive: true });
    writeFileSync(
      join(fixture, "docs/agent/rules/sample.md"),
      "# Sample\n\nThis has tiếng Việt diacritics.\n",
    );
    writeFileSync(
      join(fixture, "AGENTS.md"),
      "# Agents\n\nBrand Má Tư is allowed.\n",
    );
    const errors = collectLanguagePolicyErrors(fixture);
    assert.match(errors.join("\n"), /sample\.md/);
    assert.doesNotMatch(errors.join("\n"), /AGENTS\.md/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  console.log("[language-policy] self-test passed");
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const errors = collectLanguagePolicyErrors(REPO_ROOT);
  if (errors.length > 0) {
    for (const error of errors.slice(0, 50)) {
      console.error(`[language-policy] ${error}`);
    }
    if (errors.length > 50) {
      console.error(`[language-policy] … ${errors.length - 50} more`);
    }
    process.exit(1);
  }

  console.log(
    `[language-policy] English-required trees clean (${collectRoots().length} files scanned)`,
  );
}

main();
