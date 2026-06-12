import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// The prod-DB guard is split across files that must agree:
// docs/agent/rules/database.md owns the Environment Registry (the rule),
// scripts/guard-prod-db.mjs enforces it (protected refs + write-tool regex),
// and each agent runtime's adapter config decides which tool calls reach the
// hook (PreToolUse matchers). This check blocks silent drift between them,
// and replays behavior fixtures so a regex edit that weakens blocking (or
// closes a read path) fails lint immediately.

const REPO_ROOT = process.cwd();
const HOOK_PATH = "scripts/guard-prod-db.mjs";
const REGISTRY_PATH = "docs/agent/rules/database.md";
const ADAPTER_PATHS = [".claude/settings.json", ".codex/hooks.json"];

const errors = [];

function fail(message) {
  errors.push(message);
}

if (!fs.existsSync(path.join(REPO_ROOT, HOOK_PATH))) {
  fail(`${HOOK_PATH} does not exist`);
  for (const message of errors) console.error(`[guard-sync] ${message}`);
  process.exit(1);
}

const hookSource = fs.readFileSync(path.join(REPO_ROOT, HOOK_PATH), "utf8");
const registryDoc = fs.readFileSync(path.join(REPO_ROOT, REGISTRY_PATH), "utf8");

// 1. Protected refs in the hook == refs in the Environment Registry table.
const refsBlock = hookSource.match(/const PROTECTED_REFS = \{([\s\S]*?)\};/);
const hookRefs = refsBlock
  ? [...refsBlock[1].matchAll(/^\s*([a-z0-9]{20}):/gm)].map((m) => m[1])
  : [];
if (hookRefs.length === 0) fail(`${HOOK_PATH}: could not parse PROTECTED_REFS`);

const registrySection = registryDoc.split("## Environment Registry")[1]?.split("\n## ")[0] ?? "";
const tableRefs = [...registrySection.matchAll(/^\|\s*`([a-z0-9]{20})`/gm)].map(
  (m) => m[1],
);
if (tableRefs.length === 0) {
  fail(`${REGISTRY_PATH}: could not parse Environment Registry table refs`);
}

for (const ref of tableRefs) {
  if (!hookRefs.includes(ref)) {
    fail(`Registry ref ${ref} is missing from PROTECTED_REFS in ${HOOK_PATH}`);
  }
}
for (const ref of hookRefs) {
  if (!tableRefs.includes(ref)) {
    fail(`PROTECTED_REFS ref ${ref} is missing from the Environment Registry table in ${REGISTRY_PATH}`);
  }
}

const hookMcpPattern = hookSource.match(/const MCP_WRITE_TOOL =\s*\/(.+)\/;/)?.[1];
if (!hookMcpPattern) fail(`${HOOK_PATH}: could not parse MCP_WRITE_TOOL`);

// 2. Every adapter wires both matchers to the canonical hook, and each
// adapter's MCP matcher == the hook's MCP_WRITE_TOOL regex, so a tool added
// to one side cannot silently skip the other.
for (const adapterPath of ADAPTER_PATHS) {
  if (!fs.existsSync(path.join(REPO_ROOT, adapterPath))) {
    fail(`${adapterPath} does not exist`);
    continue;
  }
  const adapter = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, adapterPath), "utf8"),
  );
  const preToolUse = adapter.hooks?.PreToolUse ?? [];

  const mcpEntry = preToolUse.find((entry) => entry.matcher?.startsWith("^mcp__"));
  if (!mcpEntry) {
    fail(`${adapterPath}: no PreToolUse matcher for mcp__ tools`);
  } else if (hookMcpPattern && mcpEntry.matcher !== hookMcpPattern) {
    fail(
      `MCP matcher drifted:\n  ${adapterPath}: ${mcpEntry.matcher}\n  ${HOOK_PATH}: ${hookMcpPattern}`,
    );
  }

  if (!preToolUse.some((entry) => entry.matcher === "^Bash$")) {
    fail(`${adapterPath}: no PreToolUse matcher for Bash`);
  }
  for (const entry of preToolUse) {
    const commands = (entry.hooks ?? []).map((h) => h.command ?? "");
    if (!commands.some((c) => c.includes(HOOK_PATH))) {
      fail(
        `${adapterPath}: PreToolUse matcher ${entry.matcher} does not run ${HOOK_PATH}`,
      );
    }
  }
}

// 3. Behavior fixtures: replay canonical tool calls through the hook and
// assert exit codes, so blocking cannot silently regress. Fixture strings
// here are file contents — the runtime hooks only scan Bash command lines.
const PROD = "iexwsuaqqenyjiskawoj";
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const mcp = (tool, tool_input) => ({ tool_name: `mcp__supabase__${tool}`, tool_input });
const FIXTURES = [
  ["block: supabase db push", 2, bash("supabase db push")],
  ["block: global flag before subcommand", 2, bash("supabase --debug db push")],
  ["block: line-continuation split", 2, bash("supabase \\\n db push")],
  ["block: psql write SQL vs prod host", 2, bash(`psql postgres://u@db.${PROD}.supabase.co/postgres -c "drop table x"`)],
  ["block: psql script file vs env URL", 2, bash('psql "$DATABASE_URL" -f script.sql')],
  ["block: pg_restore positional dump vs prod", 2, bash(`pg_restore --dbname=postgres://u@db.${PROD}.supabase.co/postgres /tmp/backup.dump`)],
  ["block: curl POST vs prod REST", 2, bash(`curl -X POST https://${PROD}.supabase.co/rest/v1/orders -d '{"a":1}'`)],
  ["block: mcp execute_sql write vs prod", 2, mcp("execute_sql", { project_id: PROD, query: "update orders set note = null" })],
  ["block: mcp apply_migration empty ref fails closed", 2, mcp("apply_migration", {})],
  ["block: mcp create_branch vs prod", 2, mcp("create_branch", { project_id: PROD })],
  ["allow: plain command", 0, bash("ls -la")],
  ["allow: supabase migration list", 0, bash("supabase migration list")],
  ["allow: psql SELECT vs prod host", 0, bash(`psql postgres://u@db.${PROD}.supabase.co/postgres -c "select 1"`)],
  ["allow: curl GET vs prod REST", 0, bash(`curl -s "https://${PROD}.supabase.co/rest/v1/orders?select=id" -H "apikey: $KEY"`)],
  ["allow: mcp execute_sql SELECT vs prod", 0, mcp("execute_sql", { project_id: PROD, query: "with t as (select 1) select * from t" })],
  ["allow: mcp write vs unknown ref", 0, mcp("apply_migration", { project_id: "abcdefabcdefabcdefab" })],
  ["allow: unreadable stdin fails open", 0, "not-json"],
];
for (const [desc, want, payload] of FIXTURES) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const run = spawnSync("node", [path.join(REPO_ROOT, HOOK_PATH)], {
    input,
    encoding: "utf8",
  });
  if (run.status !== want) {
    fail(`fixture "${desc}": expected exit ${want}, got ${run.status}`);
  }
  if (run.status === 2 && !run.stderr.trim()) {
    fail(`fixture "${desc}": blocked without a stderr reason (Codex treats exit 2 with empty stderr as non-blocking)`);
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`[guard-sync] ${message}`);
  process.exit(1);
}

console.log(
  `[guard-sync] hook, ${ADAPTER_PATHS.length} adapter configs, Environment Registry, and ${FIXTURES.length} behavior fixtures in sync (${hookRefs.length} protected refs)`,
);
