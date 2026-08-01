import test from "node:test";
import assert from "node:assert/strict";

import { canAccess, MODULE_ACL, type ModuleKey } from "../module-acl";
import type { StaffRole } from "../types";

// Locks the fast route-candidate matrix. Live capability checks and database
// policies remain the final authority for HR and other sensitive operations.

const ALL_MODULE_KEYS = Object.keys(MODULE_ACL) as ModuleKey[];

function accessibleModules(role: StaffRole): ModuleKey[] {
  return ALL_MODULE_KEYS.filter((key) => canAccess(role, key)).sort();
}

const EXPECTED_MATRIX: Record<StaffRole, ModuleKey[]> = {
  owner: [
    "owner",
    "branch_dashboard",
    "branch_feedback",
    "branch_menu_limits",
    "branch_pos_sessions",
    "branch_settings",
    "branch_shift_roster",
    "branch_shift_attendance",
    "branch_stock",
    "branch_team",
    "branch_orders",
    "branches",
    "employee_checkout_approvals",
    "employee_leave_approvals",
    "feedback",
    "finance",
    "hr",
    "hr_payroll",
    "inventory",
    "inventory_operations",
    "kds",
    "menu",
    "notifications",
    "branch_home",
    "orders",
    "pos",
    "runner",
    "settings",
    "staff",
  ],
  self_service: ["hr", "hr_payroll", "me", "notifications", "staff"],
  branch_manager: [
    "branch_dashboard",
    "branch_feedback",
    "branch_menu_limits",
    "branch_pos_sessions",
    "branch_settings",
    "branch_shift_roster",
    "branch_shift_attendance",
    "branch_stock",
    "branch_team",
    "branch_orders",
    "employee_checkout_approvals",
    "employee_leave_approvals",
    "hr",
    "hr_payroll",
    "kds",
    "me",
    "notifications",
    "branch_home",
    "pos",
    "runner",
    "staff",
  ],
  cashier: [
    "branch_orders",
    "hr",
    "hr_payroll",
    "me",
    "notifications",
    "branch_home",
    "pos",
    "runner",
    "staff",
  ],
  chef: [
    "hr",
    "hr_payroll",
    "kds",
    "me",
    "notifications",
    "branch_home",
    "runner",
    "staff",
  ],
  branch_staff: [
    "hr",
    "hr_payroll",
    "me",
    "notifications",
    "branch_home",
    "staff",
  ],
  accountant: [
    "finance",
    "hr",
    "hr_payroll",
    "inventory",
    "me",
    "notifications",
    "staff",
  ],
  central_supply_ops: [
    "branch_home",
    "branch_stock",
    "hr",
    "hr_payroll",
    "inventory",
    "inventory_operations",
    "me",
    "notifications",
    "staff",
  ],
  central_kitchen_lead: [
    "branch_home",
    "branch_stock",
    "hr",
    "hr_payroll",
    "inventory",
    "inventory_operations",
    "me",
    "notifications",
    "staff",
  ],
};

for (const [role, expected] of Object.entries(EXPECTED_MATRIX)) {
  test(`MODULE_ACL access matrix for ${role} is locked`, () => {
    assert.deepEqual(
      accessibleModules(role as StaffRole),
      [...expected].sort(),
    );
  });
}

test("owner reaches every module except self-service", () => {
  const ownerModules = new Set(accessibleModules("owner"));
  for (const key of ALL_MODULE_KEYS) {
    assert.equal(
      ownerModules.has(key),
      key !== "me",
      `owner access mismatch for ${key}`,
    );
  }
});
