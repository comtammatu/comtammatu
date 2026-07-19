import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { resolveSoleBranchWarehouse } from "../lib/inventory/grn-create-model";

const repoRoot = resolve(process.cwd(), "../..");

test("GRN resolves the only active Branch warehouse", () => {
  assert.deepEqual(resolveSoleBranchWarehouse([{ id: 17 }]), {
    kind: "resolved",
    locationId: 17,
  });
});

test("GRN fails closed when the Branch has no active warehouse", () => {
  assert.deepEqual(resolveSoleBranchWarehouse([]), { kind: "missing" });
});

test("GRN fails closed when active Branch warehouses are ambiguous", () => {
  assert.deepEqual(resolveSoleBranchWarehouse([{ id: 17 }, { id: 18 }]), {
    kind: "ambiguous",
  });
});

test("createGrnDraft owns sole-warehouse resolution at the server boundary", () => {
  const actionSource = readFileSync(
    resolve(repoRoot, "apps/web/app/(protected)/inventory/grn-actions.ts"),
    "utf8",
  );
  const controllerSource = readFileSync(
    resolve(repoRoot, "apps/web/lib/inventory/use-grn-create-controller.ts"),
    "utf8",
  );

  assert.equal(
    actionSource.match(/\.eq\("location_kind", "warehouse"\)/g)?.length,
    2,
  );
  assert.match(actionSource, /\.limit\(2\)/);
  assert.doesNotMatch(actionSource, /\.eq\("is_default_receive", true\)/);
  assert.match(controllerSource, /branchLocationCount > 1/);
  assert.doesNotMatch(
    controllerSource,
    /if \(!locationId\) \{\s*setSubmitError\(GRN_CREATE_COPY\.toastChooseLocation\);/,
  );
});
