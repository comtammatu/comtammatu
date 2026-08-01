import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("Branch transfer creation stays central-site only", () => {
  const createRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/page.tsx",
  );
  assert.equal(
    exists(
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
    ),
    false,
  );
  assert.match(createRoute, /branch_kind !== "central_supply"/);
  assert.match(createRoute, /branch_kind !== "central_kitchen"/);
  assert.match(createRoute, /redirect\(`\/br\/\$\{branchId\}\/stock\/transfer`\)/);

  const branchList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const operatorNav = read("packages/shared/src/auth/nav-config.ts");
  assert.match(branchList, /canCreateManualTransfer =\s*isCentralKind/);
  assert.match(branchList, /stock\/transfer\/new/);
  assert.doesNotMatch(operatorNav, /stock\/transfer\/new/);
  assert.doesNotMatch(branchList, /BranchOperatorActionSection|fetchBranchesForTransfer/);

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
