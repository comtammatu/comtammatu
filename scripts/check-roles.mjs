/**
 * check-roles.mjs — role-literal guard (companion to check-db-drift.mjs).
 *
 * The HKD lean model collapsed staff roles to exactly four:
 * {owner, manager, staff, chef} (see packages/shared/src/auth/types.ts →
 * STAFF_ROLES, which the DB auth hook actually emits). Any role-literal array
 * that names a string outside that set is drift — a leftover legacy role
 * (cashier, waiter, branch_manager, area_manager, accountant, …) that would
 * silently never match a real JWT claim.
 *
 * This guard scans role-literal array forms and validates every string entry:
 *   - `allowedRoles: [ ... ]`                 (module-acl entries)
 *   - `: StaffRole[] = [ ... ]`               (typed role constants)
 *   - `: readonly StaffRole[] = [ ... ]`
 *
 * Source of truth for the valid set: STAFF_ROLES in
 * packages/shared/src/auth/types.ts (parsed, not hard-coded).
 *
 * Comments are stripped first so JSDoc examples never trip the check.
 * Exit 1 with a clear list on any offending literal, exit 0 otherwise.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const TYPES_FILE = path.join(REPO_ROOT, "packages/shared/src/auth/types.ts");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  ".git",
  "e2e",
]);
const SCAN_ROOTS = ["apps/web", "packages"];
const SCAN_EXTENSIONS = [".ts", ".tsx"];

/* ── source of truth: STAFF_ROLES ────────────────────────────────────────── */

function loadValidRoles() {
  if (!fs.existsSync(TYPES_FILE)) {
    console.error(`check-roles: types file not found at ${TYPES_FILE}`);
    process.exit(1);
  }
  const src = fs.readFileSync(TYPES_FILE, "utf8");
  const block = src.match(
    /export const STAFF_ROLES\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  if (!block) {
    console.error(
      "check-roles: could not locate STAFF_ROLES in packages/shared/src/auth/types.ts",
    );
    process.exit(1);
  }
  const roles = [...block[1].matchAll(/["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g)].map(
    (m) => m[1],
  );
  if (roles.length === 0) {
    console.error("check-roles: STAFF_ROLES parsed empty");
    process.exit(1);
  }
  return new Set(roles);
}

/* ── shared helpers (mirrors check-db-drift comment stripping) ────────────── */

function walkFiles(rootDir) {
  const absoluteRoot = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
      } else if (
        entry.isFile() &&
        SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
      ) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files;
}

function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  let state = "code";
  let q = "";
  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : "";
    if (state === "code") {
      if (ch === "/" && next === "/") {
        state = "line";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        state = "string";
        q = ch;
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (state === "string") {
      out += ch;
      if (ch === "\\" && i + 1 < n) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === q) {
        state = "code";
        q = "";
      }
      i += 1;
      continue;
    }
    if (state === "line") {
      if (ch === "\n") {
        state = "code";
        out += ch;
      } else out += " ";
      i += 1;
      continue;
    }
    if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        out += "  ";
        i += 2;
        continue;
      }
      out += ch === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
  }
  return out;
}

function lineNumberAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

/* ── scan role-literal arrays ─────────────────────────────────────────────── */

// Matches the opening of a role-literal array, capturing everything up to the
// closing bracket. `[^\]]` keeps it to a single (possibly multiline) flat
// array — role arrays in this repo never nest.
const ARRAY_RE =
  /(?:allowedRoles\s*:|:\s*(?:readonly\s+)?StaffRole\[\]\s*=)\s*\[([^\]]*)\]/g;
const STRING_LITERAL_RE = /["'`]([^"'`]*)["'`]/g;

function scan(validRoles) {
  const failures = [];
  for (const root of SCAN_ROOTS) {
    for (const filePath of walkFiles(root)) {
      const code = stripComments(fs.readFileSync(filePath, "utf8"));
      const rel = path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
      let m;
      ARRAY_RE.lastIndex = 0;
      while ((m = ARRAY_RE.exec(code))) {
        const body = m[1];
        const bodyStart = m.index + m[0].indexOf("[") + 1;
        let s;
        STRING_LITERAL_RE.lastIndex = 0;
        while ((s = STRING_LITERAL_RE.exec(body))) {
          const role = s[1];
          if (!validRoles.has(role)) {
            failures.push({
              file: rel,
              line: lineNumberAt(code, bodyStart + s.index),
              role,
            });
          }
        }
      }
    }
  }
  return failures;
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const validRoles = loadValidRoles();
const failures = scan(validRoles);

if (failures.length > 0) {
  console.error("Role-literal check FAILED. Role arrays must only use:", [
    ...validRoles,
  ].join(", "));
  for (const f of failures) {
    console.error(`- ${f.file}:${f.line}  unknown role "${f.role}"`);
  }
  process.exit(1);
}

console.log(
  `Role-literal check: OK — all role arrays use only {${[...validRoles].join(", ")}}.`,
);
