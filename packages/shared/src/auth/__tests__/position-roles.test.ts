import test from "node:test";
import assert from "node:assert/strict";
import {
  isStaffRole,
  resolveStaffRoleFromPositionCode,
} from "../position-roles";

test("resolveStaffRoleFromPositionCode maps position codes to authorization roles", () => {
  assert.equal(
    resolveStaffRoleFromPositionCode("executive_assistant"),
    "super_manager",
  );
  assert.equal(resolveStaffRoleFromPositionCode("chief_accountant"), "office");
  assert.equal(resolveStaffRoleFromPositionCode("accountant"), "office");
  assert.equal(
    resolveStaffRoleFromPositionCode("warehouse_head"),
    "warehouse_manager",
  );
  assert.equal(
    resolveStaffRoleFromPositionCode("warehouse_keeper"),
    "warehouse_manager",
  );
  assert.equal(
    resolveStaffRoleFromPositionCode("head_chef"),
    "production_manager",
  );
  assert.equal(resolveStaffRoleFromPositionCode("kitchen_helper"), "chef");
});

test("resolveStaffRoleFromPositionCode accepts current role-shaped position codes", () => {
  assert.equal(
    resolveStaffRoleFromPositionCode("branch_manager"),
    "branch_manager",
  );
  assert.equal(resolveStaffRoleFromPositionCode("cashier"), "cashier");
  assert.equal(resolveStaffRoleFromPositionCode("office"), "office");
});

test("resolveStaffRoleFromPositionCode rejects unknown or empty codes", () => {
  assert.equal(resolveStaffRoleFromPositionCode(""), null);
  assert.equal(resolveStaffRoleFromPositionCode(null), null);
  assert.equal(resolveStaffRoleFromPositionCode("custom_position"), null);
});

test("isStaffRole narrows known authorization role values", () => {
  assert.equal(isStaffRole("branch_manager"), true);
  assert.equal(isStaffRole("custom_position"), false);
  assert.equal(isStaffRole(null), false);
});
