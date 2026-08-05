#!/usr/bin/env node
/**
 * Fail when forbidden Vietnamese terminology synonyms appear outside the
 * glossary / synonym registry. Authority: docs/ref/glossary.md.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SYNONYMS_PATH = join(ROOT, "docs/ref/terminology-synonyms.json");

const INCLUDE_DIRS = [
  "apps/web/lib/messages",
  "packages/shared/src/messages",
  "packages/shared/src/labels",
  "docs/modules",
  "docs/ref",
];

const EXCLUDED_RELATIVE_PATHS = new Set([
  "docs/ref/glossary.md",
  "docs/ref/terminology-synonyms.json",
]);

const EXCLUDED_PATH_SEGMENTS = new Set([
  ".next",
  ".turbo",
  "node_modules",
  "tmp",
]);

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".md", ".json"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (EXCLUDED_PATH_SEGMENTS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!ALLOWED_EXTENSIONS.has(extname(entry.name))) continue;
    if (EXCLUDED_RELATIVE_PATHS.has(rel)) continue;
    out.push(rel);
  }
  return out;
}

function loadEntries() {
  const raw = JSON.parse(readFileSync(SYNONYMS_PATH, "utf8"));
  if (!Array.isArray(raw.entries)) {
    throw new Error("terminology-synonyms.json: missing entries[]");
  }
  const phrases = [];
  for (const entry of raw.entries) {
    if (!entry?.term || !entry?.label_vi) {
      throw new Error(
        `terminology-synonyms.json: entry missing term/label_vi: ${JSON.stringify(entry)}`,
      );
    }
    for (const phrase of entry.forbidden ?? []) {
      if (typeof phrase !== "string" || phrase.length === 0) continue;
      phrases.push({ term: entry.term, label_vi: entry.label_vi, phrase });
    }
  }
  // Longest first so more specific phrases report cleanly.
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);
  return { entries: raw.entries, phrases };
}

function collectFiles() {
  const files = [];
  for (const dir of INCLUDE_DIRS) {
    const abs = join(ROOT, dir);
    try {
      if (!statSync(abs).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(abs, files);
  }
  return files;
}

function lint() {
  const { entries, phrases } = loadEntries();
  if (phrases.length === 0) {
    console.log("lint-terminology: no forbidden phrases configured.");
    return;
  }

  const violations = [];
  for (const file of collectFiles()) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const { term, label_vi, phrase } of phrases) {
      if (!text.includes(phrase)) continue;
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.includes(phrase)) return;
        violations.push({
          file,
          line: index + 1,
          term,
          label_vi,
          phrase,
          snippet: line.trim().slice(0, 160),
        });
      });
    }
  }

  if (violations.length === 0) {
    console.log(
      `lint-terminology: ok (${entries.length} terms, ${phrases.length} forbidden phrases).`,
    );
    return;
  }

  console.error("lint-terminology: forbidden synonym(s) found:\n");
  for (const hit of violations) {
    console.error(
      `- ${hit.file}:${hit.line} — "${hit.phrase}" → use "${hit.label_vi}" (${hit.term})`,
    );
    console.error(`  ${hit.snippet}`);
  }
  console.error(
    `\nUpdate copy to the glossary Long/Short label, or revise docs/ref/glossary.md and docs/ref/terminology-synonyms.json together.`,
  );
  process.exitCode = 1;
}

function selfTest() {
  const { entries, phrases } = loadEntries();
  if (entries.length < 5) {
    throw new Error("self-test: expected at least 5 terminology entries");
  }
  if (!phrases.some((p) => p.phrase === "Kết quả vận hành")) {
    throw new Error("self-test: missing finance forbidden seed Kết quả vận hành");
  }
  const fixtureBad = 'label: "Kết quả vận hành"';
  if (!fixtureBad.includes("Kết quả vận hành")) {
    throw new Error("self-test: fixture match failed");
  }
  console.log("lint-terminology self-test: ok");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  lint();
}
