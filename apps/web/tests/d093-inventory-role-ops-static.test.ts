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
  assert.match(permissions, /PERMISSION_KEY_COUNT = 91/);
});

test("D093 default_fulfill_site_kind is granted to authenticated after column lockdown", () => {
  assert.match(
    fulfillKindGrantMigration,
    /GRANT SELECT \(default_fulfill_site_kind\) ON public\.ingredients TO authenticated/,
  );
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

test("D093 tenant fixture grants request_create to branch_manager", () => {
  assert.match(tenantFixture, /inventory:request_create/);
  assert.match(
    tenantFixture,
    /'branch_manager'[\s\S]*inventory:request_create/,
  );
});
