import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { JwtClaims } from "@comtammatu/shared/auth";
import {
  resolveInventoryBranchScope,
  type InventoryBranchOption,
} from "../app/(protected)/inventory/_lib/inventory-scope";

const INVENTORY_SCOPE_SOURCE = readFileSync(
  new URL(
    "../app/(protected)/inventory/_lib/inventory-scope.ts",
    import.meta.url,
  ),
  "utf8",
);

const BRANCH_CONTEXT_SOURCE = readFileSync(
  new URL("../app/_lib/branch-context.ts", import.meta.url),
  "utf8",
);

const BRANCHES: InventoryBranchOption[] = [
  { id: 1, name: "Branch 1", branch_kind: "branch" },
  { id: 2, name: "Branch 2", branch_kind: "branch" },
  { id: 10, name: "Central Kitchen", branch_kind: "central_kitchen" },
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

function fakeSupabase(rows: InventoryBranchOption[] | null, error: unknown) {
  const filters: Record<string, unknown> = {};
  const query = {
    eq(column: string, value: unknown) {
      filters[column] = value;
      return query;
    },
    async order(column: string) {
      assert.equal(column, "id");
      return { data: rows, error };
    },
  };
  const supabase = {
    from(table: string) {
      assert.equal(table, "branches");
      return {
        select(columns: string) {
          assert.equal(columns, "id, name, branch_kind");
          return query;
        },
      };
    },
  };
  return { supabase: supabase as never, filters };
}

test("inventory-scope no longer owns a branches query — engine is shared", () => {
  assert.doesNotMatch(INVENTORY_SCOPE_SOURCE, /\.from\(/);
  assert.doesNotMatch(INVENTORY_SCOPE_SOURCE, /supabase\s*\n?\s*\.from/);
  assert.match(INVENTORY_SCOPE_SOURCE, /from "@\/_lib\/branch-context"/);
  assert.match(INVENTORY_SCOPE_SOURCE, /fetchActiveBranches/);
  assert.match(INVENTORY_SCOPE_SOURCE, /selectBranchScope/);
  assert.match(INVENTORY_SCOPE_SOURCE, /TENANT_LEVEL_ROLES/);

  const branchQueries = BRANCH_CONTEXT_SOURCE.match(/\.from\("branches"\)/g);
  assert.equal(branchQueries?.length, 1);
});

test("adapter -> office sees every active branch kind and can select all", async () => {
  const { supabase, filters } = fakeSupabase(BRANCHES, null);

  const scope = await resolveInventoryBranchScope(
    supabase,
    claims("office", null),
    null,
  );

  assert.deepEqual(filters, { tenant_id: 1, is_active: true });
  assert.deepEqual(Object.keys(scope).sort(), [
    "allowedBranches",
    "canSelectAll",
    "defaultBranchId",
    "selectedBranchId",
  ]);
  assert.deepEqual(
    scope.allowedBranches.map((branch) => branch.id),
    [1, 2, 10],
  );
  assert.equal(scope.canSelectAll, true);
  assert.equal(scope.selectedBranchId, 1);
  assert.equal(scope.defaultBranchId, 1);
});

test("adapter -> requested branch wins only when allowed", async () => {
  const owner = await resolveInventoryBranchScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("owner", 1),
    10,
  );
  assert.equal(owner.selectedBranchId, 10);
  assert.equal(owner.defaultBranchId, 1);

  const cashier = await resolveInventoryBranchScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("cashier", 2),
    1,
  );
  assert.deepEqual(
    cashier.allowedBranches.map((branch) => branch.id),
    [2],
  );
  assert.equal(cashier.canSelectAll, false);
  assert.equal(cashier.selectedBranchId, 2);
});

test("adapter -> nothing allowed yields empty scope with null selection", async () => {
  const scope = await resolveInventoryBranchScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("cashier", null),
    1,
  );

  assert.deepEqual(scope.allowedBranches, []);
  assert.equal(scope.canSelectAll, false);
  assert.equal(scope.selectedBranchId, null);
  assert.equal(scope.defaultBranchId, null);
});

test("adapter -> query error degrades to empty scope, canSelectAll intact", async () => {
  const scope = await resolveInventoryBranchScope(
    fakeSupabase(null, new Error("boom")).supabase,
    claims("owner", null),
    null,
  );

  assert.deepEqual(scope.allowedBranches, []);
  assert.equal(scope.canSelectAll, true);
  assert.equal(scope.selectedBranchId, null);
  assert.equal(scope.defaultBranchId, null);
});
