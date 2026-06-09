import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const employeeHomeSource = readFileSync(
  join(process.cwd(), "app/(protected)/employee/page.tsx"),
  "utf8",
);

test("Employee home exposes Branch Manager tools outside personal attendance state", () => {
  assert.match(
    employeeHomeSource,
    /const effectiveBranchId = branchId \?\? claims\.branch_id;/,
    "Branch Manager tools must fall back to JWT branch scope when employee context is missing",
  );
  assert.match(
    employeeHomeSource,
    /const isBranchManager = claims\.user_role === "branch_manager";/,
    "Branch Manager visibility must be explicit and role-scoped",
  );
  assert.match(
    employeeHomeSource,
    /const managerTools =[\s\S]*isBranchManager && effectiveBranchId && !branchIsHq/,
    "Branch Manager tools should require a real branch scope, not a personal clock-in state",
  );

  const managerToolsBlock =
    employeeHomeSource.match(/const managerTools =[\s\S]*?;\n/)?.[0] ?? "";
  assert.doesNotMatch(
    managerToolsBlock,
    /attendance/,
    "Branch Manager management links must not disappear when the manager has not clocked in",
  );

  for (const expected of [
    'moduleKey: "pos"',
    'moduleKey: "orders"',
    'moduleKey: "kds"',
    'moduleKey: "runner"',
    'moduleKey: "branch_menu_limits"',
    'moduleKey: "branch_settings"',
    'moduleKey: "inventory"',
    'moduleKey: "menu"',
    'moduleKey: "feedback"',
  ]) {
    assert.ok(
      employeeHomeSource.includes(expected),
      `expected Branch Manager entry point ${expected}`,
    );
  }
});
