import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBranchIdParam,
  resolveBranchContext,
  resolveListScope,
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

test("selectOperatorBranchScope -> owner operates active branch-kind sites only", () => {
  const selected = selectOperatorBranchScope(
    claims("owner", null),
    BRANCHES,
    null,
  );

  assert.deepEqual(
    selected.allowedBranches.map((branch) => branch.id),
    [1, 2],
  );
  assert.equal(selected.currentBranchId, 1);
  assert.equal(selected.defaultBranchId, 1);
  assert.equal(selected.canSwitchBranch, true);
});

test("selectOperatorBranchScope -> requested operating branch wins only when allowed", () => {
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
    selectOperatorBranchScope(claims("owner", null), BRANCHES, 20)
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
  const selected = selectOperatorBranchScope(
    claims("cashier", 2),
    BRANCHES,
    null,
  );

  assert.deepEqual(
    selected.allowedBranches.map((branch) => branch.id),
    [2],
  );
  assert.equal(selected.currentBranchId, 2);
  assert.equal(selected.canSwitchBranch, false);
});

test("selectOperatorBranchScope -> branch-scoped roles never see central-kind sites", () => {
  const selected = selectOperatorBranchScope(
    claims("branch_manager", 1),
    BRANCHES,
    null,
  );

  assert.deepEqual(
    selected.allowedBranches.map((branch) => branch.id),
    [1],
  );
});

test("selectBranchScope -> tenant-wide roles see every branch kind", () => {
  const scope = selectBranchScope(claims("owner", null), BRANCHES, null, [
    "owner",
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
  const scope = selectBranchScope(claims("cashier", 2), BRANCHES, 1, ["owner"]);

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

  const context = await resolveBranchContext(
    supabase,
    claims("owner", null),
    2,
  );

  assert.equal(selectedColumns, "id, name, branch_kind");
  assert.deepEqual(filters, {
    tenant_id: 1,
    is_active: true,
  });
  assert.equal(context?.branchId, 2);
  assert.equal(context?.branch.id, 2);
  assert.equal(context?.role, "owner");

  const centralContext = await resolveBranchContext(
    supabase,
    claims("owner", null),
    10,
  );
  assert.equal(centralContext, null);
});

/* ─── parseBranchIdParam / resolveListScope (D058 W3b) ─── */

test("parseBranchIdParam -> parses a single numeric value, rejects malformed/non-positive input", () => {
  assert.equal(parseBranchIdParam("2"), 2);
  assert.equal(parseBranchIdParam(["2", "3"]), 2);
  assert.equal(parseBranchIdParam(undefined), null);
  assert.equal(parseBranchIdParam(""), null);
  assert.equal(parseBranchIdParam("0"), null);
  assert.equal(parseBranchIdParam("-1"), null);
  assert.equal(parseBranchIdParam("abc"), null);
  assert.equal(parseBranchIdParam("1.5"), null);
});

test("resolveListScope -> routeBranchId and Admin Dashboard queryBranchId resolve identically", () => {
  const tenantWideRoles: readonly JwtClaims["user_role"][] = ["owner"];

  const embedded = resolveListScope({}, claims("owner", 1), BRANCHES, {
    routeBranchId: 2,
    tenantWideRoles,
  });
  const adminDashboard = resolveListScope({}, claims("owner", 1), BRANCHES, {
    queryBranchId: "2",
    tenantWideRoles,
  });

  return Promise.all([embedded, adminDashboard]).then(
    ([embeddedScope, officeScope]) => {
      assert.equal(embeddedScope.selectedBranchId, 2);
      assert.equal(officeScope.selectedBranchId, 2);
      assert.deepEqual(
        embeddedScope.allowedBranches.map((b) => b.id),
        officeScope.allowedBranches.map((b) => b.id),
      );
      assert.equal(embeddedScope.canSelectAll, officeScope.canSelectAll);
      assert.equal(embeddedScope.defaultBranchId, officeScope.defaultBranchId);
      // outOfScope is embedded-only semantics — Admin Dashboard callers never notFound().
      assert.equal(embeddedScope.outOfScope, false);
      assert.equal(officeScope.outOfScope, false);
    },
  );
});

test("resolveListScope -> routeBranchId outside the allowed set flags outOfScope; queryBranchId never does", async () => {
  const tenantWideRoles: readonly JwtClaims["user_role"][] = ["owner"];

  const embedded = await resolveListScope({}, claims("cashier", 2), BRANCHES, {
    routeBranchId: 1,
    tenantWideRoles,
  });
  assert.equal(embedded.selectedBranchId, 2);
  assert.equal(embedded.outOfScope, true);

  const adminDashboard = await resolveListScope({}, claims("cashier", 2), BRANCHES, {
    queryBranchId: "1",
    tenantWideRoles,
  });
  assert.equal(adminDashboard.selectedBranchId, 2);
  assert.equal(adminDashboard.outOfScope, false);
});

test("resolveListScope -> routeBranchId always wins over a simultaneously-present queryBranchId", async () => {
  const tenantWideRoles: readonly JwtClaims["user_role"][] = ["owner"];

  const scope = await resolveListScope({}, claims("owner", null), BRANCHES, {
    routeBranchId: 10,
    queryBranchId: "2",
    tenantWideRoles,
  });

  assert.equal(scope.selectedBranchId, 10);
  assert.equal(scope.outOfScope, false);
});
