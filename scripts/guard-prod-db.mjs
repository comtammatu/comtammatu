import { readFileSync } from "node:fs";

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
// targeting a protected ref. Preview branch create/delete is explicitly allowed
// because it does not mutate the protected parent; branch merge/reset/rebase is
// still blocked. Read paths stay open.
//
// Known residual gaps (text matching cannot close them; the real fix is
// keeping prod credentials out of the local agent env): SDK writes via
// node/python one-liners, mutating functions invoked through SELECT, raw-IP
// connection strings, keywords split by shell string concatenation.

const PROTECTED_REFS = {
  iexwsuaqqenyjiskawoj: "PRODUCTION (comtammatu)",
  dyksphedgzqsqjqgxzog: "matu-platform production (separate codebase)",
};

const WRITE_SQL =
  /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|vacuum|reindex|copy|merge|call|refresh\s+materialized)\b/i;

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
      "Environment Registry (docs/agent/rules/database.md): iexwsuaqqenyjiskawoj is PRODUCTION — SELECT-only;",
      "dyksphedgzqsqjqgxzog belongs to a different codebase. No dev/test Supabase target exists;",
      "migrations ship as file → PR → owner applies. If the owner explicitly delegated a prod write",
      "in this session, the owner runs it or temporarily disables this hook in the runtime's",
      "hook wiring (.claude/settings.json or .codex/hooks.json).",
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

  // The supabase CLI resolves its target from supabase/config.toml /
  // .temp/project-ref, which point at production — block regardless of
  // whether a ref is visible in the command.
  if (MUTATING_CLI.test(cmd)) {
    block("state-mutating supabase CLI subcommand (linked project is production)");
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
    if (/\bpsql\b/.test(cmd) && (WRITE_SQL.test(stripSqlNoise(cmd)) || /\s(-f|--file)\b/.test(cmd))) {
      block(
        `psql against ${targetLabel} with write SQL or a script file (cannot verify read-only)`,
      );
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

  if (action === "create_branch" || action === "delete_branch") {
    process.exit(0);
  }

  if (action === "execute_sql") {
    const query = String(toolInput.query ?? toolInput.sql ?? "");
    if (WRITE_SQL.test(stripSqlNoise(query))) {
      block(`execute_sql with write SQL against ${label}`);
    }
    process.exit(0); // read-only SQL on a protected ref is allowed (SELECT-only policy)
  }
  block(`${action} against ${label}`);
}

process.exit(0);
