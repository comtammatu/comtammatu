import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const productionRoles = readFileSync(
  "app/(protected)/inventory/_lib/production-roles.ts",
  "utf8",
);
const procurementBranches = readFileSync(
  "app/(protected)/inventory/_lib/procurement-branches.ts",
  "utf8",
);
const inventoryNav = readFileSync(
  "app/(protected)/inventory/_lib/inventory-nav.ts",
  "utf8",
);
const inventoryDashboard = readFileSync(
  "app/(protected)/inventory/dashboard-client.tsx",
  "utf8",
);
const stockRequestInbox = readFileSync(
  "app/(protected)/inventory/stock-requests/page.tsx",
  "utf8",
);
const navConfig = readFileSync(
  "../../packages/shared/src/auth/nav-config.ts",
  "utf8",
);
const branchGrnPage = readFileSync(
  "app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx",
  "utf8",
);
const migration = readFileSync(
  "../../supabase/migrations/20260729140000_d093_central_grn_branch_stock_request.sql",
  "utf8",
);
const fulfillKindGrantMigration = readFileSync(
  "../../supabase/migrations/20260729140500_grant_ingredients_default_fulfill_site_kind.sql",
  "utf8",
);
const atomicCatalogMigration = readFileSync(
  "../../supabase/migrations/20260729150305_save_ingredient_catalog_atomic.sql",
  "utf8",
);
const ingredientActions = readFileSync(
  "app/(protected)/inventory/ingredient-actions.ts",
  "utf8",
);
const stockRequestScopeMigration = readFileSync(
  "../../supabase/migrations/20260729170000_scope_stock_request_reads_by_fulfill_source.sql",
  "utf8",
);
const stockRequestScopeAnonRevokeMigration = readFileSync(
  "../../supabase/migrations/20260729170100_revoke_anon_stock_request_scope_helper.sql",
  "utf8",
);
const permissions = readFileSync(
  "../../packages/shared/src/auth/permissions.ts",
  "utf8",
);
const tenantFixture = readFileSync(
  "tests/fixtures/supabase-e2e/tenant.sql",
  "utf8",
);

test("D093 production roles exclude branch_manager and branch kind", () => {
  assert.match(productionRoles, /central_kitchen_lead/);
  assert.doesNotMatch(
    productionRoles,
    /PRODUCTION_OPERATOR_ROLES = \[[^\]]*branch_manager/,
  );
  assert.doesNotMatch(
    productionRoles,
    /PRODUCTION_BRANCH_KINDS = \[[^\]]*"branch"/,
  );
});

test("D093 procurement sites are central-only", () => {
  assert.match(procurementBranches, /central_supply/);
  assert.match(procurementBranches, /central_kitchen/);
  assert.doesNotMatch(
    procurementBranches,
    /PROCUREMENT_SITE_KINDS = \[[^\]]*"branch"/,
  );
});

test("D093 migration and permission keys register stock request surface", () => {
  assert.match(migration, /stock_requests/);
  assert.match(migration, /default_fulfill_site_kind/);
  assert.match(migration, /inventory:request_create/);
  assert.match(migration, /grn_central_site_only/);
  assert.match(permissions, /INVENTORY_REQUEST_CREATE/);
  assert.match(permissions, /PERMISSION_KEY_COUNT = 92/);
});

test("D093 default_fulfill_site_kind is granted to authenticated after column lockdown", () => {
  assert.match(
    fulfillKindGrantMigration,
    /GRANT SELECT \(default_fulfill_site_kind\) ON public\.ingredients TO authenticated/,
  );
});

test("ingredient catalog save is atomic and keeps direct table DML locked", () => {
  assert.match(
    atomicCatalogMigration,
    /CREATE FUNCTION public\.save_ingredient_catalog\(/,
  );
  assert.match(atomicCatalogMigration, /SECURITY DEFINER/);
  assert.match(atomicCatalogMigration, /SET search_path TO ''/);
  assert.match(
    atomicCatalogMigration,
    /private\.execute_upsert_ingredient_catalog\(/,
  );
  assert.match(
    atomicCatalogMigration,
    /UPDATE public\.ingredients AS ingredient[\s\S]*default_fulfill_site_kind/,
  );
  assert.match(
    atomicCatalogMigration,
    /REVOKE ALL ON FUNCTION public\.save_ingredient_catalog\([\s\S]*FROM PUBLIC, anon/,
  );
  assert.match(
    atomicCatalogMigration,
    /GRANT EXECUTE ON FUNCTION public\.save_ingredient_catalog\([\s\S]*TO authenticated, service_role/,
  );
  assert.doesNotMatch(
    atomicCatalogMigration,
    /GRANT (?:INSERT|UPDATE|DELETE)[\s\S]*ON (?:TABLE )?public\.ingredients/,
  );
});

test("all ingredient save actions use the atomic RPC without direct ingredient update", () => {
  assert.equal(
    ingredientActions.match(/\.rpc\(\s*"save_ingredient_catalog"/g)?.length,
    3,
  );
  assert.doesNotMatch(
    ingredientActions,
    /\.from\("ingredients"\)[\s\S]{0,200}\.update\(/,
  );
  assert.match(
    ingredientActions,
    /\.select\("shelf_life_days, default_fulfill_site_kind"\)/,
  );
  assert.doesNotMatch(ingredientActions, /persistDefaultFulfillSiteKind/);
});

test("D093 nav-config exposes branch stock requests tile", () => {
  assert.match(navConfig, /hrefTemplate: "\/br\/\{branchId\}\/stock\/requests"/);
  assert.match(navConfig, /label: "Yêu cầu hàng"/);
});

test("D093 branch GRN list route redirects to stock requests", () => {
  assert.match(
    branchGrnPage,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests`\)/,
  );
  assert.doesNotMatch(branchGrnPage, /BranchGrnListClient|loadGrnListPageData/);
});

test("D093 inventory-nav includes stock-requests inbox", () => {
  assert.match(inventoryNav, /href: "\/inventory\/stock-requests"/);
  assert.match(inventoryNav, /label: "Yêu cầu hàng"/);
});

test("D093 central operators do not see owner-only dashboard actions or stock value", () => {
  assert.match(
    inventoryDashboard,
    /role === "central_supply_ops" \|\| role === "central_kitchen_lead"/,
  );
  assert.match(inventoryDashboard, /isCentralOperator \? paths\.stockRequests/);
  assert.match(inventoryDashboard, /\.\.\.\(!isCentralOperator/);
  assert.match(inventoryDashboard, /\{!isCentralOperator \? \(/);
});

test("D093 stock request inbox only lists pending lines for the actor source", () => {
  assert.match(stockRequestInbox, /stock_request_items!inner/);
  assert.match(
    stockRequestInbox,
    /\.eq\("stock_request_items\.fulfill_site_kind", actorFulfillKind\)/,
  );
  assert.match(
    stockRequestInbox,
    /\.eq\("stock_request_items\.status", "pending"\)/,
  );
});

test("D093 RLS limits fulfill actors to their assigned source lines", () => {
  assert.match(
    stockRequestScopeMigration,
    /WHEN 'central_supply_ops' THEN 'central_supply'/,
  );
  assert.match(
    stockRequestScopeMigration,
    /WHEN 'central_kitchen_lead' THEN 'central_kitchen'/,
  );
  assert.match(
    stockRequestScopeMigration,
    /item\.fulfill_site_kind = v_actor_fulfill_kind/,
  );
  assert.match(
    stockRequestScopeMigration,
    /public\.stock_request_actor_can_read\(\s*request_id,\s*fulfill_site_kind\s*\)/s,
  );
  assert.match(
    stockRequestScopeMigration,
    /DROP FUNCTION public\.stock_request_actor_can_read\(bigint\)/,
  );
  assert.match(
    stockRequestScopeAnonRevokeMigration,
    /REVOKE EXECUTE ON FUNCTION public\.stock_request_actor_can_read\(bigint, text\)\s+FROM anon/,
  );
});

test("D093 tenant fixture grants request_create to branch_manager", () => {
  assert.match(tenantFixture, /inventory:request_create/);
  assert.match(
    tenantFixture,
    /'branch_manager'[\s\S]*inventory:request_create/,
  );
});
