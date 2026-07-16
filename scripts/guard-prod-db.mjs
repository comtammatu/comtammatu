import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// PreToolUse guard for agent sessions. Machine enforcement of the
// Environment Registry in docs/agent/rules/database.md — this script is an
// adapter to that rule, not a second source of truth. The refs below MUST
// match the registry table; update both in the same change.
//
// One canonical copy, wired per runtime: .claude/settings.json (Claude Code)
// and .codex/hooks.json (Codex) both run this file. scripts/check-guard-sync.mjs
// keeps the registry, this script, and every adapter's matchers in sync, and
// replays behavior fixtures so regex edits cannot silently weaken blocking.
//
// Blocks (exit 2): state-mutating supabase CLI subcommands (the linked
// project is production), psql running write SQL or script files against a
// protected ref or any production-pointing connection (env DB URL, supabase
// host, stored pooler URL), pg_restore toward a protected target (restore is
// a write by definition), HTTP clients sending write methods/bodies to a
// protected target, and write-capable Supabase MCP tools (any server name)
// targeting a protected ref. Preview branch delete is allowed for cleanup;
// creation is allowed only when supabase/migration-lineage.json proves the
// repository baseline and production ledger are aligned. Branch
// merge/reset/rebase remains blocked. Read paths stay open.
//
// Known residual gaps (text matching cannot close them; the real fix is
// keeping prod credentials out of the local agent env): SDK writes via
// node/python one-liners, raw-IP connection strings, and keywords split by
// shell string concatenation.

const PROTECTED_REFS = {
  iexwsuaqqenyjiskawoj: "PRODUCTION (comtammatu)",
  dyksphedgzqsqjqgxzog: "matu-platform production (separate codebase)",
};

const LINEAGE_MANIFEST = new URL(
  "../supabase/migration-lineage.json",
  import.meta.url,
);

function nativePreviewBranchingEnabled() {
  try {
    const lineage = JSON.parse(readFileSync(LINEAGE_MANIFEST, "utf8"));
    const manifestAllows =
      lineage.state === "aligned" &&
      lineage.nativePreviewBranching === "enabled" &&
      lineage.productionCutoff === lineage.baselineVersion;
    if (!manifestAllows) return false;

    const check = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("./check-migration-lineage.mjs", import.meta.url),
        ),
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        stdio: "ignore",
      },
    );
    return check.status === 0;
  } catch {
    return false;
  }
}

// `do` / `perform` close the live bypass where a DO $$ … PERFORM rpc() $$
// block mutated prod while a bare UPDATE was correctly blocked. `call` was
// already covered. Bare SELECT of a mutating function remains a residual gap.
const WRITE_SQL =
  /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|vacuum|reindex|copy|merge|call|do|perform|refresh\s+materialized)\b/i;

// Production execute_sql is for table/view/catalog reads only. Allow a small
// set of built-in read helpers; block every other function call because a
// SELECT can invoke a VOLATILE function and mutate state.
const SAFE_READ_FUNCTIONS = new Set([
  "array_agg",
  "avg",
  "coalesce",
  "count",
  "greatest",
  "json_agg",
  "jsonb_agg",
  "jsonb_build_array",
  "jsonb_build_object",
  "least",
  "max",
  "min",
  "nullif",
  "pg_get_functiondef",
  "pg_get_viewdef",
  "sum",
  "to_regclass",
  "to_regprocedure",
]);
const SQL_PAREN_KEYWORDS = new Set([
  "as",
  "exists",
  "filter",
  "in",
  "over",
  "select",
  "values",
]);

function unsafeSqlFunction(sql) {
  for (const match of stripSqlNoise(sql).matchAll(
    /\b(?:(?:"([^"]+)"|([a-z_][\w$]*))\s*\.\s*)?(?:"([^"]+)"|([a-z_][\w$]*))\s*\(/gi,
  )) {
    const schema = (match[1] ?? match[2])?.toLowerCase();
    const name = (match[3] ?? match[4])?.toLowerCase();
    const quotedName = match[3] !== undefined;
    if (!name || SQL_PAREN_KEYWORDS.has(name)) continue;
    if (schema && schema !== "pg_catalog") return `${schema}.${name}`;
    if (quotedName && schema !== "pg_catalog") return name;
    if (!SAFE_READ_FUNCTIONS.has(name)) return name;
  }
  return null;
}

// WRITE_SQL runs after string literals and comments are stripped, so a write
// keyword inside a quoted value (e.g. `select ... where note = 'do not delete'`)
// is not mistaken for a real write. Dollar-quoted bodies are deliberately NOT
// stripped — a `do $$ ... update ... $$` block is a real write and must match.
function stripSqlNoise(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, " ") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/'(?:[^']|'')*'/g, "''"); // single-quoted string literals
}

// Tolerates global flags between "supabase" and the subcommand
// (e.g. `supabase --debug db push`); line continuations are folded first.
const MUTATING_CLI =
  /\bsupabase(?:\s+-{1,2}[\w-]+(?:[= ]\S+)?)*\s+(db\s+(?:push|reset)|migration\s+(?:up|repair)|link\b|functions\s+deploy|secrets\s+set|config\s+push)/;
const PREVIEW_CREATE_CLI =
  /\bsupabase(?:\s+-{1,2}[\w-]+(?:[= ]\S+)?)*\s+branches\s+create\b/;

const HTTP_CLIENT = /\b(curl|wget|httpie|xh)\b/;
const HTTP_WRITE =
  /(-X|--request|--method)[= ]?\s*(POST|PUT|PATCH|DELETE)\b|--(data|data-raw|data-binary|data-urlencode|json|form|form-string|upload-file|post-data|post-file|body-data|body-file)\b|\s-(d|F|T)\s/i;

// The final separator accepts direct MCP names (`mcp__supabase__execute_sql`)
// and connector-wrapped names (`mcp__codex_apps__supabase._execute_sql`).
const MCP_WRITE_TOOL =
  /^mcp__.+?(?:__|[._]+)(apply_migration|execute_sql|deploy_edge_function|pause_project|restore_project|create_branch|delete_branch|merge_branch|reset_branch|rebase_branch)$/;

function block(reason) {
  console.error(
    [
      `[guard-prod-db] BLOCKED: ${reason}`,
      "Environment Registry (docs/agent/rules/database.md): iexwsuaqqenyjiskawoj is PRODUCTION — guarded table/view/catalog reads only;",
      "dyksphedgzqsqjqgxzog belongs to a different codebase. No dev/test Supabase target exists;",
      "migrations ship as file → PR → owner applies. If the owner explicitly delegated a prod write",
      "in this session, the owner applies it outside the guarded runtime or provides a scoped",
      "approval path. Never disable this hook or its runtime wiring.",
    ].join("\n"),
  );
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // Unreadable hook input: do not break the session. The runtime's static
  // permission deny rules remain as the second layer.
  process.exit(0);
}

const toolName = String(input.tool_name ?? "");
const toolInput = input.tool_input ?? {};

if (toolName === "Bash") {
  const cmd = String(toolInput.command ?? "").replace(/\\\r?\n/g, " ");

  if (PREVIEW_CREATE_CLI.test(cmd) && !nativePreviewBranchingEnabled()) {
    block(
      "native Preview branch creation while migration lineage is blocked pending re-baseline",
    );
  }

  // The supabase CLI resolves its target from supabase/config.toml /
  // .temp/project-ref, which point at production — block regardless of
  // whether a ref is visible in the command.
  if (MUTATING_CLI.test(cmd)) {
    block(
      "state-mutating supabase CLI subcommand (linked project is production)",
    );
  }

  const refHit = Object.keys(PROTECTED_REFS).find((ref) => cmd.includes(ref));
  // No dev/test project exists, so env-style DB URLs and supabase hosts can
  // only resolve to production — treat URL indirection as protected too.
  const aimsAtProtected =
    refHit ||
    cmd.includes("pooler-url") ||
    /\bsupabase\.(?:co|com)\b/i.test(cmd) ||
    /\$\{?\w*(?:DATABASE|POSTGRES|POOLER|SUPABASE|DB)\w*_?URL\w*/i.test(cmd);
  const targetLabel = refHit
    ? PROTECTED_REFS[refHit]
    : "a production-pointing connection (env DB URL / supabase host / stored pooler URL)";

  if (aimsAtProtected) {
    if (/\bpg_restore\b/.test(cmd)) {
      block(`pg_restore against ${targetLabel} (restore is always a write)`);
    }
    if (
      /\bpsql\b/.test(cmd) &&
      (WRITE_SQL.test(stripSqlNoise(cmd)) || /\s(-f|--file)\b/.test(cmd))
    ) {
      block(
        `psql against ${targetLabel} with write SQL or a script file (cannot verify read-only)`,
      );
    }
    if (/\bpsql\b/.test(cmd)) {
      const unsafeFunction = unsafeSqlFunction(cmd);
      if (unsafeFunction) {
        block(
          `psql calling non-whitelisted function ${unsafeFunction}() against ${targetLabel}`,
        );
      }
    }
    if (HTTP_CLIENT.test(cmd) && HTTP_WRITE.test(cmd)) {
      block(
        `HTTP write (POST/PUT/PATCH/DELETE or request body) toward ${targetLabel}`,
      );
    }
  }
  process.exit(0);
}

const mcpMatch = toolName.match(MCP_WRITE_TOOL);
if (mcpMatch) {
  const action = mcpMatch[1];
  const projectId = String(toolInput.project_id ?? toolInput.ref ?? "");
  // Empty project_id means a project-scoped server; the repo's .mcp.json one
  // is bound to production, so fail closed.
  const target = projectId === "" ? "iexwsuaqqenyjiskawoj" : projectId;
  const label = PROTECTED_REFS[target];
  if (!label) process.exit(0); // unknown ref (e.g. a future dev project) — allowed

  if (action === "delete_branch") {
    process.exit(0);
  }
  if (action === "create_branch") {
    if (nativePreviewBranchingEnabled()) process.exit(0);
    block(
      "native Preview branch creation while migration lineage is blocked pending re-baseline",
    );
  }

  if (action === "execute_sql") {
    const query = String(toolInput.query ?? toolInput.sql ?? "");
    if (WRITE_SQL.test(stripSqlNoise(query))) {
      block(`execute_sql with write SQL against ${label}`);
    }
    const unsafeFunction = unsafeSqlFunction(query);
    if (unsafeFunction) {
      block(
        `execute_sql calling non-whitelisted function ${unsafeFunction}() against ${label}`,
      );
    }
    process.exit(0); // guarded table/view/catalog reads on a protected ref are allowed
  }
  block(`${action} against ${label}`);
}

process.exit(0);
