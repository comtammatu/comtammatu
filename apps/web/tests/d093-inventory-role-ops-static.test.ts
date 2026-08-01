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
const inventoryHome = readFileSync(
  "app/(protected)/inventory/_lib/inventory-home.ts",
  "utf8",
);
const stockRequestInbox = readFileSync(
  "app/(protected)/inventory/stock-requests/page.tsx",
  "utf8",
);
const stockFulfillmentProjection = readFileSync(
  "lib/inventory/stock-fulfillment-projection.ts",
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
const catalogSaveMigration = readFileSync(
  "../../supabase/migrations/20260731182614_catalog_save_unit_roles.sql",
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
  assert.match(permissions, /PERMISSION_KEY_COUNT = 94/);
});

test("D093 default_fulfill_site_kind is granted to authenticated after column lockdown", () => {
  assert.match(
    fulfillKindGrantMigration,
    /GRANT SELECT \(default_fulfill_site_kind\) ON public\.ingredients TO authenticated/,
  );
});

test("ingredient catalog uses one atomic role-aware RPC", () => {
  assert.match(
    catalogSaveMigration,
    /CREATE FUNCTION public\.save_ingredient_catalog\(/,
  );
  assert.match(catalogSaveMigration, /SECURITY DEFINER/);
  assert.match(catalogSaveMigration, /SET search_path TO ''/);
  assert.match(
    catalogSaveMigration,
    /receipt_unit_id,\s+issue_unit_id, production_unit_id/,
  );
  assert.match(
    catalogSaveMigration,
    /DROP FUNCTION public\.save_ingredient_catalog_v2\(/,
  );
  assert.match(
    catalogSaveMigration,
    /DROP FUNCTION public\.upsert_ingredient_catalog\(/,
  );
  assert.match(
    catalogSaveMigration,
    /CREATE OR REPLACE FUNCTION private\.execute_bulk_import_ingredients\([\s\S]*receipt_unit_id, issue_unit_id/,
  );
  assert.match(
    catalogSaveMigration,
    /REVOKE ALL ON FUNCTION public\.save_ingredient_catalog\([\s\S]*FROM PUBLIC, anon/,
  );
  assert.match(
    catalogSaveMigration,
    /GRANT EXECUTE ON FUNCTION public\.save_ingredient_catalog\([\s\S]*TO authenticated, service_role/,
  );
  assert.doesNotMatch(
    ingredientActions,
    /save_ingredient_catalog_v2|upsert_ingredient_catalog/,
  );
});

test("all ingredient save actions use the atomic RPC without direct ingredient update", () => {
  assert.equal(
    ingredientActions.match(/saveIngredientCatalog\(/g)?.length,
    4,
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

test("D093 nav-config exposes one branch fulfillment hub", () => {
  assert.match(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer"/,
  );
  assert.match(navConfig, /label: "Giao nhận hàng"/);
  assert.doesNotMatch(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/requests"/,
  );
});

test("D093 branch GRN list route keeps branch redirect; central mounts list", () => {
  assert.match(branchGrnPage, /branch_kind === "branch"/);
  assert.match(
    branchGrnPage,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/transfer`\)/,
  );
  assert.match(branchGrnPage, /BranchGrnListClient|loadGrnListPageData/);
});

test("D093 inventory-nav includes one fulfillment hub", () => {
  assert.match(inventoryNav, /href: "\/inventory\/transfers"/);
  assert.match(inventoryNav, /label: "Giao nhận hàng"/);
  assert.match(inventoryNav, /"\/inventory\/stock-requests"/);
});

test("D093 inventory L0 landing is a redirect without hub dashboard", () => {
  assert.match(inventoryHome, /\/inventory\/stock/);
  assert.match(inventoryHome, /accountant/);
  assert.match(inventoryHome, /\/inventory\/grn/);
  assert.doesNotMatch(inventoryNav, /0 · Nay/);
  assert.doesNotMatch(inventoryNav, /href: "\/inventory",/);
});

test("D093 stock request inbox redirects and the hub scopes actor lines", () => {
  assert.match(
    stockRequestInbox,
    /redirect\("\/inventory\/transfers\?work=request"\)/,
  );
  assert.match(
    stockFulfillmentProjection,
    /item\.fulfillSiteKind === viewer\.fulfillSiteKind/,
  );
  assert.match(stockFulfillmentProjection, /item\.status === "pending"/);
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

test("D093 tenant fixture grants stock request permissions to requester roles", () => {
  const kitchenTemplate = tenantFixture.slice(
    tenantFixture.indexOf("('central_kitchen_lead', 'central_kitchen_lead'"),
    tenantFixture.indexOf("('branch_manager', 'branch_manager'"),
  );
  const branchTemplate = tenantFixture.slice(
    tenantFixture.indexOf("('branch_manager', 'branch_manager'"),
    tenantFixture.indexOf("('owner', 'owner'"),
  );

  for (const permission of [
    "inventory:request_cancel",
    "inventory:request_create",
    "inventory:request_submit",
  ]) {
    assert.match(kitchenTemplate, new RegExp(permission));
    assert.match(branchTemplate, new RegExp(permission));
  }
});
