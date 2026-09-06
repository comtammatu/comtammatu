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
  const minH11Offenders: string[] = [];

  for (const file of branchFiles) {
    const content = read(file);
    if (/\bmin-h-11\b/.test(content)) {
      minH11Offenders.push(file);
    }
  }

  assert.deepEqual(
    minH11Offenders,
    [],
    `Found legacy 44px min-h-11 in branch surface files: ${minH11Offenders.join(", ")}. All touch controls must use universal 48px standard (min-h-12 / size="touch").`,
  );
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
