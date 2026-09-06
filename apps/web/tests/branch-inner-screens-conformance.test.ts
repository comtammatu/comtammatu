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

test("Branch team sub-screens implement responsive desktop multi-column layouts", () => {
  const teamBoard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/team-board-client.tsx",
  );
  const members = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/members/members-client.tsx",
  );
  const attendance = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/attendance/branch-attendance-client.tsx",
  );
  const leaveApprovals = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/leave-approvals/branch-leave-approvals-client.tsx",
  );
  const checkoutApprovals = read(
    "apps/web/lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );
  const rosterWeek = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/branch-roster-week-client.tsx",
  );

  // Shift groups and tools strip on team board
  assert.match(teamBoard, /grid gap-1\.5 lg:grid-cols-2/);
  assert.match(teamBoard, /grid gap-1\.5 sm:grid-cols-2 lg:grid-cols-3/);

  // Members list responsive 2-column grid
  assert.match(members, /grid gap-2 lg:grid-cols-2/);

  // Attendance records and summary 3-column grid
  assert.match(attendance, /grid gap-2 sm:grid-cols-2 lg:grid-cols-3/);

  // Leave approvals responsive multi-column grid
  assert.match(
    leaveApprovals,
    /grid gap-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3/,
  );

  // Checkout approvals responsive 3-column grid
  assert.match(checkoutApprovals, /grid gap-2 sm:grid-cols-2 lg:grid-cols-3/);

  // Roster week 7-column day selector on desktop and 3-column assigned staff
  assert.match(rosterWeek, /lg:grid lg:grid-cols-7/);
  assert.match(rosterWeek, /gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3/);
});

test("Branch team and staff-runtime touch targets strictly comply with universal 48px standard", () => {
  const rosterWeek = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/branch-roster-week-client.tsx",
  );
  const employeeTasksSheet = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/members/branch-employee-tasks-sheet.tsx",
  );
  const staffRuntimePage = read("apps/web/lib/staff-runtime/page.tsx");
  const tasksClient = read(
    "apps/web/lib/staff-runtime/tasks/tasks-client.tsx",
  );
  const countClient = read(
    "apps/web/lib/staff-runtime/count/count-client.tsx",
  );
  const profilePref = read(
    "apps/web/lib/staff-runtime/profile/profile-preferences-section.tsx",
  );
  const yearPicker = read(
    "apps/web/lib/staff-runtime/payslip/year-picker.tsx",
  );

  assert.doesNotMatch(rosterWeek, /\bh-8\b/);
  assert.doesNotMatch(rosterWeek, /\bsm:h-9\b/);
  assert.doesNotMatch(employeeTasksSheet, /size="icon-xs"/);
  assert.doesNotMatch(staffRuntimePage, /<Button[^>]*size="xs"/);
  assert.doesNotMatch(tasksClient, /<Button[^>]*size="xs"/);
  assert.doesNotMatch(tasksClient, /<Button[^>]*size="icon"(?!-touch)/);
  assert.doesNotMatch(countClient, /\bh-7\b/);
  assert.doesNotMatch(countClient, /<Button[^>]*size="sm"/);
  assert.doesNotMatch(profilePref, /\bh-7\b/);
  assert.doesNotMatch(profilePref, /<Button[^>]*size="sm"/);
  assert.doesNotMatch(yearPicker, /<Button[^>]*size="sm"/);
});

test("Branch shift redirect shims forward legacy routes to canonical team sub-plane", () => {
  const shiftAttendance = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/attendance/page.tsx",
  );
  const shiftCheckout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx",
  );
  const shiftLeave = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/page.tsx",
  );
  const shiftRoster = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/roster/page.tsx",
  );

  assert.match(
    shiftAttendance,
    /redirect\(`\/br\/\$\{branchId\}\/team\/attendance`\)/,
  );
  assert.match(
    shiftCheckout,
    /redirect\(`\/br\/\$\{branchId\}\/team\/checkout-approvals/,
  );
  assert.match(
    shiftLeave,
    /redirect\(`\/br\/\$\{branchId\}\/team\/leave-approvals/,
  );
  assert.match(
    shiftRoster,
    /redirect\(`\/br\/\$\{branchId\}\/team\/roster/,
  );
});

test("Branch menu limits, feedback, and void queue implement responsive multi-column layouts and 48px touch targets", () => {
  const menuLimits = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-quick-menu-limit-sheet.tsx",
  );
  const feedbackInbox = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-inbox-list.tsx",
  );
  const feedbackQr = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-qr-client.tsx",
  );
  const voidQueue = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/void-request-queue.tsx",
  );
  const branchHome = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  // Menu limits 2-column grid and 48px touch compliance
  assert.match(menuLimits, /grid gap-2 p-2 sm:grid-cols-2/);
  assert.doesNotMatch(menuLimits, /<Button[^>]*size="sm"/);
  assert.doesNotMatch(menuLimits, /\bh-7\b/);
  assert.match(menuLimits, /<InputGroup size="touch"/);

  // Feedback inbox and QR lists 2-column grid
  assert.match(feedbackInbox, /grid gap-2 sm:grid-cols-2 lg:grid-cols-2/);
  assert.match(feedbackQr, /grid gap-2 sm:grid-cols-2 lg:grid-cols-2/);

  // Void request queue 2-column grid
  assert.match(voidQueue, /grid gap-2 sm:grid-cols-2/);

  // Branch home sales quick triggers 3-column desktop layout
  assert.match(branchHome, /grid grid-cols-2 gap-2 lg:grid-cols-3/);
});

test("Branch pos-sessions implements responsive desktop multi-column layouts and 48px touch targets", () => {
  const posSessionsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );

  // Desktop touch layout contract
  assert.match(posSessionsClient, /useIsMobile\(1280\)/);

  // Zero sub-touch buttons
  assert.doesNotMatch(posSessionsClient, /<Button[^>]*size="sm"/);
  assert.doesNotMatch(posSessionsClient, /<Button[^>]*size="xs"/);

  // Orders list inside session enforces 48px min-h-12 touch target
  assert.match(posSessionsClient, /min-h-12 gap-1 rounded-none/);

  // Report card top items and discount orders use 2-column grid
  assert.match(
    posSessionsClient,
    /topItems\}<\/SectionLabel>\s*<ItemGroup className="grid gap-2 sm:grid-cols-2">/,
  );
  assert.match(
    posSessionsClient,
    /discounts\.top_orders[\s\S]*?<ItemGroup className="grid gap-2 sm:grid-cols-2">/,
  );

  // Order detail drawer content desktop max-w-2xl and 2-column payment attempts
  assert.match(posSessionsClient, /sm:mx-auto sm:max-w-2xl/);
  assert.match(
    posSessionsClient,
    /paymentAttempts\}[\s\S]*?<\/SectionLabel>\s*<ItemGroup className="mt-2 grid gap-2 sm:grid-cols-2">/,
  );
});



