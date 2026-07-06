import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  const candidate = new URL(path, repoRoot);
  if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  if (path.startsWith("supabase/migrations/")) {
    return readFileSync(
      new URL(
        path.replace("supabase/migrations/", "supabase/migrations/_archive/"),
        repoRoot,
      ),
      "utf8",
    );
  }
  return readFileSync(candidate, "utf8");
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
  "supabase/migrations/_archive/20260601870000_network_gate_presence_token_registry.sql",
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
  assert.match(
    migration,
    /AND revoked_at IS NULL\s+RETURNING id INTO v_updated_id/,
  );
  assert.doesNotMatch(
    migration,
    /UPDATE public\.branch_trusted_egress_ips[\s\S]*revoked_at\s*=\s*NULL/i,
  );
});

test("presence token registry is service-role only and bound to tenant branch agent tuple", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.printer_agent_presence_tokens/,
  );
  assert.match(migration, /UNIQUE \(tenant_id, branch_id, agent_id\)/);
  assert.match(migration, /UNIQUE \(token_sha256\)/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.printer_agent_presence_tokens\s+FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.register_branch_presence\(BIGINT, BIGINT, TEXT, TEXT, INET\)\s+FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
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

test("register_branch_presence enforces durable 30s rate limit and 60s noisy-write skip", () => {
  assert.match(migration, /last_attempt_at <= v_now - INTERVAL '30 seconds'/);
  assert.match(migration, /RETURN QUERY SELECT false, 'rate_limited'/);
  assert.match(
    migration,
    /v_existing\.last_seen_at > v_now - INTERVAL '60 seconds'/,
  );
  assert.match(migration, /RETURN QUERY SELECT true, 'skipped'/);
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
