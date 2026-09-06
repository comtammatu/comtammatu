import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function listBranchFiles(dir: string): string[] {
  const absDir = resolve(repoRoot, dir);
  return readdirSync(absDir).flatMap((entry) => {
    const absPath = join(absDir, entry);
    const relPath = `${dir}/${entry}`;
    if (statSync(absPath).isDirectory()) {
      return listBranchFiles(relPath);
    }
    return /\.(?:ts|tsx)$/.test(entry) ? [relPath] : [];
  });
}

test("Branch surface plane strictly adheres to universal 48px touch target with zero 44px remnants", () => {
  const branchFiles = listBranchFiles("apps/web/app/(protected)/br");
  const legacy44pxOffenders: string[] = [];

  for (const file of branchFiles) {
    const content = read(file);
    if (/\bmin-h-11\b/.test(content) || /\bh-11\b/.test(content)) {
      legacy44pxOffenders.push(file);
    }
  }

  assert.deepEqual(
    legacy44pxOffenders,
    [],
    `Found legacy 44px (min-h-11 or h-11) in branch surface files: ${legacy44pxOffenders.join(", ")}. All touch controls must use universal 48px standard (min-h-12 / size="touch").`,
  );
});

test("Operator desktop navigation includes all station shortcuts", () => {
  const desktopNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-desktop-nav.tsx",
  );
  assert.match(desktopNav, /hasPosAccess/);
  assert.match(desktopNav, /hasKdsAccess/);
  assert.match(desktopNav, /hasPickupAccess/);
  assert.match(desktopNav, /messages\.operator\.nav\.pickupStation/);
  assert.match(desktopNav, /\/br\/\$\{branchId\}\/pickup/);
});

test("Branch inner screens implement responsive desktop multi-column layouts", () => {
  const closeDay = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/close-day-client.tsx",
  );
  const orders = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
  );
  const teamBoard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/team-board-client.tsx",
  );

  // Close-day financial and operational panels densify into 2-column grid on desktop
  assert.match(
    closeDay,
    /grid gap-4 lg:grid-cols-2/,
    "CloseDayClient must use 2-column grid for financial metrics on lg+",
  );

  // Orders list card grid expands responsively
  assert.match(
    orders,
    /sm:grid sm:grid-cols-2 lg:grid-cols-3/,
    "OperatorOrdersClient must provide responsive multi-column item grid",
  );

  // Team board shift groups expand responsively on desktop
  assert.match(
    teamBoard,
    /grid gap-1\.5 lg:grid-cols-2/,
    "TeamBoardMobileGroups must provide 2-column card grid on lg+",
  );
});

test("Role gating strictly empowers branch_manager while isolating subordinate roles", () => {
  // Branch Manager has full branch day-management authority
  const managerModules: ModuleKey[] = [
    "branch_home",
    "branch_dashboard",
    "branch_settings",
    "branch_menu_limits",
    "branch_pos_sessions",
    "branch_close_day",
    "branch_team",
    "branch_stock",
    "branch_orders",
    "branch_feedback",
    "employee_checkout_approvals",
    "employee_leave_approvals",
    "branch_shift_roster",
    "branch_shift_attendance",
    "pos",
    "kds",
    "pickup",
  ];

  for (const mod of managerModules) {
    assert.equal(
      canAccess("branch_manager", mod),
      true,
      `branch_manager must have access to ${mod}`,
    );
  }

  // Subordinate station roles (branch_staff, cashier, chef) must NOT access management modules
  const sensitiveManagementModules: ModuleKey[] = [
    "branch_settings",
    "branch_pos_sessions",
    "branch_close_day",
    "branch_team",
    "employee_checkout_approvals",
    "employee_leave_approvals",
    "branch_shift_roster",
    "branch_shift_attendance",
    "branch_feedback",
  ];

  for (const mod of sensitiveManagementModules) {
    assert.equal(
      canAccess("branch_staff", mod),
      false,
      `branch_staff must NOT have access to ${mod}`,
    );
    assert.equal(
      canAccess("cashier", mod),
      false,
      `cashier must NOT have access to ${mod}`,
    );
    assert.equal(
      canAccess("chef", mod),
      false,
      `chef must NOT have access to ${mod}`,
    );
  }
});

test("Branch stock sub-screens implement responsive desktop multi-column layouts", () => {
  const stockDoors = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  const stockOnHand = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  const fulfillmentHub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/branch-stock-fulfillment-hub-client.tsx",
  );
  const wasteApprovals = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx",
  );
  const countAssignments = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );
  const countSlips = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const catalogList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-list.tsx",
  );
  const catalogIngredients = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/ingredients/catalog-ingredients-client.tsx",
  );
  const catalogUnits = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/units/catalog-units-client.tsx",
  );
  const catalogThresholds = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/thresholds/catalog-thresholds-client.tsx",
  );
  const stockIssues = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/branch-stock-issues-list-client.tsx",
  );
  const stocktake = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/branch-stocktake-list-client.tsx",
  );
  const stockReports = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/branch-stock-reports-client.tsx",
  );
  const purchaseRequests = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/branch-purchase-requests-client.tsx",
  );
  const ingredientDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx",
  );

  assert.match(stockDoors, /lg:grid-cols-4/);
  assert.match(stockOnHand, /lg:grid lg:grid-cols-2/);
  assert.match(fulfillmentHub, /grid gap-2 lg:grid-cols-2/);
  assert.match(wasteApprovals, /lg:grid lg:grid-cols-2/);
  assert.match(wasteApprovals, /variant="outline"/);
  assert.match(countAssignments, /lg:grid-cols-2/);
  assert.match(countSlips, /lg:grid-cols-2/);
  assert.match(catalogList, /grid gap-2 lg:grid-cols-2/);
  assert.match(catalogIngredients, /lg:grid lg:grid-cols-2/);
  assert.match(catalogUnits, /lg:grid lg:grid-cols-2/);
  assert.match(catalogThresholds, /grid gap-2 lg:grid-cols-2/);
  assert.match(stockIssues, /grid gap-2 lg:grid-cols-2/);
  assert.match(stocktake, /grid gap-2 lg:grid-cols-2/);
  assert.match(stockReports, /grid gap-2 lg:grid-cols-2/);
  assert.match(purchaseRequests, /grid gap-2 lg:grid-cols-2/);
  assert.match(purchaseRequests, /variant="outline"/);
  assert.match(ingredientDetail, /grid gap-2 lg:grid-cols-2/);
});

test("Branch stock touch targets strictly comply with universal 48px standard", () => {
  const ingredientDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx",
  );
  const countSlips = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );

  assert.doesNotMatch(ingredientDetail, /size="xs"/);
  assert.doesNotMatch(ingredientDetail, /\bh-7\b/);
  assert.doesNotMatch(countSlips, /size="xs"/);
});

test("Branch stock data loaders preserve branch surface boundaries on unauthorized access", () => {
  const countSlipData = read(
    "apps/web/lib/inventory/branch-count-slip-data.ts",
  );
  const countAssignmentData = read(
    "apps/web/lib/inventory/branch-count-assignment-data.ts",
  );

  assert.match(countSlipData, /redirect\(`\/br\/\$\{routeBranchId\}\/stock`\)/);
  assert.match(
    countAssignmentData,
    /redirect\(`\/br\/\$\{routeBranchId\}\/stock`\)/,
  );
});

