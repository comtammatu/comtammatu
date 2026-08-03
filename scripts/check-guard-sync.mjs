import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The prod-DB guard is split across files that must agree:
// docs/agent/rules/database.md owns the Environment Registry (the rule),
// scripts/guard-prod-db.mjs enforces it (protected refs + guarded-tool regex),
// .codex/config.toml owns the pinned direct MCP target/read-only transport,
// and each agent runtime's adapter config decides which tool calls reach the
// hook (PreToolUse matchers). This check blocks silent drift between them,
// and replays behavior fixtures so a regex edit that weakens blocking (or
// closes a read path) fails lint immediately.

const REPO_ROOT = process.cwd();
const HOOK_PATH = "scripts/guard-prod-db.mjs";
const REGISTRY_PATH = "docs/agent/rules/database.md";
const CODEX_CONFIG_PATH = ".codex/config.toml";
const ADAPTER_PATHS = [".claude/settings.json", ".codex/hooks.json"];
const TYPEGEN_PATH = "scripts/gen-types.mjs";
const E2E_BRINGUP_PATH = "scripts/supabase-e2e-bringup.mjs";
const PRODUCTION_PUSH_PATH = "scripts/supabase-production-push.mjs";
const VERCEL_ENV_GUARD_PATH = "scripts/check-preview-supabase-env.mjs";

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
const registryDoc = fs.readFileSync(
  path.join(REPO_ROOT, REGISTRY_PATH),
  "utf8",
);

if (/temporar(?:y|ily) disable/i.test(hookSource)) {
  fail(
    `${HOOK_PATH}: blocked-operation guidance must never recommend disabling the guard`,
  );
}

// 1. Protected refs in the hook == refs in the Environment Registry table.
const refsBlock = hookSource.match(/const PROTECTED_REFS = \{([\s\S]*?)\};/);
const hookRefs = refsBlock
  ? [...refsBlock[1].matchAll(/^\s*([a-z0-9]{20}):/gm)].map((m) => m[1])
  : [];
if (hookRefs.length === 0) fail(`${HOOK_PATH}: could not parse PROTECTED_REFS`);

const registrySection =
  registryDoc.split("## Environment Registry")[1]?.split("\n## ")[0] ?? "";
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
    fail(
      `PROTECTED_REFS ref ${ref} is missing from the Environment Registry table in ${REGISTRY_PATH}`,
    );
  }
}

if (hookSource.includes("APPROVED_NON_PROD_REFS")) {
  fail(`${HOOK_PATH}: broad non-production allowlist must not return`);
}

const documentedProductionRefs = [
  ...registrySection.matchAll(
    /^\|\s*`([a-z0-9]{20})`\s*\|\s*\*\*PRODUCTION\*\*/gm,
  ),
].map((match) => match[1]);
const registeredWriteBlock = hookSource.match(
  /const REGISTERED_WRITE_REFS = new Set\(\[([\s\S]*?)\]\);/,
);
const hookRegisteredWriteRefs = registeredWriteBlock
  ? [...registeredWriteBlock[1].matchAll(/"([a-z0-9]{20})"/g)].map(
      (match) => match[1],
    )
  : [];
if (
  documentedProductionRefs.length !== 1 ||
  documentedProductionRefs.length !== hookRegisteredWriteRefs.length ||
  documentedProductionRefs.some(
    (ref) => !hookRegisteredWriteRefs.includes(ref),
  )
) {
  fail(
    `${HOOK_PATH}: REGISTERED_WRITE_REFS must exactly match the Environment Registry Production row.`,
  );
}

const documentedProdRef = registrySection.match(
  /^\|\s*`([a-z0-9]{20})`\s*\|\s*\*\*PRODUCTION\*\*/m,
)?.[1];
if (!documentedProdRef) {
  fail(`${REGISTRY_PATH}: could not parse the comtammatu Production ref`);
}
const hookPreviewParentRef = hookSource.match(
  /const APPROVED_PREVIEW_PARENT_REF = "([a-z0-9]{20})";/,
)?.[1];
if (hookPreviewParentRef !== documentedProdRef) {
  fail(
    `${HOOK_PATH}: APPROVED_PREVIEW_PARENT_REF must equal the documented Production ref`,
  );
}
const documentedVercelCandidate = registrySection.match(
  /^\|\s*`(prj_[A-Za-z0-9]+)`\s*\|\s*`comtammatu`\s*\|\s*`([a-z0-9]{20})`\s*\|\s*Sole allowed Production deploy target\.\s*\|$/m,
);
const documentedVercelProjectId = documentedVercelCandidate?.[1];
const documentedVercelSupabaseRef = documentedVercelCandidate?.[2];
if (
  !documentedVercelProjectId ||
  documentedVercelSupabaseRef !== documentedProductionRefs[0]
) {
  fail(
    `${REGISTRY_PATH}: Vercel Production must bind one project ID to the registered Production ref`,
  );
}
if (!fs.existsSync(path.join(REPO_ROOT, CODEX_CONFIG_PATH))) {
  fail(`${CODEX_CONFIG_PATH} does not exist`);
} else {
  const codexConfig = fs.readFileSync(
    path.join(REPO_ROOT, CODEX_CONFIG_PATH),
    "utf8",
  );
  const sectionHeaders = [
    ...codexConfig.matchAll(/^\[mcp_servers\.supabase\]\s*$/gm),
  ];
  const sectionHeader = sectionHeaders[0];
  const section =
    sectionHeaders.length !== 1 || sectionHeader?.index === undefined
      ? ""
      : codexConfig
          .slice(sectionHeader.index + sectionHeader[0].length)
          .split(/^\[/m)[0];
  const urlValues = [
    ...section.matchAll(/^url\s*=\s*"([^"\r\n]+)"\s*$/gm),
  ].map((match) => match[1]);
  let validBinding = false;
  if (urlValues.length === 1) {
    try {
      const url = new URL(urlValues[0]);
      validBinding =
        url.protocol === "https:" &&
        url.hostname === "mcp.supabase.com" &&
        url.pathname === "/mcp" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.searchParams.getAll("project_ref").length === 1 &&
        url.searchParams.get("project_ref") === documentedProdRef &&
        url.searchParams.getAll("read_only").length === 1 &&
        url.searchParams.get("read_only") === "true";
    } catch {
      validBinding = false;
    }
  }
  if (!validBinding) {
    fail(
      `${CODEX_CONFIG_PATH}: Supabase MCP must bind exactly once to Production ${documentedProdRef ?? "<unknown>"} with read_only=true`,
    );
  }
}
if (
  !/const pinnedCodexProjectTool\s*=[\s\S]{0,240}codexSupabaseBindingVerified\(\)/.test(
    hookSource,
  )
) {
  fail(
    `${HOOK_PATH}: direct project-less Supabase MCP calls must verify ${CODEX_CONFIG_PATH} at runtime`,
  );
}

const hookMcpPattern = hookSource.match(
  /const MCP_GUARDED_TOOL =\s*\/(.+)\/;/,
)?.[1];
if (!hookMcpPattern) fail(`${HOOK_PATH}: could not parse MCP_GUARDED_TOOL`);
const REQUIRED_MCP_WRITE_ACTIONS = [
  "apply_migration",
  "create_branch",
  "create_project",
  "delete_branch",
  "deploy_edge_function",
  "execute_sql",
  "merge_branch",
  "pause_project",
  "rebase_branch",
  "reset_branch",
  "restore_project",
  "update_storage_config",
];
const REQUIRED_MCP_PROJECT_READ_ACTIONS = [
  "generate_typescript_types",
  "get_advisors",
  "get_edge_function",
  "get_logs",
  "get_project",
  "get_project_url",
  "get_publishable_keys",
  "list_branches",
  "list_edge_functions",
  "list_extensions",
  "list_migrations",
  "list_tables",
];
if (hookMcpPattern) {
  const hookMcpRegex = new RegExp(hookMcpPattern);
  for (const action of [
    ...REQUIRED_MCP_WRITE_ACTIONS,
    ...REQUIRED_MCP_PROJECT_READ_ACTIONS,
  ]) {
    if (!hookMcpRegex.test(`mcp__supabase__${action}`)) {
      fail(`${HOOK_PATH}: MCP_GUARDED_TOOL does not cover ${action}`);
    }
    if (!hookMcpRegex.test(`mcp__codex_apps__supabase_${action}`)) {
      fail(`${HOOK_PATH}: MCP_GUARDED_TOOL misses connector action ${action}`);
    }
  }
  if (hookMcpRegex.test("mcp__github__get_project")) {
    fail(`${HOOK_PATH}: MCP_GUARDED_TOOL captures a non-Supabase MCP tool`);
  }
  if (!hookMcpRegex.test("mcp__supabase__future_mutation")) {
    fail(`${HOOK_PATH}: MCP_GUARDED_TOOL must catch future Supabase actions`);
  }
}

// 2. Every adapter wires both matchers to the canonical hook, and each
// adapter's MCP matcher == the hook's MCP_GUARDED_TOOL regex, so a tool added
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

  const mcpEntry = preToolUse.find((entry) =>
    entry.matcher?.startsWith("^mcp__"),
  );
  if (!mcpEntry) {
    fail(`${adapterPath}: no PreToolUse matcher for guarded Supabase MCP tools`);
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

  if (adapterPath === ".claude/settings.json") {
    const conflictingDenials = new Set([
      "Bash(supabase db push:*)",
      "mcp__supabase__apply_migration",
      "mcp__supabase__deploy_edge_function",
    ]);
    const denied = adapter.permissions?.deny ?? [];
    for (const denial of denied) {
      if (conflictingDenials.has(denial)) {
        fail(
          `${adapterPath}: deny ${denial} bypasses the canonical guard's non-production path`,
        );
      }
    }
  }
}

// 3. Scripted database entrypoints must enforce the same non-production and
// CI-only boundaries because child CLI calls do not traverse interactive hooks.
const typegenPath = path.join(REPO_ROOT, TYPEGEN_PATH);
if (!fs.existsSync(typegenPath)) {
  fail(`${TYPEGEN_PATH} does not exist`);
} else {
  const typegenSource = fs.readFileSync(typegenPath, "utf8");
  if (
    !typegenSource.includes(
      `const TYPE_SOURCE_PROJECT_ID = "${documentedProductionRefs[0]}";`,
    ) ||
    typegenSource.includes(".env.local") ||
    !typegenSource.includes("requestedProjectId !== TYPE_SOURCE_PROJECT_ID")
  ) {
    fail(
      `${TYPEGEN_PATH}: typegen must bind only to registered Production without .env.local or stored-link fallback`,
    );
  }
  const rejectedTarget = spawnSync("node", [typegenPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, SUPABASE_PROJECT_ID: "abcdefghijklmnopqrst" },
    encoding: "utf8",
  });
  if (rejectedTarget.status === 0) {
    fail(`${TYPEGEN_PATH}: must reject any non-Production type source`);
  }
  const missingTarget = spawnSync("node", [typegenPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, SUPABASE_PROJECT_ID: "" },
    encoding: "utf8",
  });
  if (missingTarget.status === 0) {
    fail(`${TYPEGEN_PATH}: must require an explicit Production type source`);
  }
}

const e2eBringupPath = path.join(REPO_ROOT, E2E_BRINGUP_PATH);
if (!fs.existsSync(e2eBringupPath)) {
  fail(`${E2E_BRINGUP_PATH} does not exist`);
} else {
  const e2eSource = fs.readFileSync(e2eBringupPath, "utf8");
  if (
    !e2eSource.includes('process.env["GITHUB_ACTIONS"] !== "true"') ||
    !/appendFileSync\(\s*GITHUB_ENV/.test(e2eSource) ||
    e2eSource.includes('resolve(REPO, ".env.local")') ||
    e2eSource.includes('resolve(REPO, "apps/web/.env.local")')
  ) {
    fail(
      `${E2E_BRINGUP_PATH}: must be GitHub-CI-only and never write repository .env.local files`,
    );
  }
  const rejectedWorkstation = spawnSync("node", [e2eBringupPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, CI: "", GITHUB_ACTIONS: "", GITHUB_ENV: "" },
    encoding: "utf8",
  });
  if (rejectedWorkstation.status === 0) {
    fail(`${E2E_BRINGUP_PATH}: must reject a non-CI invocation before local stack setup`);
  }
}

const productionPushPath = path.join(REPO_ROOT, PRODUCTION_PUSH_PATH);
if (!fs.existsSync(productionPushPath)) {
  fail(`${PRODUCTION_PUSH_PATH} does not exist`);
} else {
  const productionPushSource = fs.readFileSync(productionPushPath, "utf8");
  if (
    !productionPushSource.includes(
      `const PRODUCTION_PROJECT_REF = "${documentedProductionRefs[0]}";`,
    ) ||
    !productionPushSource.includes('env["SUPABASE_DB_URL"]') ||
    !productionPushSource.includes('"--db-url"') ||
    !productionPushSource.includes("url.href")
  ) {
    fail(
      `${PRODUCTION_PUSH_PATH}: must bind the full secret URL only to the registered Production ref`,
    );
  }
  const selfTest = spawnSync("node", [productionPushPath, "--self-test"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (selfTest.status !== 0) {
    fail(`${PRODUCTION_PUSH_PATH}: self-test failed`);
  }
}

const vercelEnvGuardPath = path.join(REPO_ROOT, VERCEL_ENV_GUARD_PATH);
if (!fs.existsSync(vercelEnvGuardPath)) {
  fail(`${VERCEL_ENV_GUARD_PATH} does not exist`);
} else {
  const vercelEnvGuardSource = fs.readFileSync(vercelEnvGuardPath, "utf8");
  if (
    !vercelEnvGuardSource.includes(
      `const PRODUCTION_VERCEL_PROJECT_ID = "${documentedVercelProjectId}";`,
    ) ||
    !vercelEnvGuardSource.includes(
      `const PRODUCTION_SUPABASE_REF = "${documentedVercelSupabaseRef}";`,
    )
  ) {
    fail(
      `${VERCEL_ENV_GUARD_PATH}: Production target must match the Vercel Deployment Registry`,
    );
  }
  const selfTest = spawnSync("node", [vercelEnvGuardPath, "--self-test"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (selfTest.status !== 0) {
    fail(`${VERCEL_ENV_GUARD_PATH}: self-test failed`);
  }
}

// 4. Behavior fixtures: replay canonical tool calls through the hook and
// assert exit codes, so blocking cannot silently regress. Fixture strings
// here are file contents — the runtime hooks only scan Bash command lines.
const PROD = documentedProdRef ?? "enloyfnuerqgaqderbwb";
const UNREGISTERED_REF = "abcdefghijklmnopqrst";
const TRUSTED_PREVIEW = "prvwabcdefghijklmnop";
const WRONG_PARENT_PREVIEW = "wrngabcdefghijklmnop";
const MISMATCHED_PREVIEW = "mismabcdefghijklmnop";
const previewCreateStatus = 0;
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const mcp = (tool, tool_input) => ({
  tool_name: `mcp__supabase__${tool}`,
  tool_input,
});
// Connector-wrapped shape some runtimes expose (e.g. Codex Apps): the supabase
// tool surfaces as `mcp__codex_apps__supabase._execute_sql` (dot + underscore
// separator), not the direct `mcp__supabase__execute_sql`.
const mcpConnector = (tool, tool_input) => ({
  tool_name: `mcp__codex_apps__supabase._${tool}`,
  tool_input,
});
const mcpConnectorLive = (tool, tool_input) => ({
  tool_name: `mcp__codex_apps__supabase_${tool}`,
  tool_input,
});
const previewFixtureDir = fs.mkdtempSync(
  path.join(tmpdir(), "comtammatu-preview-guard-"),
);
const previewFixtureBranches = {
  [TRUSTED_PREVIEW]: {
    id: "preview-branch-id",
    project_ref: TRUSTED_PREVIEW,
    parent_project_ref: PROD,
  },
  [WRONG_PARENT_PREVIEW]: {
    id: "wrong-parent-branch-id",
    project_ref: WRONG_PARENT_PREVIEW,
    parent_project_ref: UNREGISTERED_REF,
  },
  [MISMATCHED_PREVIEW]: {
    id: "mismatched-branch-id",
    project_ref: TRUSTED_PREVIEW,
    parent_project_ref: PROD,
  },
};
fs.writeFileSync(
  path.join(previewFixtureDir, "supabase"),
  `#!/usr/bin/env node
const branches = ${JSON.stringify(previewFixtureBranches)};
const args = process.argv.slice(2);
const branch =
  args[0] === "branches" &&
  args[1] === "list" &&
  args[2] === "--project-ref" &&
  args[3] === ${JSON.stringify(PROD)} &&
  args[4] === "--output" &&
  args[5] === "json"
    ? Object.values(branches)
    : null;
if (!branch) process.exit(1);
process.stdout.write(JSON.stringify(branch));
`,
  { mode: 0o700 },
);
const FIXTURES = [
  ["block: supabase db push", 2, bash("supabase db push")],
  ["block: actual supabase link", 2, bash("supabase link")],
  ["block: sudo cannot bypass Supabase CLI guard", 2, bash("sudo supabase link")],
  [
    "block: nohup cannot bypass Supabase CLI guard",
    2,
    bash("nohup supabase link"),
  ],
  [
    "block: timeout cannot bypass Supabase CLI guard",
    2,
    bash("timeout 5 supabase link"),
  ],
  [
    "block: npm exec cannot bypass Supabase CLI guard",
    2,
    bash("npm exec -- supabase link"),
  ],
  [
    "block: npx shell call cannot hide Supabase CLI",
    2,
    bash("npx --call='supabase link'"),
  ],
  [
    "block: exec argv-name option cannot hide Supabase CLI",
    2,
    bash("exec -a harmless supabase link"),
  ],
  [
    "allow: quoted repository search text is not a Supabase executable",
    0,
    bash('rg -n "foo|supabase link|bar" AGENTS.md docs tasks scripts'),
  ],
  [
    "allow: quoted shell composition text is not an executable",
    0,
    bash('rg -n "bash -c supabase link" AGENTS.md docs tasks scripts'),
  ],
  [
    "allow: unquoted repository search argument is not a Supabase executable",
    0,
    bash("rg -n supabase docs"),
  ],
  [
    "allow: echo argument is not a Supabase executable",
    0,
    bash("echo supabase link"),
  ],
  [
    "block: version-qualified Supabase CLI cannot bypass guard",
    2,
    bash(
      `npx --yes supabase@latest db push --db-url postgres://u@db.${PROD}.supabase.co/postgres`,
    ),
  ],
  [
    "block: pnpm dlx version-qualified Supabase CLI cannot bypass guard",
    2,
    bash(
      `pnpm dlx supabase@2.33.9 db push --db-url postgres://u@db.${PROD}.supabase.co/postgres`,
    ),
  ],
  ["allow: supabase db push help", 0, bash("supabase db push --help")],
  [
    "allow: verified Preview API key read",
    0,
    bash(
      `supabase projects api-keys --project-ref ${TRUSTED_PREVIEW} --reveal --output json`,
    ),
  ],
  [
    "block: Production API key read",
    2,
    bash(
      `supabase projects api-keys --project-ref ${PROD} --reveal --output json`,
    ),
  ],
  [
    "block: help token cannot impersonate a preceding option value",
    2,
    bash("supabase db push --password --help"),
  ],
  [
    "block: supabase db push with an unregistered URL",
    2,
    bash(
      `supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres`,
    ),
  ],
  [
    "allow: supabase db push with explicit verified Preview URL",
    0,
    bash(
      `supabase db push --db-url postgres://u@db.${TRUSTED_PREVIEW}.supabase.co/postgres`,
    ),
  ],
  [
    "allow: supabase db push with explicit registered Production URL",
    0,
    bash(
      `supabase db push --db-url postgres://u@db.${PROD}.supabase.co/postgres`,
    ),
  ],
  [
    "block: raw Session Pooler command cannot bypass the Production wrapper",
    2,
    bash(
      `supabase db push --db-url postgres://postgres.${PROD}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ),
  ],
  [
    "allow: supabase db push with an environment password and literal Preview URL",
    0,
    bash(
      `supabase db push --db-url postgres://u@db.${TRUSTED_PREVIEW}.supabase.co/postgres --password "$SUPABASE_DB_PASSWORD"`,
    ),
  ],
  [
    "allow: dotenv-loaded password with literal Preview URL",
    0,
    bash(
      `corepack pnpm exec dotenv -e .env.local -- supabase db push --db-url postgres://u@db.${TRUSTED_PREVIEW}.supabase.co/postgres --password "$SUPABASE_DB_PASSWORD"`,
    ),
  ],
  [
    "block: supabase db push with an unresolved db-url",
    2,
    bash('supabase db push --db-url "$SUPABASE_DB_URL"'),
  ],
  [
    "block: dotenv-loaded password cannot hide an unresolved db-url",
    2,
    bash(
      'corepack pnpm exec dotenv -e .env.local -- supabase db push --db-url "$SUPABASE_DB_URL" --password "$SUPABASE_DB_PASSWORD"',
    ),
  ],
  [
    "block: Preview ref in comment cannot approve db push",
    2,
    bash(`supabase db push # ${UNREGISTERED_REF}`),
  ],
  [
    "block: Preview db-url in comment cannot approve db push",
    2,
    bash(
      `supabase db push # --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres`,
    ),
  ],
  [
    "block: later command Preview db-url cannot approve db push",
    2,
    bash(
      `supabase db push && echo --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres`,
    ),
  ],
  [
    "block: command substitution cannot approve db push",
    2,
    bash(
      `supabase db push $(echo --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres)`,
    ),
  ],
  [
    "block: parenthesized shell group cannot hide db push",
    2,
    bash(
      `(supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres)`,
    ),
  ],
  [
    "block: parenthesized shell group cannot hide protected psql write",
    2,
    bash(
      `(psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "update orders set note = null")`,
    ),
  ],
  [
    "block: nested shell cannot approve chained db pushes",
    2,
    bash(
      `bash -c 'supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres && supabase db push'`,
    ),
  ],
  [
    "block: env split-string cannot hide Supabase CLI",
    2,
    bash(
      `env -S 'supabase db push --db-url postgres://u@db.${PROD}.supabase.co/postgres'`,
    ),
  ],
  [
    "block: quoted env split-string option cannot hide psql",
    2,
    bash(
      `env '-S' 'psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "drop table x"'`,
    ),
  ],
  [
    "block: escaped env split-string option cannot hide psql",
    2,
    bash(
      `env \\-S 'psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "drop table x"'`,
    ),
  ],
  [
    "block: env long split-string cannot hide psql",
    2,
    bash(
      `env --split-string='psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "drop table x"'`,
    ),
  ],
  [
    "block: later command help cannot approve db push",
    2,
    bash("supabase db push && echo --help"),
  ],
  [
    "block: later bare db push after approved Preview push",
    2,
    bash(
      `supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres && supabase db push`,
    ),
  ],
  [
    "block: unrelated Preview command cannot approve db push",
    2,
    bash(`echo ${UNREGISTERED_REF} && supabase db push`),
  ],
  [
    "allow: registered Production db-url is not changed by a comment",
    0,
    bash(
      `supabase db push --db-url postgres://u@db.${PROD}.supabase.co/postgres # ${UNREGISTERED_REF}`,
    ),
  ],
  [
    "block: duplicate db-url cannot override approved Preview target",
    2,
    bash(
      `supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --db-url "$DATABASE_URL"`,
    ),
  ],
  [
    "block: db push cannot combine Preview db-url with stored link selector",
    2,
    bash(
      `supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --linked`,
    ),
  ],
  [
    "block: db push cannot combine Preview db-url with local selector",
    2,
    bash(
      `supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --local=true`,
    ),
  ],
  [
    "block: db push selector before Preview db-url remains ambiguous",
    2,
    bash(
      `supabase db push --linked=true --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres`,
    ),
  ],
  [
    "block: db push dry-run with an unregistered URL",
    2,
    bash(
      `supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --dry-run`,
    ),
  ],
  [
    "block: env URL plus unrelated Preview token",
    2,
    bash(`psql -X "$DATABASE_URL" -c "update orders set note = null" # ${UNREGISTERED_REF}`),
  ],
  ["block: global flag before subcommand", 2, bash("supabase --debug db push")],
  ["block: line-continuation split", 2, bash("supabase \\\n db push")],
  [
    "block: remote function deletion is outside CLI allowlist",
    2,
    bash("supabase functions delete retired-handler"),
  ],
  [
    "block: remote secret removal is outside CLI allowlist",
    2,
    bash("supabase secrets unset SERVICE_TOKEN"),
  ],
  [
    "block: psql write SQL vs prod host",
    2,
    bash(`psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "drop table x"`),
  ],
  [
    "block: psql write SQL vs unregistered host",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "update orders set note = null"`,
    ),
  ],
  [
    "block: interactive psql remains unsupported on explicit Preview",
    2,
    bash(`psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres`),
  ],
  [
    "block: psql script file remains unsupported on explicit Preview",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -f migration.sql`,
    ),
  ],
  [
    "block: Preview psql meta-command cannot switch to Production",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "\\connect postgres://u@db.${PROD}.supabase.co/postgres" -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql write SQL vs unregistered host with safe sslmode",
    2,
    bash(
      `psql -X "postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres?sslmode=require" -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql non-production URL with hostaddr override",
    2,
    bash(
      `psql -X "postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres?hostaddr=203.0.113.10" -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql non-production URL with short host override",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -h "$PGHOST" -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql non-production URL with long host override",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --host=203.0.113.10 -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql non-production URL with port override",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --port=6543 -c "select 1"`,
    ),
  ],
  [
    "block: psql non-production URL with attached short host override",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -hX -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql non-production URL with empty long host override",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --host= -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql non-production URL with PGHOSTADDR assignment",
    2,
    bash(
      `PGHOSTADDR=203.0.113.10 psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "update orders set note = null"`,
    ),
  ],
  [
    "block: earlier shell assignment cannot redirect verified Preview psql",
    2,
    bash(
      `PGHOSTADDR=203.0.113.10; psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1"`,
    ),
  ],
  [
    "block: psql non-production URL with env service assignment",
    2,
    bash(
      `env PGSERVICE=other psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "update orders set note = null"`,
    ),
  ],
  [
    "block: db push non-production URL with host override",
    2,
    bash(
      `supabase db push --db-url "postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres?host=db.${PROD}.supabase.co"`,
    ),
  ],
  [
    "block: psql --dbname write SQL vs unregistered host",
    2,
    bash(
      `psql -X --dbname postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "update orders set note = null"`,
    ),
  ],
  [
    "block: psql safe flag before unregistered URL",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "update orders set note = null"`,
    ),
  ],
  [
    "block: db push unregistered URL with stderr redirection",
    2,
    bash(
      `supabase db push --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres 2>&1`,
    ),
  ],
  [
    "block: psql later dbname overrides positional Preview target",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres --dbname "$DATABASE_URL" -c "update orders set note = null"`,
    ),
  ],
  [
    "block: later env psql write after Preview psql read",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1" && psql -X "$DATABASE_URL" -c "update orders set note = null"`,
    ),
  ],
  [
    "block: later env HTTP write after Preview psql read",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1"; curl -X POST "$SUPABASE_URL/rest/v1/orders" -d '{"a":1}'`,
    ),
  ],
  [
    "block: nested shell cannot hide protected HTTP after Preview psql",
    2,
    bash(
      `bash -c 'psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1"; curl -X POST "$SUPABASE_URL/rest/v1/orders" -d "{}"'`,
    ),
  ],
  [
    "block: command substitution cannot hide protected HTTP after Preview psql",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1" $(curl -X POST "$SUPABASE_URL/rest/v1/orders" -d '{}')`,
    ),
  ],
  [
    "block: process substitution cannot hide protected psql write",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1" < <(psql -X "$DATABASE_URL" -c "update orders set note = null")`,
    ),
  ],
  [
    "block: process substitution cannot hide protected HTTP write",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1" < <(curl "$SUPABASE_URL/rest/v1/orders" --data '{}')`,
    ),
  ],
  [
    "block: psql script file vs env URL",
    2,
    bash('psql -X "$DATABASE_URL" -f script.sql'),
  ],
  ["block: interactive psql vs env URL", 2, bash('psql -X "$DATABASE_URL"')],
  [
    "block: psql SELECT mutating rpc vs prod host",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "select public.commit_stock_transfer(1)"`,
    ),
  ],
  [
    "block: psql gexec meta-command vs prod host",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "select 'drop table x' \\gexec"`,
    ),
  ],
  [
    "block: psql gset variable chain vs prod host",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "select '1; update orders set note=null' as frag \\gset" -c "select :frag"`,
    ),
  ],
  [
    "block: psql option terminator cannot turn help into a bypass",
    2,
    bash(
      `psql -X -c "drop table x" -- postgres://u@db.${PROD}.supabase.co/postgres --help`,
    ),
  ],
  [
    "block: Production psql SQL cannot contain shell interpolation",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "select $SQL_FRAGMENT"`,
    ),
  ],
  [
    "block: Production psql variables are unverified SQL input",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -v frag="1; update orders set note=null" -c "select :frag"`,
    ),
  ],
  [
    "block: attached Production psql variable remains unverified",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres --set=frag=1 -c "select :frag"`,
    ),
  ],
  [
    "allow: single-quoted psql SQL has no shell interpolation",
    0,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -c 'select $SQL_FRAGMENT'`,
    ),
  ],
  [
    "block: pg_restore positional dump vs prod",
    2,
    bash(
      `pg_restore --dbname=postgres://u@db.${PROD}.supabase.co/postgres /tmp/backup.dump`,
    ),
  ],
  [
    "block: pg_restore remains unsupported on explicit Preview",
    2,
    bash(
      `pg_restore --dbname=postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres /tmp/backup.dump`,
    ),
  ],
  [
    "block: curl POST vs prod REST",
    2,
    bash(
      `curl -q -X POST https://${PROD}.supabase.co/rest/v1/orders -d '{"a":1}'`,
    ),
  ],
  [
    "block: direct Preview HTTP write remains unsupported",
    2,
    bash(
      `curl -q -X POST https://${UNREGISTERED_REF}.supabase.co/rest/v1/orders -d '{"a":1}'`,
    ),
  ],
  [
    "block: curl attached data flag vs protected URL",
    2,
    bash(`curl -q https://${PROD}.supabase.co/rest/v1/orders -d'{}'`),
  ],
  [
    "block: curl attached form flag vs protected URL",
    2,
    bash(`curl -q https://${PROD}.supabase.co/storage/v1/object -Ffile`),
  ],
  [
    "block: curl attached upload flag vs protected URL",
    2,
    bash(`curl -q https://${PROD}.supabase.co/storage/v1/object -Tfile`),
  ],
  [
    "block: curl bundled short data option vs protected URL",
    2,
    bash(`curl -q -sSd '{}' https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: curl bundled short form option vs protected URL",
    2,
    bash(`curl -q -sSFfile https://${PROD}.supabase.co/storage/v1/object`),
  ],
  [
    "block: curl bundled short upload option vs protected URL",
    2,
    bash(`curl -q -sSTfile https://${PROD}.supabase.co/storage/v1/object`),
  ],
  [
    "block: curl bundled short config option vs protected URL",
    2,
    bash(`curl -q -sKrequest.cfg https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: curl bundled short request option vs protected URL",
    2,
    bash(`curl -q -sSXPOST https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: xh positional POST vs protected URL",
    2,
    bash(`xh POST https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: http positional POST vs protected URL",
    2,
    bash(`http POST https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: curl dynamic explicit method vs protected URL",
    2,
    bash(`curl -q -X "$METHOD" https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: curl spaced data flag vs protected URL",
    2,
    bash(`curl -q https://${PROD}.supabase.co/rest/v1/orders -d '{}'`),
  ],
  [
    "block: curl spaced form flag vs protected URL",
    2,
    bash(`curl -q https://${PROD}.supabase.co/storage/v1/object -F file=@x`),
  ],
  [
    "block: curl spaced upload flag vs protected URL",
    2,
    bash(`curl -q https://${PROD}.supabase.co/storage/v1/object -T file`),
  ],
  [
    "block: curl attached method vs protected URL",
    2,
    bash(`curl -q https://${PROD}.supabase.co/rest/v1/orders -XPOST`),
  ],
  [
    "block: wget spaced method vs protected URL",
    2,
    bash(
      `wget --no-config --method POST https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: wget implicit startup config vs protected URL",
    2,
    bash(`wget https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: wget config file vs protected URL",
    2,
    bash(
      `wget --no-config --config=request.cfg https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: wget URL-list input file vs protected URL",
    2,
    bash(
      `wget --no-config -i targets.txt https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: wget attached URL-list input file vs protected URL",
    2,
    bash(
      `wget --no-config -itargets.txt https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: wget long URL-list input file vs protected URL",
    2,
    bash(
      `wget --no-config --input-file=targets.txt https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: wget execute setting vs protected URL",
    2,
    bash(
      `wget --no-config -e method=POST https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: wget bundled execute option vs protected URL",
    2,
    bash(
      `wget --no-config -qe method=POST https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: wget bundled attached execute option vs protected URL",
    2,
    bash(
      `wget --no-config -qemethod=POST https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: wget env startup config vs protected URL",
    2,
    bash(
      `WGETRC=request.cfg wget --no-config https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: lowercase xh POST vs protected URL",
    2,
    bash(`xh post https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: http raw body vs protected URL",
    2,
    bash(`http --raw '{}' https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: http stdin body vs protected URL",
    2,
    bash(`http https://${PROD}.supabase.co/rest/v1/orders < body.json`),
  ],
  [
    "block: http here-string body vs protected URL",
    2,
    bash(`http https://${PROD}.supabase.co/rest/v1/orders <<<'{}'`),
  ],
  [
    "block: xh numbered stdin body vs protected URL",
    2,
    bash(`xh https://${PROD}.supabase.co/rest/v1/orders 0<body.json`),
  ],
  [
    "block: http piped stdin body vs protected URL",
    2,
    bash(`printf '{}' | http https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: http stderr-inclusive pipe body vs protected URL",
    2,
    bash(`printf '{}' |& http https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: http file body vs protected URL",
    2,
    bash(
      `http --ignore-stdin https://${PROD}.supabase.co/rest/v1/orders @body.json`,
    ),
  ],
  [
    "block: HTTPie explicit body stays blocked when stdin is ignored",
    2,
    bash(
      `http --ignore-stdin https://${PROD}.supabase.co/rest/v1/orders value=changed`,
    ),
  ],
  [
    "block: HTTPie stdin opt-out can be cancelled",
    2,
    bash(
      `http --ignore-stdin --no-ignore-stdin GET https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: curl config file vs protected URL",
    2,
    bash(`curl -q -K request.cfg https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: curl expanded data vs protected URL",
    2,
    bash(
      `curl -q --expand-data name=owned https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: curl expanded request remains unverified",
    2,
    bash(
      `curl -q --expand-request GET https://${PROD}.supabase.co/rest/v1/orders`,
    ),
  ],
  [
    "block: curl Host header cannot override registered target",
    2,
    bash(
      `curl -q -H "Host: $OTHER_HOST" https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: curl attached Host header cannot override registered target",
    2,
    bash(
      `curl -q -sHHost:example.invalid https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: curl header file is unverified target input",
    2,
    bash(
      `curl -q -H @headers.txt https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: wget Host header cannot override registered target",
    2,
    bash(
      `wget --no-config --header="Host: $OTHER_HOST" https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: HTTPie Host header cannot override registered target",
    2,
    bash(
      `http --ignore-stdin GET https://${PROD}.supabase.co/rest/v1/orders?select=id "Host:$OTHER_HOST"`,
    ),
  ],
  [
    "block: curl implicit startup config vs protected URL",
    2,
    bash(`curl https://${PROD}.supabase.co/rest/v1/orders`),
  ],
  [
    "block: mcp execute_sql write vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "update orders set note = null",
    }),
  ],
  [
    "block: mcp create_project management mutation",
    2,
    mcp("create_project", { organization_id: "org", name: "blocked" }),
  ],
  [
    "allow: unscoped Supabase docs search",
    0,
    mcp("search_docs", { graphql_query: "query { searchDocs(query: \"RLS\") { nodes { title } } }" }),
  ],
  [
    "block: unknown future Supabase action fails closed",
    2,
    mcp("future_mutation", { project_id: UNREGISTERED_REF }),
  ],
  [
    "block: mcp update_storage_config vs prod",
    2,
    mcp("update_storage_config", { project_id: PROD, file_size_limit: 1 }),
  ],
  [
    "block: mcp update_storage_config remains unsupported on Preview",
    2,
    mcp("update_storage_config", { project_id: UNREGISTERED_REF, file_size_limit: 1 }),
  ],
  [
    "block: mcp update_storage_config remains unsupported on Production",
    2,
    mcp("update_storage_config", { project_id: PROD, file_size_limit: 1 }),
  ],
  [
    "block: mcp execute_sql write remains unsupported on Production",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "update orders set note = null",
    }),
  ],
  [
    "allow: mcp execute_sql read vs registered Production",
    0,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select count(*) from information_schema.tables",
    }),
  ],
  [
    "block: mcp apply_migration empty ref fails closed",
    2,
    mcp("apply_migration", {}),
  ],
  [
    "allow: mcp create_branch with the registered Production parent",
    previewCreateStatus,
    mcp("create_branch", { project_id: PROD }),
  ],
  [
    "block: mcp create_branch cannot target an unregistered parent",
    2,
    mcp("create_branch", { project_id: UNREGISTERED_REF }),
  ],
  [
    "allow: mcp delete_branch with a verified Production parent",
    0,
    mcp("delete_branch", { project_id: PROD, branch_id: TRUSTED_PREVIEW }),
  ],
  [
    "block: mcp delete_branch cannot target an unregistered parent",
    2,
    mcp("delete_branch", { project_id: UNREGISTERED_REF, branch_id: "preview-branch" }),
  ],
  [
    "block: mcp delete_branch cannot delete Production ref",
    2,
    mcp("delete_branch", { project_id: PROD, branch_id: PROD }),
  ],
  [
    "block: mcp delete_branch cannot clean an unverified Preview ref",
    2,
    mcp("delete_branch", { project_id: PROD, branch_id: UNREGISTERED_REF }),
  ],
  [
    "allow: mcp connector create_branch with the registered Production parent",
    previewCreateStatus,
    mcpConnector("create_branch", { project_id: PROD }),
  ],
  [
    "allow: mcp connector dotted delete_branch with a verified Production parent",
    0,
    mcpConnector("delete_branch", {
      project_id: PROD,
      branch_id: TRUSTED_PREVIEW,
    }),
  ],
  [
    "block: mcp merge_branch vs prod",
    2,
    mcp("merge_branch", { project_id: PROD }),
  ],
  ["allow: plain command", 0, bash("ls -la")],
  [
    "allow: supabase branches create with the registered Production parent",
    previewCreateStatus,
    bash(`supabase branches create test --project-ref ${PROD}`),
  ],
  [
    "block: Preview creation against unknown parent",
    2,
    bash("supabase branches create test --project-ref abcdefabcdefabcdefab"),
  ],
  [
    "block: Preview creation cannot combine explicit parent with stored link",
    2,
    bash(
      `supabase branches create test --project-ref ${PROD} --linked`,
    ),
  ],
  [
    "block: project metadata is outside Production CLI read rights",
    2,
    bash(`supabase branches list --project-ref ${PROD}`),
  ],
  [
    "block: Supabase CLI read without explicit target",
    2,
    bash("supabase branches list"),
  ],
  [
    "block: Supabase CLI read with env-indirected target",
    2,
    bash('supabase branches list --project-ref "$OTHER_REF"'),
  ],
  [
    "block: Supabase CLI read with unregistered target",
    2,
    bash("supabase branches list --project-ref abcdefabcdefabcdefab"),
  ],
  [
    "block: Production db dump cannot expose table data",
    2,
    bash(
      `supabase db dump --db-url postgres://u@db.${PROD}.supabase.co/postgres --data-only`,
    ),
  ],
  [
    "block: Production inspect diagnostics are outside catalog reads",
    2,
    bash(
      `supabase inspect db long-running-queries --db-url postgres://u@db.${PROD}.supabase.co/postgres`,
    ),
  ],
  [
    "block: inspect diagnostics against an unregistered target",
    2,
    bash(
      `supabase inspect db long-running-queries --db-url postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres`,
    ),
  ],
  [
    "allow: Supabase migration read with literal Production DB URL",
    0,
    bash(
      `supabase migration list --db-url postgres://u@db.${PROD}.supabase.co/postgres`,
    ),
  ],
  [
    "block: target text inside CLI filename is not a target flag",
    2,
    bash(
      `supabase db dump --file "/tmp/x --project-ref ${PROD} y.sql"`,
    ),
  ],
  [
    "block: target-like option consumed as an earlier option value",
    2,
    bash(`supabase db dump --file --project-ref ${PROD}`),
  ],
  [
    "allow: CLI target precedes unrelated output option",
    0,
    bash(`supabase db dump --project-ref ${PROD} --file dump.sql`),
  ],
  ["allow: supabase help", 0, bash("supabase functions delete --help")],
  ["allow: supabase top-level help", 0, bash("supabase --help")],
  ["allow: supabase short top-level help", 0, bash("supabase -h")],
  ["allow: supabase top-level version", 0, bash("supabase --version")],
  ["allow: supabase short top-level version", 0, bash("supabase -v")],
  [
    "allow: local Supabase migration scaffold with a lower snake case name",
    0,
    bash("supabase migration new add_supplier_status"),
  ],
  [
    "block: local Supabase migration scaffold with a non-canonical name",
    2,
    bash("supabase migration new add-supplier-status"),
  ],
  [
    "allow: supabase top-level completions",
    0,
    bash("supabase --completions zsh"),
  ],
  [
    "allow: Supabase read after value-taking global flags",
    0,
    bash(
      `supabase --log-level debug --dns-resolver https -o json migration list --db-url postgres://u@db.${PROD}.supabase.co/postgres`,
    ),
  ],
  [
    "allow: psql SELECT vs prod host",
    0,
    bash(`psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "select 1"`),
  ],
  [
    "block: psql read with env-indirected target",
    2,
    bash('psql -X "$DATABASE_URL" -c "select 1"'),
  ],
  [
    "block: psql read with unregistered Supabase target",
    2,
    bash(
      "psql -X postgres://u@db.abcdefabcdefabcdefab.supabase.co/postgres -c \"select 1\"",
    ),
  ],
  ...[
    ["PGHOST", "db.example.invalid"],
    ["PGHOSTADDR", "203.0.113.10"],
    ["PGOPTIONS", "-c search_path=public,pg_catalog"],
    ["PGPORT", "6543"],
    ["PGDATABASE", "other"],
    ["PGSERVICE", "other"],
    ["PGSERVICEFILE", "/tmp/other-pg-service.conf"],
  ].map(([name, value]) => [
    `block: inherited ${name} cannot redirect verified Preview psql`,
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "select 1"`,
    ),
    { [name]: value },
  ]),
  [
    "allow: quoted SQL parentheses are not shell grouping",
    0,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "select count(*) from orders"`,
    ),
  ],
  [
    "block: here-string input cannot hide protected psql write",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres<<<"update orders set note = null"`,
    ),
  ],
  [
    "allow: quoted SQL comparison is not shell input redirection",
    0,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -c "select 1 where 1 < 2"`,
    ),
  ],
  [
    "allow: psql SELECT vs prod host with long startup opt-out",
    0,
    bash(
      `psql --no-psqlrc postgres://u@db.${PROD}.supabase.co/postgres -c "select 1"`,
    ),
  ],
  [
    "block: psql SELECT vs prod host with startup files enabled",
    2,
    bash(`psql postgres://u@db.${PROD}.supabase.co/postgres -c "select 1"`),
  ],
  [
    "block: attached psql script option against Production",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -fx -c "select 1"`,
    ),
  ],
  [
    "block: stdin psql script option against Production",
    2,
    bash(
      `psql -X postgres://u@db.${PROD}.supabase.co/postgres -f- -c "select 1"`,
    ),
  ],
  [
    "block: attached psql script option against Preview",
    2,
    bash(
      `psql -X postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -fx -c "select 1"`,
    ),
  ],
  [
    "block: psql option value cannot impersonate startup opt-out",
    2,
    bash(
      `psql -o -X postgres://u@db.${PROD}.supabase.co/postgres -c "select 1"`,
    ),
  ],
  [
    "block: psql write vs explicit Preview host with startup files enabled",
    2,
    bash(
      `psql postgres://u@db.${UNREGISTERED_REF}.supabase.co/postgres -c "update orders set note = null"`,
    ),
  ],
  [
    "allow: curl GET vs prod REST",
    0,
    bash(
      `curl -q -s "https://${PROD}.supabase.co/rest/v1/orders?select=id" -H "apikey: $KEY"`,
    ),
  ],
  [
    "block: curl GET vs unregistered REST target",
    2,
    bash(
      `curl -q -s "https://${UNREGISTERED_REF}.supabase.co/rest/v1/orders?select=id" -H "apikey: $KEY"`,
    ),
  ],
  [
    "block: Production management API metadata read",
    2,
    bash(`curl -q -s https://api.supabase.com/v1/projects/${PROD}`),
  ],
  [
    "block: Production management API key read",
    2,
    bash(`curl -q -s https://api.supabase.com/v1/projects/${PROD}/api-keys`),
  ],
  [
    "block: Production REST RPC GET is outside table-view reads",
    2,
    bash(`curl -q -s https://${PROD}.supabase.co/rest/v1/rpc/read_helper`),
  ],
  [
    "block: encoded Production REST RPC path is outside table-view reads",
    2,
    bash(`curl -q -s https://${PROD}.supabase.co/rest/v1/%72pc/read_helper`),
  ],
  [
    "block: Production auth endpoint is outside table-view reads",
    2,
    bash(`curl -q -s https://${PROD}.supabase.co/auth/v1/settings`),
  ],
  [
    "block: management metadata GET vs unregistered target",
    2,
    bash(`curl -q -s https://api.supabase.com/v1/projects/${UNREGISTERED_REF}`),
  ],
  [
    "block: curl read with env-indirected Supabase target",
    2,
    bash(
      'curl -q -s "$SUPABASE_URL/rest/v1/orders?select=id" -H "apikey: $KEY"',
    ),
  ],
  [
    "block: curl cannot add unresolved positional target",
    2,
    bash(
      `curl -q https://${PROD}.supabase.co/rest/v1/orders?select=id "$TARGET"`,
    ),
  ],
  [
    "block: curl sole positional target cannot be unresolved",
    2,
    bash('curl -q "$TARGET"'),
  ],
  [
    "block: curl positional target array cannot be unresolved",
    2,
    bash('curl -q "${TARGETS[@]}"'),
  ],
  [
    "block: curl --url target cannot be unresolved",
    2,
    bash('curl -q --url="$TARGET"'),
  ],
  [
    "block: wget cannot add unresolved positional target",
    2,
    bash(
      `wget --no-config https://${PROD}.supabase.co/rest/v1/orders?select=id "$TARGET"`,
    ),
  ],
  [
    "allow: curl output path variable is not a request target",
    0,
    bash(
      `curl -q -o "$OUTPUT_FILE" https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: curl read with unregistered Supabase target",
    2,
    bash(
      "curl -q -s https://abcdefabcdefabcdefab.supabase.co/rest/v1/orders?select=id",
    ),
  ],
  [
    "block: curl cannot mix registered and unregistered Supabase targets",
    2,
    bash(
      `curl -q -s https://${PROD}.supabase.co/rest/v1/orders?select=id https://abcdefabcdefabcdefab.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "block: curl URL glob cannot add unregistered Supabase target",
    2,
    bash(
      `curl -q 'https://{${PROD},abcdefabcdefabcdefab}.supabase.co/rest/v1/orders?select=id'`,
    ),
  ],
  [
    "block: curl output path cannot impersonate HTTP target binding",
    2,
    bash(
      `curl -q -o '/tmp/${PROD}.supabase.co' 'https://{abcdefabcdefabcdefab,bbbbbbbbbbbbbbbbbbbb}.supabase.co/rest/v1/orders?select=id'`,
    ),
  ],
  [
    "block: non-literal Supabase URL stays unverified with globoff",
    2,
    bash(
      `curl -q --globoff 'https://{${PROD},abcdefabcdefabcdefab}.supabase.co/rest/v1/orders?select=id'`,
    ),
  ],
  [
    "allow: non-Supabase HTTP remains outside the database guard",
    0,
    bash("curl -X POST https://example.com/health -d '{}'")
  ],
  [
    "allow: curl response-header output remains GET",
    0,
    bash(
      `curl -q -D headers.txt https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "allow: curl bundled safe options remain GET",
    0,
    bash(`curl -q -fsSL https://${PROD}.supabase.co/rest/v1/orders?select=id`),
  ],
  [
    "allow: curl bundled safe method remains GET",
    0,
    bash(`curl -q -sSXGET https://${PROD}.supabase.co/rest/v1/orders?select=id`),
  ],
  [
    "allow: curl bundled response-header output remains GET",
    0,
    bash(
      `curl -q -sDheaders.txt https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "allow: curl attached header value is not parsed as bundled options",
    0,
    bash(
      `curl -q -Hx-id:abc https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "allow: curl separated header value is not parsed as an option bundle",
    0,
    bash(
      `curl -q -H '-XPOST: trace' https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "allow: wget GET with startup config disabled",
    0,
    bash(
      `wget --no-config https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "allow: wget bundled output value is not parsed as execute",
    0,
    bash(
      `wget --no-config -qOresponse https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "allow: HTTPie GET with stdin ignored",
    0,
    bash(
      `http --ignore-stdin GET https://${PROD}.supabase.co/rest/v1/orders?select=id`,
    ),
  ],
  [
    "allow: xh GET with short stdin opt-out",
    0,
    bash(`xh -I GET https://${PROD}.supabase.co/rest/v1/orders?select=id`),
  ],
  [
    "allow: mcp execute_sql SELECT vs prod",
    0,
    mcp("execute_sql", {
      project_id: PROD,
      query: "with t as (select 1) select * from t",
    }),
  ],
  [
    "allow: project-scoped MCP table read vs prod",
    0,
    mcp("list_tables", { project_id: PROD, schemas: ["public"] }),
  ],
  [
    "allow: connector MCP table read vs registered Production",
    0,
    mcpConnectorLive("list_tables", {
      project_id: PROD,
      schemas: ["public"],
    }),
  ],
  [
    "allow: MCP extension catalog read vs prod",
    0,
    mcp("list_extensions", { project_id: PROD }),
  ],
  [
    "block: Production logs are outside database catalog read rights",
    2,
    mcp("get_logs", { project_id: PROD, service: "postgres" }),
  ],
  [
    "block: Production advisors are outside database catalog read rights",
    2,
    mcp("get_advisors", { project_id: PROD, type: "security" }),
  ],
  [
    "block: Production publishable keys are outside database read rights",
    2,
    mcp("get_publishable_keys", { project_id: PROD }),
  ],
  [
    "block: Production project metadata is outside database read rights",
    2,
    mcp("get_project", { id: PROD }),
  ],
  [
    "allow: pinned read-only Codex MCP may omit project ref",
    0,
    mcp("list_tables", { schemas: ["public"] }),
  ],
  [
    "block: Claude direct MCP cannot inherit Codex project binding",
    2,
    mcp("list_tables", { schemas: ["public"] }),
    { CLAUDE_PROJECT_DIR: REPO_ROOT },
  ],
  [
    "block: connector MCP read without explicit project ref",
    2,
    mcpConnectorLive("list_tables", { schemas: ["public"] }),
  ],
  [
    "block: connector project read vs unregistered target",
    2,
    mcpConnectorLive("list_tables", {
      project_id: UNREGISTERED_REF,
      schemas: ["public"],
    }),
  ],
  [
    "block: project diagnostics vs unregistered target",
    2,
    mcpConnectorLive("get_logs", {
      project_id: UNREGISTERED_REF,
      service: "postgres",
    }),
  ],
  [
    "allow: mcp execute_sql EXPLAIN format vs prod",
    0,
    mcp("execute_sql", {
      project_id: PROD,
      query: "explain (format json) select id from orders",
    }),
  ],
  [
    "block: mcp execute_sql locking read vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select id from orders for share",
    }),
  ],
  [
    "allow: mcp execute_sql safe aggregate vs prod",
    0,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select count(*) from orders",
    }),
  ],
  [
    "allow: mcp execute_sql catalog fingerprint vs prod",
    0,
    mcp("execute_sql", {
      project_id: PROD,
      query:
        "select md5(string_agg(table_name, ',')) from information_schema.tables",
    }),
  ],
  [
    "allow: mcp execute_sql pg_catalog safe aggregate",
    0,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select pg_catalog.count(*) from orders",
    }),
  ],
  [
    "allow: mcp execute_sql SELECT with write-keyword literal vs prod",
    0,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select id from orders where notes = 'do not delete this row'",
    }),
  ],
  [
    "block: mcp execute_sql SELECT INTO vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select * into copied_orders from orders",
    }),
  ],
  [
    "block: mcp execute_sql COMMENT ON vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "comment on table orders is 'changed'",
    }),
  ],
  [
    "block: mcp execute_sql ANALYZE vs prod",
    2,
    mcp("execute_sql", { project_id: PROD, query: "analyze orders" }),
  ],
  [
    "block: mcp execute_sql missing query",
    2,
    mcp("execute_sql", { project_id: PROD }),
  ],
  [
    "block: mcp execute_sql non-string query",
    2,
    mcp("execute_sql", { project_id: PROD, query: ["select 1"] }),
  ],
  [
    "block: mcp execute_sql conflicting query aliases",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select 1",
      sql: "update orders set note = null",
    }),
  ],
  [
    "block: mcp conflicting project aliases",
    2,
    mcp("execute_sql", {
      project_id: UNREGISTERED_REF,
      ref: PROD,
      query: "update orders set note = null",
    }),
  ],
  [
    "block: mcp execute_sql write with quoted value vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "update orders set notes = 'keep me' where id = 1",
    }),
  ],
  [
    "block: mcp execute_sql DO-block write vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "do $$ begin update orders set x = 1; end $$",
    }),
  ],
  [
    "block: mcp execute_sql DO-block PERFORM rpc vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "do $$ begin perform public.commit_stock_transfer(1); end $$",
    }),
  ],
  [
    "block: mcp execute_sql bare PERFORM rpc vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "perform public.commit_stock_transfer(1)",
    }),
  ],
  [
    "block: mcp execute_sql SELECT mutating rpc vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select public.commit_stock_transfer(1)",
    }),
  ],
  [
    "block: mcp execute_sql bare SELECT mutating rpc vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: "select commit_stock_transfer(1)",
    }),
  ],
  [
    "block: mcp execute_sql quoted SELECT mutating rpc vs prod",
    2,
    mcp("execute_sql", {
      project_id: PROD,
      query: 'select public."commit_stock_transfer"(1)',
    }),
  ],
  [
    "block: mcp execute_sql custom schema shadows safe builtin",
    2,
    mcp("execute_sql", { project_id: PROD, query: "select public.count()" }),
  ],
  [
    "block: mcp connector dotted execute_sql write vs prod",
    2,
    mcpConnector("execute_sql", {
      project_id: PROD,
      query: "update orders set note = null",
    }),
  ],
  [
    "block: live connector execute_sql write vs prod",
    2,
    mcpConnectorLive("execute_sql", {
      project_id: PROD,
      query: "update orders set note = null",
    }),
  ],
  [
    "block: mcp connector dotted apply_migration empty ref fails closed",
    2,
    mcpConnector("apply_migration", {}),
  ],
  [
    "allow: mcp connector dotted execute_sql SELECT vs prod",
    0,
    mcpConnector("execute_sql", { project_id: PROD, query: "select 1" }),
  ],
  [
    "block: mcp write vs unregistered ref",
    2,
    mcp("apply_migration", { project_id: UNREGISTERED_REF }),
  ],
  [
    "block: destructive branch operation vs unregistered ref",
    2,
    mcp("merge_branch", { project_id: UNREGISTERED_REF, branch_id: "preview-branch" }),
  ],
  [
    "allow: mcp write vs a Preview verified from the Production parent",
    0,
    mcp("apply_migration", { project_id: TRUSTED_PREVIEW }),
  ],
  [
    "allow: connector MCP migration vs registered Production",
    0,
    mcpConnectorLive("apply_migration", {
      project_id: PROD,
      name: "bootstrap_probe",
      query: "select 1",
    }),
  ],
  [
    "block: mcp write vs a Preview with the wrong parent",
    2,
    mcp("apply_migration", { project_id: WRONG_PARENT_PREVIEW }),
  ],
  [
    "block: mcp write when Preview lookup returns a different project ref",
    2,
    mcp("apply_migration", { project_id: MISMATCHED_PREVIEW }),
  ],
  [
    "block: mcp write vs unknown ref",
    2,
    mcp("apply_migration", { project_id: "abcdefabcdefabcdefab" }),
  ],
  [
    "block: mcp read vs unknown ref",
    2,
    mcp("execute_sql", {
      project_id: "abcdefabcdefabcdefab",
      query: "select 1",
    }),
  ],
  [
    "block: object prototype name is not an approved ref",
    2,
    mcp("apply_migration", { project_id: "__proto__" }),
  ],
  [
    "block: array project ref cannot coerce to a verified Preview",
    2,
    mcp("apply_migration", { project_id: [UNREGISTERED_REF] }),
  ],
  [
    "block: live connector Preview deletion without parent binding",
    2,
    mcpConnectorLive("delete_branch", { branch_id: "preview-branch" }),
  ],
  [
    "allow: live connector Preview deletion with a verified Production parent",
    0,
    mcpConnectorLive("delete_branch", { branch_id: TRUSTED_PREVIEW }),
  ],
  [
    "block: direct Preview deletion without parent binding",
    2,
    mcp("delete_branch", { branch_id: "preview-branch" }),
  ],
  [
    "block: live connector Preview deletion without branch_id",
    2,
    mcpConnectorLive("delete_branch", {}),
  ],
  [
    "block: live connector Preview deletion with array branch_id",
    2,
    mcpConnectorLive("delete_branch", { branch_id: ["preview-branch"] }),
  ],
  [
    "block: live connector Preview merge by branch_id",
    2,
    mcpConnectorLive("merge_branch", { branch_id: TRUSTED_PREVIEW }),
  ],
  [
    "block: live connector Preview reset by branch_id",
    2,
    mcpConnectorLive("reset_branch", { branch_id: "preview-branch" }),
  ],
  [
    "block: live connector Preview rebase by branch_id",
    2,
    mcpConnectorLive("rebase_branch", { branch_id: "preview-branch" }),
  ],
  ["block: unreadable stdin fails closed", 2, "not-json"],
  ["block: malformed hook payload fails closed", 2, "{}"],
  [
    "block: malformed Bash input fails closed",
    2,
    JSON.stringify({ tool_name: "Bash", tool_input: [] }),
  ],
];
const hookBaseEnv = { ...process.env };
hookBaseEnv.PATH = `${previewFixtureDir}${path.delimiter}${hookBaseEnv.PATH ?? ""}`;
for (const name of [
  "CLAUDE_PROJECT_DIR",
  "PGDATABASE",
  "PGHOST",
  "PGHOSTADDR",
  "PGOPTIONS",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
]) {
  delete hookBaseEnv[name];
}

for (const [desc, want, payload, fixtureEnv = {}] of FIXTURES) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const run = spawnSync("node", [path.join(REPO_ROOT, HOOK_PATH)], {
    input,
    encoding: "utf8",
    env: { ...hookBaseEnv, ...fixtureEnv },
  });
  if (run.status !== want) {
    fail(`fixture "${desc}": expected exit ${want}, got ${run.status}`);
  }
  if (run.status === 2 && !run.stderr.trim()) {
    fail(
      `fixture "${desc}": blocked without a stderr reason (Codex treats exit 2 with empty stderr as non-blocking)`,
    );
  }
}
fs.rmSync(previewFixtureDir, { recursive: true, force: true });

if (errors.length > 0) {
  for (const message of errors) console.error(`[guard-sync] ${message}`);
  process.exit(1);
}

console.log(
  `[guard-sync] hook, pinned Codex MCP, ${ADAPTER_PATHS.length} adapter configs, Environment Registry, and ${FIXTURES.length} behavior fixtures in sync (${hookRefs.length} protected refs)`,
);
