import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("E2E manager fixture matches the seeded manager account", () => {
  const seed = read("tests/fixtures/supabase-e2e/qa-users.sql");
  const tenantSeed = read("tests/fixtures/supabase-e2e/tenant.sql");
  const bringup = read("../../scripts/supabase-e2e-bringup.mjs");
  const packageManifest = read("package.json");
  const ci = read("../../.github/workflows/ci.yml");
  const authSetup = read("e2e/auth.setup.ts");
  const email = "manager.nguyenhuutho@comtammatu.vn";

  assert.match(seed, new RegExp(email));
  assert.match(bringup, new RegExp(`E2E_INVENTORY_MANAGER_EMAIL=${email}`));
  assert.match(bringup, /process\.env\["CI"\] !== "true"/);
  assert.match(
    bringup,
    /function supabase\([\s\S]*?maxBuffer: MAX_BUFFER[\s\S]*?\n}/,
  );
  assert.match(seed, /'position_code', r\.position_code/);
  assert.match(seed, /'provisioned_by', v_keeper/);
  assert.match(
    seed,
    /'owner'::text AS position_code, NULL::bigint AS branch_id/,
  );
  assert.doesNotMatch(seed, /'role', r\.role|sync_missing_permissions_from_template/);
  assert.match(
    tenantSeed,
    /SELECT 'a0000002-0000-4000-8000-000000000002'::uuid, t\.id,\s*NULL::bigint/,
  );
  assert.doesNotMatch(tenantSeed, /'role', 'owner'/);
  assert.match(bringup, /POS_NETWORK_GATE=off/);
  assert.doesNotMatch(bringup, /\.env\.local/);
  assert.match(packageManifest, /"build:e2e": "dotenv -e \.env\.test\.local -- next build/);
  assert.match(packageManifest, /"start:e2e": "dotenv -e \.env\.test\.local -- next start/);
  assert.match(ci, /pnpm --filter @comtammatu\/web build:e2e/);
  assert.match(ci, /E2E_WEB_COMMAND: pnpm start:e2e/);
  assert.match(authSetup, /resolveUserByEmail\(supabase, email\)/);
  assert.match(authSetup, /\.eq\("branch_kind", "branch"\)/);
  assert.match(authSetup, /\.eq\("code", "branch_manager"\)/);
  assert.match(authSetup, /\.eq\("id", manager\.userId\)/);
});
