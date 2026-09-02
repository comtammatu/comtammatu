import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "../../test-utils/active-sql";


const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  if (path.startsWith("supabase/") || path.includes("migration-archive")) {
    return readSql(fileURLToPath(repoRoot), path);
  }
  return readFileSync(new URL(path, repoRoot), "utf8");
}

const route = readRepoFile("apps/web/app/api/branch-presence/route.ts");
const proxy = readRepoFile("apps/web/proxy.ts");
const provisioningCli = readRepoFile(
  "apps/print-agent/src/ops/provision-presence-token.ts",
);
const printAgentReadme = readRepoFile("apps/print-agent/README.md");
const printAgentRunbook = readRepoFile(
  "docs/runbooks/pos-kds/print-agent-rollout.md",
);
const migration = readRepoFile(
  "supabase/migrations/20260601870000_network_gate_presence_token_registry.sql",
);
const emergencyBypassMigration = readRepoFile(
  "supabase/migrations/20260810020844_branch_network_gate_emergency_bypass.sql",
);
const bypassActiveRpcMigration = readRepoFile(
  "supabase/migrations/20260814163500_branch_network_gate_bypass_active_rpc.sql",
);
const networkActions = readRepoFile(
  "apps/web/app/(protected)/branches/network-config-actions.ts",
);

test("branch-presence route uses token hash + RPC instead of a global shared token", () => {
  assert.doesNotMatch(route, /process\.env\.PRINT_AGENT_PRESENCE_TOKEN/);
  assert.match(
    route,
    /createHash\("sha256"\)\.update\(value\)\.digest\("hex"\)/,
  );
  assert.match(route, /\.rpc\("register_branch_presence"/);
  assert.doesNotMatch(route, /\.from\("branch_trusted_egress_ips"\)/);
});

test("agent heartbeat cannot clear a revoked trusted IP row", () => {
  assert.doesNotMatch(route, /revoked_at:\s*null/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assertSqlMatch(migration,
    /AND revoked_at IS NULL\s+RETURNING id INTO v_updated_id/,
  );
  assertSqlNotMatch(migration,
    /UPDATE public\.branch_trusted_egress_ips[\s\S]*revoked_at\s*=\s*NULL/i,
  );
});

test("presence token registry is service-role only and bound to tenant branch agent tuple", () => {
  assertSqlMatch(migration,
    /CREATE TABLE IF NOT EXISTS public\.printer_agent_presence_tokens/,
  );
  assertSqlMatch(migration, /UNIQUE \(tenant_id, branch_id, agent_id\)/);
  assertSqlMatch(migration, /UNIQUE \(token_sha256\)/);
  assertSqlMatch(migration,
    /REVOKE ALL ON TABLE public\.printer_agent_presence_tokens\s+FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(migration,
    /REVOKE EXECUTE ON FUNCTION public\.register_branch_presence\(BIGINT, BIGINT, TEXT, TEXT, INET\)\s+FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.register_branch_presence\(BIGINT, BIGINT, TEXT, TEXT, INET\)\s+TO service_role/,
  );
});

test("owner bypasses station network gate while other roles still use it", () => {
  assert.match(
    proxy,
    /claims\.user_role !== "owner"[\s\S]*process\.env\.POS_NETWORK_GATE !== "off"/,
  );
  assert.match(
    proxy,
    /if \(networkGateEnabled\) \{[\s\S]*\.from\("branch_trusted_egress_ips"\)/,
  );
});

test("proxy checks per-branch emergency bypass before trusted-IP deny", () => {
  assert.match(
    proxy,
    /\.rpc\(\s*"branch_network_gate_bypass_active"[\s\S]*\.from\("branch_trusted_egress_ips"\)/,
  );
  assert.doesNotMatch(
    proxy,
    /\.from\("branch_network_gate_bypasses"\)/,
  );
});

test("branch_network_gate_bypass_active RPC is SECURITY DEFINER and pos_shift aware", () => {
  assertSqlMatch(bypassActiveRpcMigration,
    /CREATE OR REPLACE FUNCTION public\.branch_network_gate_bypass_active/,
  );
  assertSqlMatch(bypassActiveRpcMigration, /SECURITY DEFINER/);
  assertSqlMatch(bypassActiveRpcMigration,
    /bound_pos_session_id[\s\S]*pos_sessions[\s\S]*status = 'open'/,
  );
  assertSqlMatch(bypassActiveRpcMigration,
    /GRANT EXECUTE ON FUNCTION public\.branch_network_gate_bypass_active\(bigint, bigint\)\s+TO authenticated, service_role/,
  );
});

test("emergency bypass migration enforces duration kinds and pos_shift auto-revoke", () => {
  assertSqlMatch(emergencyBypassMigration,
    /CREATE TABLE public\.branch_network_gate_bypasses/,
  );
  assertSqlMatch(emergencyBypassMigration,
    /duration_kind = ANY \(ARRAY\['1h'::text, '2h'::text, '4h'::text, 'pos_shift'::text, 'business_day'::text\]\)/,
  );
  assertSqlMatch(emergencyBypassMigration,
    /CREATE UNIQUE INDEX branch_network_gate_bypasses_one_open_per_branch_idx/,
  );
  assertSqlMatch(emergencyBypassMigration,
    /trg_revoke_network_gate_bypass_on_pos_session_close/,
  );
  assertSqlMatch(emergencyBypassMigration,
    /AFTER UPDATE OF status ON public\.pos_sessions/,
  );
});

test("emergency bypass actions allowlist duration kinds and require settings:branch_network", () => {
  assert.match(
    networkActions,
    /z\.enum\(NETWORK_GATE_BYPASS_DURATION_KINDS\)/,
  );
  assert.match(
    networkActions,
    /activateNetworkGateBypass[\s\S]*PERMISSION_KEYS\.SETTINGS_BRANCH_NETWORK/,
  );
  assert.match(
    networkActions,
    /durationKind === "pos_shift"[\s\S]*status", "open"/,
  );
  assert.match(
    networkActions,
    /rpc\(\s*"branch_business_day_bounds"/,
  );
});

test("owner network gate UI is reachable from branch cards and branch settings", () => {
  const branchTable = readRepoFile(
    "apps/web/app/(protected)/branches/branch-table.tsx",
  );
  const settingsLanding = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  const networkPage = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/network/page.tsx",
  );
  const networkDialog = readRepoFile(
    "apps/web/app/(protected)/branches/network-config-dialog.tsx",
  );

  assert.match(branchTable, /copy\.networkGateway\.short/);
  assert.match(branchTable, /NetworkConfigDialog/);
  assert.match(settingsLanding, /settings\/network/);
  assert.match(settingsLanding, /canManageTenantStrategySettings/);
  assert.match(networkPage, /canManageTenantStrategySettings/);
  assert.match(networkPage, /NetworkConfigPanel/);
  assert.match(networkDialog, /export function NetworkConfigPanel/);
  assert.match(networkDialog, /export function NetworkConfigDialog/);
});

test("register_branch_presence enforces durable 30s rate limit and 60s noisy-write skip", () => {
  assertSqlMatch(migration, /last_attempt_at <= v_now - INTERVAL '30 seconds'/);
  assertSqlMatch(migration, /RETURN QUERY SELECT false, 'rate_limited'/);
  assertSqlMatch(migration,
    /v_existing\.last_seen_at > v_now - INTERVAL '60 seconds'/,
  );
  assertSqlMatch(migration, /RETURN QUERY SELECT true, 'skipped'/);
});

test("presence token lifecycle is operated through the repo CLI, not SQL Editor", () => {
  assert.match(
    provisioningCli,
    /type Command = "create" \| "rotate" \| "revoke" \| "status"/,
  );
  assert.match(provisioningCli, /--confirm-project-ref/);
  assert.match(provisioningCli, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(
    provisioningCli,
    /createHash\("sha256"\)\.update\(value\)\.digest\("hex"\)/,
  );
  assert.doesNotMatch(
    provisioningCli,
    /process\.env\.PRINT_AGENT_PRESENCE_TOKEN/,
  );
  assert.match(
    provisioningCli,
    /\.from\("printer_agent_presence_tokens"\)\s+\.insert/,
  );
  assert.match(
    provisioningCli,
    /\.from\("printer_agent_presence_tokens"\)\s+\.update/,
  );
  assert.doesNotMatch(provisioningCli, /\.upsert\(/);
  assert.doesNotMatch(provisioningCli, /PRINT_AGENT_PRESENCE_TOKEN.*shared/i);

  assert.match(printAgentReadme, /presence:provision -- create/);
  assert.match(printAgentRunbook, /presence:provision -- create/);
  assert.doesNotMatch(printAgentReadme, /Insert that hash/i);
  assert.doesNotMatch(printAgentRunbook, /printer_agent_presence_tokens/);
});
