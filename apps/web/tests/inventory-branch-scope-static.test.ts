import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { JwtClaims } from "@comtammatu/shared/auth";
import {
  resolveInventoryBranchScope,
  resolveInventoryListScope,
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
    position_code: role === "branch_staff" ? "cleaner" : role,
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
  assert.match(INVENTORY_SCOPE_SOURCE, /INVENTORY_TENANT_READ_ROLES/);

  const branchQueries = BRANCH_CONTEXT_SOURCE.match(/\.from\("branches"\)/g);
  assert.equal(branchQueries?.length, 1);
});

test("inventory-scope's list-scope reader delegates to the shared resolveListScope engine (D058 W3b)", () => {
  assert.match(INVENTORY_SCOPE_SOURCE, /resolveInventoryListScope/);
  assert.match(INVENTORY_SCOPE_SOURCE, /resolveListScope/);
  assert.match(INVENTORY_SCOPE_SOURCE, /from "@\/_lib\/branch-context"/);
});

test("shared inventory PageContents and extracted loaders route scope-read through resolveInventoryListScope (D058 W3b)", () => {
  const legacyDualityPattern =
    /routeBranchId\s*\?\?\s*\(await resolveRequestedBranchId/;

  const pageContentFiles = [
    "transfers/page.tsx",
    "stocktake/page.tsx",
    "stocktake/new/page.tsx",
    "issues/issues-page-content.tsx",
  ];

  for (const relPath of pageContentFiles) {
    const source = readFileSync(
      new URL(`../app/(protected)/inventory/${relPath}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      legacyDualityPattern,
      `${relPath} still hand-rolls the routeBranchId/query duality`,
    );
    assert.match(
      source,
      /resolveInventoryListScope/,
      `${relPath} does not use the unified list-scope engine`,
    );
  }

  const stockLoaderSource = readFileSync(
    new URL("../lib/inventory/stock-on-hand-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(stockLoaderSource, legacyDualityPattern);
  assert.match(stockLoaderSource, /resolveInventoryListScope/);

  const stockDetailLoaderSource = readFileSync(
    new URL("../lib/inventory/stock-on-hand-detail-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(stockDetailLoaderSource, legacyDualityPattern);
  assert.match(stockDetailLoaderSource, /resolveInventoryListScope/);

  const grnListLoaderSource = readFileSync(
    new URL("../lib/inventory/grn-list-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(grnListLoaderSource, legacyDualityPattern);
  assert.match(grnListLoaderSource, /resolveInventoryListScope/);

  const transferCreateLoaderSource = readFileSync(
    new URL("../lib/inventory/transfer-create-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(transferCreateLoaderSource, legacyDualityPattern);
  assert.match(transferCreateLoaderSource, /resolveInventoryListScope/);

  const transferDetailLoaderSource = readFileSync(
    new URL("../lib/inventory/transfer-detail-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(transferDetailLoaderSource, legacyDualityPattern);
  assert.match(transferDetailLoaderSource, /resolveInventoryListScope/);

  const wasteApprovalsLoaderSource = readFileSync(
    new URL("../lib/inventory/waste-approvals-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(wasteApprovalsLoaderSource, legacyDualityPattern);
  assert.match(wasteApprovalsLoaderSource, /resolveInventoryListScope/);
});

test("adapter -> owner sees every active branch kind and can select all", async () => {
  const { supabase, filters } = fakeSupabase(BRANCHES, null);

  const scope = await resolveInventoryBranchScope(
    supabase,
    claims("owner", null),
    null,
  );

  assert.deepEqual(filters, { tenant_id: 1, is_active: true });
  assert.deepEqual(Object.keys(scope).sort(), [
    "allowedBranches",
    "canSelectAll",
    "defaultBranchId",
    "scopeMode",
    "selectedBranchId",
  ]);
  assert.deepEqual(
    scope.allowedBranches.map((branch) => branch.id),
    [1, 2, 10],
  );
  assert.equal(scope.canSelectAll, true);
  assert.equal(scope.scopeMode, "site");
  assert.equal(scope.selectedBranchId, 1);
  assert.equal(scope.defaultBranchId, 1);
});

test("adapter -> central_supply_ops sees every active branch kind and defaults to own central site", async () => {
  const { supabase, filters } = fakeSupabase(BRANCHES, null);

  const scope = await resolveInventoryBranchScope(
    supabase,
    claims("central_supply_ops", 10),
    null,
  );

  assert.deepEqual(filters, { tenant_id: 1, is_active: true });
  assert.deepEqual(
    scope.allowedBranches.map((branch) => branch.id),
    [1, 2, 10],
  );
  assert.equal(scope.canSelectAll, true);
  assert.equal(scope.scopeMode, "site");
  assert.equal(scope.selectedBranchId, 10);
  assert.equal(scope.defaultBranchId, 10);
});

test("adapter -> requestAll yields scopeMode all with null selection for tenant-wide roles", async () => {
  const scope = await resolveInventoryBranchScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("owner", 1),
    null,
    { requestAll: true },
  );
  assert.equal(scope.canSelectAll, true);
  assert.equal(scope.scopeMode, "all");
  assert.equal(scope.selectedBranchId, null);
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

/* ─── resolveInventoryListScope (D058 W3b — one engine for both scope-read paths) ─── */

test("list scope -> embedded routeBranchId and office ?branch= resolve through the identical selectBranchScope call", async () => {
  // Same owner claims requesting the same branch (2) two ways: as a
  // validated URL segment (embedded/br runtime) and as a raw ?branch=
  // query string (office plane). Both must land on the exact same
  // selection — proving there is one engine, not two parallel readers.
  const embedded = await resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("owner", 1),
    { routeBranchId: 2 },
  );
  const office = await resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("owner", 1),
    { queryBranch: "2" },
  );

  assert.deepEqual(
    { ...embedded, outOfScope: undefined },
    { ...office, outOfScope: undefined },
  );
  assert.equal(embedded.selectedBranchId, 2);
  assert.equal(embedded.outOfScope, false);
  assert.equal(office.outOfScope, false);
});

test("list scope -> routeBranchId always wins over a conflicting query value", () => {
  return resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("owner", 1),
    { routeBranchId: 2, queryBranch: "10" },
  ).then((scope) => {
    assert.equal(scope.selectedBranchId, 2);
    assert.equal(scope.outOfScope, false);
  });
});

test("list scope -> embedded branch outside the caller's allowed set flags outOfScope", async () => {
  const scope = await resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("cashier", 2),
    { routeBranchId: 1 },
  );

  assert.equal(scope.selectedBranchId, 2);
  assert.equal(scope.outOfScope, true);
});

test("list scope -> office ?branch= never triggers outOfScope, only clamps the selection", async () => {
  const scope = await resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("cashier", 2),
    { queryBranch: "1" },
  );

  assert.equal(scope.selectedBranchId, 2);
  assert.equal(scope.outOfScope, false);
});

test("list scope -> malformed query branch falls back to all for tenant-wide roles", async () => {
  const scope = await resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("owner", null),
    { queryBranch: "not-a-number" },
  );

  assert.equal(scope.scopeMode, "all");
  assert.equal(scope.selectedBranchId, null);
  assert.equal(scope.defaultBranchId, 1);
  assert.equal(scope.outOfScope, false);
});

test("list scope -> explicit branch=all aggregates for tenant-wide roles", async () => {
  const scope = await resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("owner", 1),
    { queryBranch: "all" },
  );
  assert.equal(scope.scopeMode, "all");
  assert.equal(scope.selectedBranchId, null);
});

test("list scope -> branch-scoped role with null branch_id (unassigned) yields empty scope", async () => {
  const scope = await resolveInventoryListScope(
    fakeSupabase(BRANCHES, null).supabase,
    claims("branch_manager", null),
    { routeBranchId: 1 },
  );

  assert.deepEqual(scope.allowedBranches, []);
  assert.equal(scope.selectedBranchId, null);
  assert.equal(scope.outOfScope, true);
});
