import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBranchContext,
  selectBranchScope,
  selectOperatorBranchScope,
  type OperatorBranchOption,
} from "../app/_lib/branch-context";
import type { JwtClaims } from "@comtammatu/shared/auth";

const BRANCHES: OperatorBranchOption[] = [
  { id: 1, name: "Branch 1", branch_kind: "branch" },
  { id: 2, name: "Branch 2", branch_kind: "branch" },
  { id: 10, name: "Central Kitchen", branch_kind: "central_kitchen" },
  { id: 20, name: "Central Supply", branch_kind: "central_supply" },
];

function claims(
  role: JwtClaims["user_role"],
  branchId: number | null,
): JwtClaims {
  return {
    tenant_id: 1,
    branch_id: branchId,
    user_role: role,
  };
}

test("selectOperatorBranchScope -> owner sees only operator branches and can switch", () => {
  const selected = selectOperatorBranchScope(claims("owner", null), BRANCHES, null);

  assert.deepEqual(
    selected.allowedBranches.map((branch) => branch.id),
    [1, 2],
  );
  assert.equal(selected.currentBranchId, 1);
  assert.equal(selected.defaultBranchId, 1);
  assert.equal(selected.canSwitchBranch, true);
});

test("selectOperatorBranchScope -> requested branch wins only when allowed", () => {
  assert.equal(
    selectOperatorBranchScope(claims("owner", null), BRANCHES, 2)
      .currentBranchId,
    2,
  );
  assert.equal(
    selectOperatorBranchScope(claims("owner", null), BRANCHES, 10)
      .currentBranchId,
    1,
  );
  assert.equal(
    selectOperatorBranchScope(claims("cashier", 2), BRANCHES, 1)
      .currentBranchId,
    2,
  );
});

test("selectOperatorBranchScope -> pinned staff only sees own branch", () => {
  const selected = selectOperatorBranchScope(claims("cashier", 2), BRANCHES, null);

  assert.deepEqual(
    selected.allowedBranches.map((branch) => branch.id),
    [2],
  );
  assert.equal(selected.currentBranchId, 2);
  assert.equal(selected.canSwitchBranch, false);
});

test("selectOperatorBranchScope -> office has no operator branch scope", () => {
  const selected = selectOperatorBranchScope(claims("office", null), BRANCHES, 1);

  assert.deepEqual(selected.allowedBranches, []);
  assert.equal(selected.currentBranchId, null);
  assert.equal(selected.defaultBranchId, null);
  assert.equal(selected.canSwitchBranch, false);
});

test("selectOperatorBranchScope -> warehouse manager operates only central_supply sites", () => {
  const selected = selectOperatorBranchScope(
    claims("warehouse_manager", null),
    BRANCHES,
    null,
  );

  assert.deepEqual(
    selected.allowedBranches.map((branch) => branch.id),
    [20],
  );
  assert.equal(selected.currentBranchId, 20);
  assert.equal(selected.canSwitchBranch, false);
});

test("selectOperatorBranchScope -> production manager operates only central_kitchen sites", () => {
  const selected = selectOperatorBranchScope(
    claims("production_manager", null),
    BRANCHES,
    null,
  );

  assert.deepEqual(
    selected.allowedBranches.map((branch) => branch.id),
    [10],
  );
  assert.equal(selected.currentBranchId, 10);
});

test("selectOperatorBranchScope -> central-site roles cannot select regular or foreign-kind sites", () => {
  assert.equal(
    selectOperatorBranchScope(claims("warehouse_manager", null), BRANCHES, 1)
      .currentBranchId,
    20,
  );
  assert.equal(
    selectOperatorBranchScope(claims("warehouse_manager", null), BRANCHES, 10)
      .currentBranchId,
    20,
  );
});

test("selectBranchScope -> tenant-wide roles see every branch kind", () => {
  const scope = selectBranchScope(claims("office", null), BRANCHES, null, [
    "owner",
    "office",
  ]);

  assert.deepEqual(
    scope.allowedBranches.map((branch) => branch.id),
    [1, 2, 10, 20],
  );
  assert.equal(scope.canSelectAll, true);
  assert.equal(scope.selectedBranchId, 1);
  assert.equal(scope.defaultBranchId, 1);
});

test("selectBranchScope -> pinned role locked to own branch, requested ignored", () => {
  const scope = selectBranchScope(claims("cashier", 2), BRANCHES, 1, [
    "owner",
    "office",
  ]);

  assert.deepEqual(
    scope.allowedBranches.map((branch) => branch.id),
    [2],
  );
  assert.equal(scope.canSelectAll, false);
  assert.equal(scope.selectedBranchId, 2);
});

test("selectBranchScope -> no allowed branches yields null selection", () => {
  const scope = selectBranchScope(claims("cashier", null), BRANCHES, 1, [
    "owner",
  ]);

  assert.deepEqual(scope.allowedBranches, []);
  assert.equal(scope.selectedBranchId, null);
  assert.equal(scope.defaultBranchId, null);
  assert.equal(scope.canSelectAll, false);
});

test("resolveBranchContext queries active sites once and returns current branch", async () => {
  const filters: Record<string, unknown> = {};
  let selectedColumns = "";

  const query = {
    eq(column: string, value: unknown) {
      filters[column] = value;
      return query;
    },
    async order(column: string) {
      assert.equal(column, "id");
      return { data: BRANCHES, error: null };
    },
  };

  const supabase = {
    from(table: string) {
      assert.equal(table, "branches");
      return {
        select(columns: string) {
          selectedColumns = columns;
          return query;
        },
      };
    },
  };

  const context = await resolveBranchContext(supabase, claims("owner", null), 2);

  assert.equal(selectedColumns, "id, name, branch_kind");
  assert.deepEqual(filters, {
    tenant_id: 1,
    is_active: true,
  });
  assert.equal(context?.branchId, 2);
  assert.equal(context?.branch.id, 2);
  assert.equal(context?.role, "owner");
});
