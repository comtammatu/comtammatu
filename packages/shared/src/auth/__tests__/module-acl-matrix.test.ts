import test from "node:test";
import assert from "node:assert/strict";

import { canAccess, MODULE_ACL, type ModuleKey } from "../module-acl";
import type { StaffRole } from "../types";

// Locks the MODULE_ACL access matrix per role. MODULE_ACL is the single source
// of truth for route access (middleware + sidebar); this snapshot pins exactly
// which modules each role can reach so the tier split cannot silently change
// who sees what. Driven through `canAccess` so the test exercises the real
// membership check, not a re-read of the table.

const ALL_MODULE_KEYS = Object.keys(MODULE_ACL) as ModuleKey[];

function accessibleModules(role: StaffRole): ModuleKey[] {
  return ALL_MODULE_KEYS.filter((key) => canAccess(role, key)).sort();
}

const EXPECTED_MATRIX: Record<StaffRole, ModuleKey[]> = {
  owner: [
    "branch_dashboard",
    "branch_menu_limits",
    "branch_picker",
    "branch_pos_sessions",
    "branch_settings",
    "branch_team",
    "branches",
    "employee",
    "employee_checkout_approvals",
    "employee_leave_approvals",
    "finance",
    "hr",
    "hr_payroll",
    "inventory",
    "inventory_procurement",
    "kds",
    "menu",
    "notifications",
    "operator_home",
    "orders",
    "pos",
    "runner",
    "settings",
    "staff",
  ],
  branch_manager: [
    "branch_dashboard",
    "branch_menu_limits",
    "branch_pos_sessions",
    "branch_settings",
    "branch_team",
    "employee",
    "employee_checkout_approvals",
    "employee_leave_approvals",
    "hr",
    "inventory",
    "inventory_procurement",
    "kds",
    "menu",
    "notifications",
    "operator_home",
    "orders",
    "pos",
    "runner",
  ],
  cashier: [
    "employee",
    "notifications",
    "operator_home",
    "orders",
    "pos",
    "runner",
  ],
  warehouse_manager: [
    "employee",
    "inventory",
    "inventory_procurement",
    "notifications",
    "operator_home",
  ],
  production_manager: [
    "employee",
    "inventory",
    "inventory_procurement",
    "notifications",
    "operator_home",
  ],
  chef: ["employee", "kds", "notifications", "operator_home", "runner"],
  office: ["employee", "finance", "notifications"],
};

for (const [role, expected] of Object.entries(EXPECTED_MATRIX)) {
  test(`MODULE_ACL access matrix for ${role} is locked`, () => {
    assert.deepEqual(
      accessibleModules(role as StaffRole),
      [...expected].sort(),
    );
  });
}

test("owner reaches every module", () => {
  const ownerModules = new Set(accessibleModules("owner"));
  for (const key of ALL_MODULE_KEYS) {
    assert.equal(ownerModules.has(key), true, `owner must reach ${key}`);
  }
});
