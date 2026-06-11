import fs from "node:fs";
import path from "node:path";

// The prod-DB guard is split across three files that must agree:
// docs/agent/rules/database.md owns the Environment Registry (the rule),
// .claude/hooks/guard-prod-db.mjs enforces it (protected refs + write-tool
// regex), and .claude/settings.json decides which tool calls reach the hook
// (PreToolUse matchers). This check blocks silent drift between them.

const REPO_ROOT = process.cwd();
const HOOK_PATH = ".claude/hooks/guard-prod-db.mjs";
const SETTINGS_PATH = ".claude/settings.json";
const REGISTRY_PATH = "docs/agent/rules/database.md";

const errors = [];

function fail(message) {
  errors.push(message);
}

const hookSource = fs.readFileSync(path.join(REPO_ROOT, HOOK_PATH), "utf8");
const settings = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, SETTINGS_PATH), "utf8"),
);
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

// 2. The settings.json MCP matcher == the hook's MCP_WRITE_TOOL regex, so a
// tool added to one side cannot silently skip the other.
const hookMcpPattern = hookSource.match(/const MCP_WRITE_TOOL =\s*\/(.+)\/;/)?.[1];
if (!hookMcpPattern) fail(`${HOOK_PATH}: could not parse MCP_WRITE_TOOL`);

const preToolUse = settings.hooks?.PreToolUse ?? [];
const mcpEntry = preToolUse.find((entry) => entry.matcher?.startsWith("^mcp__"));
if (!mcpEntry) {
  fail(`${SETTINGS_PATH}: no PreToolUse matcher for mcp__ tools`);
} else if (hookMcpPattern && mcpEntry.matcher !== hookMcpPattern) {
  fail(
    `MCP matcher drifted:\n  ${SETTINGS_PATH}: ${mcpEntry.matcher}\n  ${HOOK_PATH}:      ${hookMcpPattern}`,
  );
}

// 3. Every PreToolUse entry actually runs the guard hook, a Bash matcher
// exists, and the hook file is present on disk.
if (!fs.existsSync(path.join(REPO_ROOT, HOOK_PATH))) {
  fail(`${HOOK_PATH} does not exist`);
}
if (!preToolUse.some((entry) => entry.matcher === "^Bash$")) {
  fail(`${SETTINGS_PATH}: no PreToolUse matcher for Bash`);
}
for (const entry of preToolUse) {
  const commands = (entry.hooks ?? []).map((h) => h.command ?? "");
  if (!commands.some((c) => c.includes(HOOK_PATH))) {
    fail(
      `${SETTINGS_PATH}: PreToolUse matcher ${entry.matcher} does not run ${HOOK_PATH}`,
    );
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`[guard-sync] ${message}`);
  process.exit(1);
}

console.log(
  `[guard-sync] hook, settings matchers, and Environment Registry in sync (${hookRefs.length} protected refs)`,
);
