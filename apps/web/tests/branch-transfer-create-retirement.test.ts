import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("Branch transfer creation has no route or navigation entry", () => {
  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
  ]) {
    assert.equal(exists(path), false, path);
  }

  const branchList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const operatorNav = read("packages/shared/src/auth/nav-config.ts");
  for (const source of [branchList, operatorNav]) {
    assert.doesNotMatch(source, /stock\/transfer\/new/);
  }
  assert.doesNotMatch(
    branchList,
    /BranchOperatorActionSection|fetchBranchesForTransfer/,
  );

  for (const source of [
    read("apps/web/lib/inventory/transfer-create-model.ts"),
    read("apps/web/lib/inventory/use-transfer-create-controller.ts"),
    read(
      "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
    ),
    read(
      "apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx",
    ),
  ]) {
    assert.doesNotMatch(
      source,
      /branch_manager|isBranchManager|canCreateInboundRequest|inboundFromBranchId|requestGoods/,
    );
  }

  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/page.tsx",
    "apps/web/app/(protected)/inventory/transfers/new/page.tsx",
  ]) {
    assert.equal(exists(path), true, path);
  }
});

test("direct Branch action invocation cannot call the transfer RPC", () => {
  const fixture = resolve(
    repoRoot,
    "apps/web/tests/fixtures/branch-transfer-action-denial.fixture.ts",
  );
  const result = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", "tsx", fixture],
    {
      cwd: resolve(repoRoot, "apps/web"),
      encoding: "utf8",
    },
  );

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
});

test("transfer creation RPC rejects every non-Owner role before writes", () => {
  const source = read(
    "supabase/migrations/20260719165715_restrict_stock_transfer_creation_to_owner.sql",
  );

  const ownerGate = source.indexOf("v_role IS DISTINCT FROM 'owner'");
  const firstWrite = source.indexOf("INSERT INTO public.stock_transfers");

  assert.ok(ownerGate > -1);
  assert.ok(firstWrite > ownerGate);
  assert.match(
    source,
    /stock_transfer_create_owner_only' USING ERRCODE = '42501'/,
  );
  assert.match(source, /SET is_delegable_to_staff = false/);
  assert.match(
    source,
    /array_remove\(permission_keys, 'inventory:transfer_create'\)/,
  );
  assert.doesNotMatch(source, /v_branch_claim|branch_manager/);
});
