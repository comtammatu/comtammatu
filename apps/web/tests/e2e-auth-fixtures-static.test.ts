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
  const email = "manager.datdo@comtammatu.vn";

  assert.match(seed, new RegExp(email));
  assert.match(bringup, new RegExp(`E2E_INVENTORY_MANAGER_EMAIL=${email}`));
  assert.match(bringup, /process\.env\["CI"\] !== "true"/);
  assert.equal([...bringup.matchAll(/maxBuffer: MAX_BUFFER/g)].length, 2);
  assert.match(seed, /'position_code', r\.position_code/);
  assert.match(seed, /'provisioned_by', v_keeper/);
  assert.match(
    seed,
    /'owner'::text AS position_code, NULL::bigint AS branch_id/,
  );
  assert.doesNotMatch(seed, /'role', r\.role|sync_missing_permissions_from_template/);
  assert.match(
    tenantSeed,
    /SELECT 'a0000002-0000-4000-8000-000000000002'::uuid, t\.id,\s*NULL::bigint,/,
  );
  assert.doesNotMatch(tenantSeed, /'role', 'owner'/);
  assert.match(bringup, /POS_NETWORK_GATE=off/);
  assert.doesNotMatch(bringup, /\.env\.local/);
  assert.match(packageManifest, /"build:e2e": "dotenv -e \.env\.test\.local -- next build/);
  assert.match(packageManifest, /"start:e2e": "dotenv -e \.env\.test\.local -- next start"/);
  assert.match(ci, /pnpm --filter @comtammatu\/web build:e2e/);
  assert.match(ci, /E2E_WEB_COMMAND: pnpm start:e2e/);
  assert.match(authSetup, /resolveUserByEmail\(supabase, email\)/);
  assert.match(authSetup, /\.eq\("branch_kind", "branch"\)/);
  assert.match(authSetup, /\.eq\("code", "branch_manager"\)/);
  assert.match(authSetup, /\.eq\("id", manager\.userId\)/);
});

test("Cloud DEV Greenfield fixture is minimal and fails closed", () => {
  const seed = read("../../supabase/_cloud-dev/matu-greenfield-owner-seed.sql");

  assert.match(seed, /xrsantkidwknjhcgcfmi/);
  assert.match(seed, /greenfield_owner_seed_requires_empty_target/);
  assert.match(seed, /SET LOCAL session_replication_role = replica/);
  assert.equal([...seed.matchAll(/INSERT INTO auth\.users/g)].length, 1);
  assert.doesNotMatch(
    seed,
    /INSERT INTO auth\.identities \([\s\S]*?\n\s*email,/,
  );
  assert.equal([...seed.matchAll(/INSERT INTO public\.tenants/g)].length, 1);
  assert.equal([...seed.matchAll(/INSERT INTO public\.branches/g)].length, 1);
  assert.equal([...seed.matchAll(/INSERT INTO public\.positions/g)].length, 1);
  assert.equal([...seed.matchAll(/INSERT INTO public\.profiles/g)].length, 1);
  assert.match(seed, /greenfield_owner_seed_postcondition_failed/);
  assert.doesNotMatch(seed, /\b(?:DELETE|TRUNCATE|DROP)\b/i);
});

test("Cloud DEV G3b sale fixture is one-shot and cannot target a real printer", () => {
  const seed = read("../../supabase/_cloud-dev/g3b-sale-spine-seed.sql");

  assert.match(seed, /xrsantkidwknjhcgcfmi/);
  assert.match(
    seed,
    /g3b_sale_spine_seed_requires_empty_operational_catalog/,
  );
  assert.match(seed, /g3b_sale_spine_seed_postcondition_failed/);
  assert.match(seed, /'Greenfield Sale Spine 25K'/);
  assert.match(seed, /25000/);
  assert.match(seed, /'192\.0\.2\.1'/);
  assert.match(seed, /'192\.0\.2\.2'/);
  assert.doesNotMatch(seed, /iexwsuaqqenyjiskawoj/);
  assert.doesNotMatch(seed, /\b(?:DELETE|TRUNCATE|DROP)\b/i);
});

test("Cloud DEV G3c fixture seeds only master and completed HR evidence", () => {
  const seed = read("../../supabase/_cloud-dev/g3c-operating-spine-seed.sql");

  assert.match(seed, /xrsantkidwknjhcgcfmi/);
  assert.match(seed, /g3c_operating_spine_seed_requires_clean_slice/);
  assert.match(seed, /g3c_operating_spine_seed_requires_g3b_attestation_state/);
  assert.match(seed, /g3c_operating_spine_seed_postcondition_failed/);
  assert.match(seed, /'Greenfield G3c Supplier'/);
  assert.match(seed, /'inv_stocktake_redesigned'/);
  assert.match(seed, /'GF-G3C-FINISHED'/);
  assert.match(seed, /'GF-G3C-CONTRACT-001'/);
  assert.match(seed, /DATE '2026-07-17'/);
  assert.match(seed, /INSERT INTO public\.shifts[\s\S]*?v_tenant_id,\s*NULL,/);
  assert.doesNotMatch(seed, /INSERT INTO public\.(?:goods_received_notes|production_runs|stocktake_sessions|payroll_periods|payroll_entries)/);
  assert.doesNotMatch(seed, /iexwsuaqqenyjiskawoj/);
  assert.doesNotMatch(seed, /\b(?:DELETE|TRUNCATE|DROP)\b/i);
});
