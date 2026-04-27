#!/usr/bin/env node
// One-shot i18n codemod for the text-consolidation Phase 2 sweep.
//
// Replaces:
//   1. `?? "Đã xảy ra lỗi"`        → `?? ERRORS_VI.fallback`
//   2. `?? "Lỗi không xác định"`   → `?? ERRORS_VI.unknown`
//   3. `?? "Lỗi"`                  → `?? ERRORS_VI.fallback`
//   4. Standalone-line JSX verb text (Hủy/Đóng/Lưu/Tạo mới/Cập nhật/
//      Sửa/Xóa/Thêm/Làm mới/Thử lại) → `{ACTIONS_VI.<verb>}`
//   5. Ternary `? "Cập nhật" : "Tạo mới"` → ACTIONS_VI references
//
// Adds the import from `@comtammatu/shared/messages` if missing, merges
// into existing one otherwise. Idempotent: skips files that already use
// the canonical reference.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "apps/web/app");
const exts = new Set([".ts", ".tsx"]);

const SHARED_PATH = "@comtammatu/shared/messages";

const ERROR_PATTERNS = [
  { re: /\?\? "Đã xảy ra lỗi"/g, to: "?? ERRORS_VI.fallback", needs: "ERRORS_VI" },
  { re: /\?\? "Lỗi không xác định"/g, to: "?? ERRORS_VI.unknown", needs: "ERRORS_VI" },
  { re: /\?\? "Lỗi"(?!\s*\.)/g, to: "?? ERRORS_VI.fallback", needs: "ERRORS_VI" },
];

// Verb → ACTIONS_VI key. Only generic verbs that map cleanly; do not include
// domain-specific phrases ("Lưu cài đặt", "Tạo hồ sơ", etc.).
const VERB_MAP = {
  Hủy: "cancel",
  Đóng: "close",
  Lưu: "save",
  "Tạo mới": "create",
  "Cập nhật": "update",
  Sửa: "edit",
  Xóa: "delete",
  Thêm: "add",
  "Làm mới": "refresh",
  "Thử lại": "retry",
  "Quay lại": "back",
  "Đăng nhập": "signIn",
  "Đăng xuất": "signOut",
};

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
    const have = new Set(
      existing[1].split(",").map((s) => s.trim()).filter(Boolean),
    );
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
  // No existing shared/messages import — insert at end of import zone.
  // Walk the top of the file, tracking whether we're inside a multiline
  // import statement. The boundary is the first non-import / non-blank /
  // non-comment line we encounter outside an import.
  const lines = content.split(/\r?\n/);
  let i = 0;
  let inMultiline = false;
  let boundary = -1;
  let sawImport = false;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (inMultiline) {
      if (/from\s+["'][^"']+["']\s*;?\s*$/.test(trimmed)) inMultiline = false;
      i++;
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
      i++;
      continue;
    }
    // Allow leading directives ("use client" / "use server") and other
    // string-literal prologues to remain at the very top.
    if (!sawImport && /^["'][^"']+["']\s*;?\s*$/.test(trimmed)) {
      i++;
      continue;
    }
    if (/^import\s/.test(trimmed)) {
      sawImport = true;
      // Single-line import ends with `from "..."` on the same line.
      if (!/from\s+["'][^"']+["']\s*;?\s*$/.test(trimmed)) {
        inMultiline = true;
      }
      i++;
      continue;
    }
    // First non-import, non-blank, non-comment line — boundary found.
    boundary = i;
    break;
  }
  if (boundary === -1) boundary = i;
  // If no imports at all, refuse to insert (file likely doesn't need it).
  if (!sawImport) return content;
  const sorted = [...names].sort();
  lines.splice(
    boundary,
    0,
    `import { ${sorted.join(", ")} } from "${SHARED_PATH}";`,
  );
  return lines.join("\n");
}

// Match a JSX text line that is purely a verb. Looks at surrounding lines
// to confirm context (previous line ends with `>` and next line starts
// with `<` or `</`).
function migrateStandaloneVerbs(content) {
  const lines = content.split(/\r?\n/);
  let needs = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s+)([\p{L}\s]+?)\s*$/u);
    if (!m) continue;
    const verb = m[2].trim();
    if (!Object.prototype.hasOwnProperty.call(VERB_MAP, verb)) continue;
    // Confirm flanking JSX context:
    const prev = (lines[i - 1] ?? "").trimEnd();
    const next = (lines[i + 1] ?? "").trimStart();
    const flanksJsx =
      (prev.endsWith(">") || prev.endsWith("}>")) &&
      (next.startsWith("<") || next.startsWith("</"));
    if (!flanksJsx) continue;
    lines[i] = `${m[1]}{ACTIONS_VI.${VERB_MAP[verb]}}`;
    needs = true;
  }
  return { content: lines.join("\n"), needs };
}

// Match standalone-line state phrases (loading/processing/empty etc.) and
// replace with STATES_VI references.
const STATE_MAP = {
  "Đang tải…": "loading",
  "Đang tải...": "loading",
  "Đang tải": "loading",
  "Đang xử lý…": "processing",
  "Đang xử lý...": "processing",
  "Đang lưu…": "saving",
  "Đang lưu...": "saving",
  "Chưa có dữ liệu": "empty",
  "Không tìm thấy kết quả": "noResults",
  "Đã hủy": "cancelled",
  "Hoàn thành": "completed",
  "Hòan thành": "completed",
  "Đã duyệt": "approved",
  "Đã từ chối": "rejected",
  "Đang chờ": "pending",
};
function migrateStandaloneStates(content) {
  const lines = content.split(/\r?\n/);
  let needs = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s+)(.+?)\s*$/);
    if (!m) continue;
    const text = m[2].trim();
    if (!Object.prototype.hasOwnProperty.call(STATE_MAP, text)) continue;
    const prev = (lines[i - 1] ?? "").trimEnd();
    const next = (lines[i + 1] ?? "").trimStart();
    const flanksJsx =
      (prev.endsWith(">") || prev.endsWith("}>")) &&
      (next.startsWith("<") || next.startsWith("</"));
    if (!flanksJsx) continue;
    lines[i] = `${m[1]}{STATES_VI.${STATE_MAP[text]}}`;
    needs = true;
  }
  return { content: lines.join("\n"), needs };
}

// Branch select / selectAll attribute and JSX text.
function migrateBranchPhrases(content) {
  let needs = false;
  let next = content;
  const patterns = [
    {
      re: /placeholder="Tất cả chi nhánh"/g,
      to: "placeholder={BRANCH_VI.selectAll}",
    },
    {
      re: />Tất cả chi nhánh</g,
      to: ">{BRANCH_VI.selectAll}<",
    },
    {
      re: /placeholder="Chọn chi nhánh"/g,
      to: "placeholder={BRANCH_VI.select}",
    },
    {
      re: />Chọn chi nhánh</g,
      to: ">{BRANCH_VI.select}<",
    },
  ];
  for (const { re, to } of patterns) {
    if (re.test(next)) {
      needs = true;
      next = next.replace(re, to);
    }
  }
  return { content: next, needs };
}

// Match ternary `? "VerbA" : "VerbB"` and replace with ACTIONS_VI refs when
// both arms map.
function migrateTernaryVerbs(content) {
  let needs = false;
  const ternaryRe = /\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g;
  const next = content.replace(ternaryRe, (m, a, b) => {
    const ak = VERB_MAP[a];
    const bk = VERB_MAP[b];
    if (!ak || !bk) return m;
    needs = true;
    return `? ACTIONS_VI.${ak} : ACTIONS_VI.${bk}`;
  });
  return { content: next, needs };
}

let touched = 0;
for (const file of walk(root)) {
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  const needs = new Set();

  for (const { re, to, needs: n } of ERROR_PATTERNS) {
    if (re.test(content)) {
      needs.add(n);
      content = content.replace(re, to);
    }
  }

  const v1 = migrateStandaloneVerbs(content);
  if (v1.needs) {
    needs.add("ACTIONS_VI");
    content = v1.content;
  }

  const v2 = migrateTernaryVerbs(content);
  if (v2.needs) {
    needs.add("ACTIONS_VI");
    content = v2.content;
  }

  const v3 = migrateStandaloneStates(content);
  if (v3.needs) {
    needs.add("STATES_VI");
    content = v3.content;
  }

  const v4 = migrateBranchPhrases(content);
  if (v4.needs) {
    needs.add("BRANCH_VI");
    content = v4.content;
  }

  if (needs.size > 0 && content !== original) {
    content = ensureImport(content, needs);
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
    touched++;
    console.log("migrated:", path.relative(process.cwd(), file));
  }
}
console.log(`\nTotal files migrated: ${touched}`);
