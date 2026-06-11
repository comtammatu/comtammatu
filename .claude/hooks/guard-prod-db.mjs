import { readFileSync } from "node:fs";

// PreToolUse guard for Claude Code sessions. Machine enforcement of the
// Environment Registry in docs/agent/rules/database.md — this script is an
// adapter to that rule, not a second source of truth. The refs below MUST
// match the registry table; update both in the same change.
//
// Blocks (exit 2): state-mutating supabase CLI subcommands (the linked
// project is production), direct SQL clients running write SQL against a
// protected ref or any production-pointing connection (env DB URL, supabase
// host, stored pooler URL), and write-capable Supabase MCP tools (any server
// name) targeting a protected ref. Read paths stay open.

const PROTECTED_REFS = {
  iexwsuaqqenyjiskawoj: "PRODUCTION (comtammatu)",
  dyksphedgzqsqjqgxzog: "matu-platform production (separate codebase)",
};

const WRITE_SQL =
  /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|vacuum|reindex|copy|merge|call|refresh\s+materialized)\b/i;

const MUTATING_CLI =
  /\bsupabase\s+(db\s+(push|reset)|migration\s+(up|repair)|link\b|functions\s+deploy|secrets\s+set|config\s+push)/;

const MCP_WRITE_TOOL =
  /^mcp__.+__(apply_migration|execute_sql|deploy_edge_function|pause_project|restore_project|create_branch|merge_branch|reset_branch|rebase_branch|delete_branch)$/;

function block(reason) {
  console.error(
    [
      `[guard-prod-db] BLOCKED: ${reason}`,
      "Environment Registry (docs/agent/rules/database.md): iexwsuaqqenyjiskawoj is PRODUCTION — SELECT-only;",
      "dyksphedgzqsqjqgxzog belongs to a different codebase. No dev/test Supabase target exists;",
      "migrations ship as file → PR → owner applies. If the owner explicitly delegated a prod write",
      "in this session, the owner runs it or temporarily disables this hook in .claude/settings.json.",
    ].join("\n"),
  );
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // Unreadable hook input: do not break the session. The deny rules in
  // .claude/settings.json remain as the second layer.
  process.exit(0);
}

const toolName = String(input.tool_name ?? "");
const toolInput = input.tool_input ?? {};

if (toolName === "Bash") {
  const cmd = String(toolInput.command ?? "");

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
  if (aimsAtProtected && /\b(psql|pg_restore)\b/.test(cmd)) {
    if (WRITE_SQL.test(cmd) || /\s(-f|--file)\b/.test(cmd)) {
      block(
        `psql/pg_restore against ${refHit ? PROTECTED_REFS[refHit] : "a production-pointing connection (env DB URL / supabase host / stored pooler URL)"} with write SQL or a script file (cannot verify read-only)`,
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

  if (action === "execute_sql") {
    const query = String(toolInput.query ?? toolInput.sql ?? "");
    if (WRITE_SQL.test(query)) {
      block(`execute_sql with write SQL against ${label}`);
    }
    process.exit(0); // read-only SQL on a protected ref is allowed (SELECT-only policy)
  }
  block(`${action} against ${label}`);
}

process.exit(0);
