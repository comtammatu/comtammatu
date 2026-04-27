#!/usr/bin/env node
// One-shot i18n codemod for the text-consolidation Phase 2 sweep.
// Replaces `?? "Đã xảy ra lỗi"` / `?? "Lỗi không xác định"` / `?? "Lỗi"`
// with shared ERRORS_VI references, adding the import if missing.
// Idempotent: skips files that already use the canonical reference.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "apps/web/app");
const exts = new Set([".ts", ".tsx"]);

const PATTERNS = [
  { re: /\?\? "Đã xảy ra lỗi"/g, to: "?? ERRORS_VI.fallback", needs: "ERRORS_VI" },
  { re: /\?\? "Lỗi không xác định"/g, to: "?? ERRORS_VI.unknown", needs: "ERRORS_VI" },
  { re: /\?\? "Lỗi"(?!\s*\.)/g, to: "?? ERRORS_VI.fallback", needs: "ERRORS_VI" },
];

const SHARED_PATH = "@comtammatu/shared/messages";

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (exts.has(path.extname(entry.name))) yield p;
  }
}

function ensureImport(content, names) {
  const importRe = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["']${SHARED_PATH.replace(/[/]/g, "\\/")}["']`,
  );
  const existing = content.match(importRe);
  if (existing) {
    const have = new Set(existing[1].split(",").map((s) => s.trim()).filter(Boolean));
    let changed = false;
    for (const n of names) {
      if (!have.has(n)) {
        have.add(n);
        changed = true;
      }
    }
    if (!changed) return content;
    const sorted = [...have].sort();
    return content.replace(
      importRe,
      `import { ${sorted.join(", ")} } from "${SHARED_PATH}"`,
    );
  }
  // No existing shared/messages import — insert after last import line.
  const lines = content.split(/\r?\n/);
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) lastImport = i;
  }
  if (lastImport === -1) return content; // no imports? skip
  const sorted = [...names].sort();
  lines.splice(
    lastImport + 1,
    0,
    `import { ${sorted.join(", ")} } from "${SHARED_PATH}";`,
  );
  return lines.join("\n");
}

let touched = 0;
for (const file of walk(root)) {
  let content = fs.readFileSync(file, "utf8");
  let needs = new Set();
  let next = content;
  for (const { re, to, needs: n } of PATTERNS) {
    if (re.test(next)) {
      needs.add(n);
      next = next.replace(re, to);
    }
  }
  if (needs.size === 0) continue;
  next = ensureImport(next, needs);
  if (next !== content) {
    fs.writeFileSync(file, next);
    touched++;
    console.log("migrated:", path.relative(process.cwd(), file));
  }
}
console.log(`\nTotal files migrated: ${touched}`);
