/**
 * check-db-drift.mjs — app→DB drift linter (audit control ARCH-08).
 *
 * Source of truth: packages/database/src/types/database.types.ts (the
 * regenerated lean types). This script parses the valid table/view names
 * (keys of Database["public"]["Tables"] and ["Views"]) and the valid RPC
 * names (keys of Database["public"]["Functions"]), then scans the app +
 * packages for Supabase calls that reference a name the types don't know
 * about:
 *
 *   - `.from("X")`  where X is not a valid table or view
 *   - `.rpc("Y")`   where Y is not a valid function
 *
 * Exit 1 with a clear list when drift is found, exit 0 otherwise.
 *
 * Design notes (favor precision over recall — see the task brief):
 *   - Comments (line `//` and block `/* * /`) are stripped before scanning so
 *     JSDoc `@example` snippets (e.g. the `areas` insert in with-action.ts)
 *     never trip the check.
 *   - `.from()` targets are validated against Tables ∪ Views, because
 *     PostgREST `.from()` legitimately reads from views.
 *   - e2e Playwright suites under `apps/web/e2e/` are out of scope: they run
 *     against a separate test database and intentionally reference tables that
 *     the lean schema tore down (inventory_locations, stock_transfers, …) plus
 *     system catalogs (`pg_trigger as never`). They are not app-runtime
 *     code; their staleness is tracked separately, not by this linter.
 *   - A small documented allowlist covers real DB functions that the Supabase
 *     type generator omits from database.types.ts (SECURITY DEFINER jsonb
 *     RPCs). These are defined in supabase/migrations and called from shipped
 *     code, so they are valid, not drift.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const TYPES_FILE = path.join(
  REPO_ROOT,
  "packages/database/src/types/database.types.ts",
);

/**
 * Real public DB functions that exist in supabase/migrations and are called
 * from shipped code, but which the Supabase type generator does not emit into
 * database.types.ts. Keep this list tight and evidence-backed; each entry is a
 * known false-positive, not a license to drift.
 */
const RPC_ALLOWLIST = new Set([
  // SECURITY DEFINER jsonb print-enqueue RPCs. Defined in
  // supabase/migrations/00000000000000_baseline.sql and referenced by
  // 20260608090000_pos_item_discount_hddt_shift_close.sql; called from
  // apps/web/app/(protected)/br/[branchId]/pos/_lib/messages.ts.
  "enqueue_cancel_ticket_print",
  "enqueue_partial_cancel_ticket_print",
]);

/** Directory names skipped entirely during the file walk. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  ".git",
  "e2e", // Playwright suites — separate test DB, see header note.
]);

const SCAN_ROOTS = ["apps/web", "packages"];
const SCAN_EXTENSIONS = [".ts", ".tsx"];

/* ────────────────────────────────────────────────────────────────────────── */
/*  Parse the source of truth                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Extract the immediate child keys of a `    <Section>: {` block in
 * database.types.ts. Section headers sit at 4-space indent; their entry keys
 * sit at 6-space indent and are followed by `: {`. The block closes at the
 * next 4-space `}`.
 */
function extractSectionKeys(lines, sectionName) {
  const header = `    ${sectionName}: {`;
  const startIdx = lines.indexOf(header);
  if (startIdx < 0) return [];

  const keys = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "    }") break; // end of this section
    const match = line.match(/^ {6}([A-Za-z_][A-Za-z0-9_]*): \{/);
    if (match) keys.push(match[1]);
  }
  return keys;
}

function loadValidNames() {
  if (!fs.existsSync(TYPES_FILE)) {
    console.error(`check-db-drift: types file not found at ${TYPES_FILE}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(TYPES_FILE, "utf8").split("\n");
  const tables = extractSectionKeys(lines, "Tables");
  const views = extractSectionKeys(lines, "Views");
  const functions = extractSectionKeys(lines, "Functions");

  if (tables.length === 0 || functions.length === 0) {
    console.error(
      "check-db-drift: failed to parse Tables/Functions from database.types.ts (got " +
        `${tables.length} tables, ${functions.length} functions). The type ` +
        "file format may have changed.",
    );
    process.exit(1);
  }

  return {
    validFrom: new Set([...tables, ...views]),
    validRpc: new Set([...functions, ...RPC_ALLOWLIST]),
    counts: {
      tables: tables.length,
      views: views.length,
      functions: functions.length,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  File walking + comment stripping                                            */
/* ────────────────────────────────────────────────────────────────────────── */

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

/**
 * Strip line and block comments while preserving the original line count and
 * column positions (replace comment characters with spaces). This keeps
 * reported line numbers accurate and prevents commented-out / JSDoc snippets
 * from being scanned. It is comment-state aware so `//` inside a block comment
 * is handled correctly. String contents are left intact (we only need to avoid
 * scanning comments; a `.from("x")` inside a real string literal is exactly
 * what we want to inspect).
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  // states: code | line-comment | block-comment | string
  let state = "code";
  let stringQuote = "";

  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : "";

    if (state === "code") {
      if (ch === "/" && next === "/") {
        state = "line-comment";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block-comment";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        state = "string";
        stringQuote = ch;
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
      if (ch === "\\") {
        // keep escaped char verbatim
        if (i + 1 < n) {
          out += source[i + 1];
          i += 2;
          continue;
        }
      } else if (ch === stringQuote) {
        state = "code";
        stringQuote = "";
      }
      i += 1;
      continue;
    }

    if (state === "line-comment") {
      if (ch === "\n") {
        state = "code";
        out += ch;
      } else {
        out += " ";
      }
      i += 1;
      continue;
    }

    if (state === "block-comment") {
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

/* ────────────────────────────────────────────────────────────────────────── */
/*  Scan                                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

// `\s*` spans newlines so multiline `.rpc(\n  "name"` forms are caught.
const FROM_RE = /\.from\(\s*(["'`])([A-Za-z_][A-Za-z0-9_]*)\1/g;
const RPC_RE = /\.rpc\(\s*(["'`])([A-Za-z_][A-Za-z0-9_]*)\1/g;

function lineNumberAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

function scan({ validFrom, validRpc }) {
  const failures = [];

  for (const root of SCAN_ROOTS) {
    for (const filePath of walkFiles(root)) {
      if (path.basename(filePath) === "database.types.ts") continue;

      const raw = fs.readFileSync(filePath, "utf8");
      const code = stripComments(raw);
      const rel = path.relative(REPO_ROOT, filePath).split(path.sep).join("/");

      let m;
      FROM_RE.lastIndex = 0;
      while ((m = FROM_RE.exec(code))) {
        const name = m[2];
        if (!validFrom.has(name)) {
          failures.push({
            file: rel,
            line: lineNumberAt(code, m.index),
            kind: "from",
            name,
          });
        }
      }

      RPC_RE.lastIndex = 0;
      while ((m = RPC_RE.exec(code))) {
        const name = m[2];
        if (!validRpc.has(name)) {
          failures.push({
            file: rel,
            line: lineNumberAt(code, m.index),
            kind: "rpc",
            name,
          });
        }
      }
    }
  }

  return failures;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Main                                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

const valid = loadValidNames();
const failures = scan(valid);

if (failures.length > 0) {
  console.error("DB drift check FAILED. App references DB objects the types do not define:");
  for (const f of failures) {
    const what = f.kind === "from" ? "table/view" : "function";
    console.error(`- ${f.file}:${f.line}  .${f.kind}("${f.name}") → unknown ${what}`);
  }
  console.error(
    "\nSource of truth: packages/database/src/types/database.types.ts " +
      `(${valid.counts.tables} tables, ${valid.counts.views} views, ${valid.counts.functions} functions).`,
  );
  console.error(
    "Fix the call site, run `pnpm db:types` if the DB really has the object, " +
      "or add a documented entry to RPC_ALLOWLIST for a known-untyped function.",
  );
  process.exit(1);
}

console.log(
  `DB drift check: OK — all .from()/.rpc() literals resolve against the types ` +
    `(${valid.counts.tables} tables, ${valid.counts.views} views, ${valid.counts.functions} functions; ` +
    `${RPC_ALLOWLIST.size} allowlisted RPCs).`,
);
