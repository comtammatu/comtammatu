import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_LABEL_VI,
  STAFF_ROLES,
  requiredBranchKindForPositionCode,
  staffRoleFromPositionCode,
} from "../types";
import { canAccess } from "../module-acl";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "../../../../..");

test("D088 roles are in STAFF_ROLES with Vietnamese labels", () => {
  for (const role of [
    "accountant",
    "central_supply_ops",
    "central_kitchen_lead",
  ] as const) {
    assert.ok(STAFF_ROLES.includes(role));
    assert.equal(typeof ROLE_LABEL_VI[role], "string");
    assert.ok(ROLE_LABEL_VI[role].length > 0);
  }
});

test("D088 position mapper and site kind pin", () => {
  assert.equal(staffRoleFromPositionCode("accountant"), "accountant");
  assert.equal(
    staffRoleFromPositionCode("central_supply_ops"),
    "central_supply_ops",
  );
  assert.equal(
    staffRoleFromPositionCode("central_kitchen_lead"),
    "central_kitchen_lead",
  );
  assert.equal(requiredBranchKindForPositionCode("accountant"), null);
  assert.equal(
    requiredBranchKindForPositionCode("central_supply_ops"),
    "central_supply",
  );
  assert.equal(
    requiredBranchKindForPositionCode("central_kitchen_lead"),
    "central_kitchen",
  );
});

test("D088 MODULE_ACL surfaces", () => {
  assert.equal(canAccess("accountant", "finance"), true);
  assert.equal(canAccess("accountant", "inventory"), true);
  assert.equal(canAccess("accountant", "hr"), false);
  assert.equal(canAccess("accountant", "staff"), false);
  assert.equal(canAccess("central_supply_ops", "inventory"), true);
  assert.equal(canAccess("central_supply_ops", "finance"), false);
  assert.equal(canAccess("central_kitchen_lead", "inventory"), true);
  assert.equal(canAccess("central_kitchen_lead", "finance"), false);
});

test("SQL twin mapper includes D088 roles", () => {
  const migration = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260728140000_d088_b_full_ops_roles.sql",
    ),
    "utf8",
  );
  assert.match(migration, /WHEN 'accountant' THEN 'accountant'/);
  assert.match(
    migration,
    /WHEN 'central_supply_ops' THEN 'central_supply_ops'/,
  );
  assert.match(
    migration,
    /WHEN 'central_kitchen_lead' THEN 'central_kitchen_lead'/,
  );
  assert.match(migration, /temporary until ADR 0015/i);
  assert.match(migration, /position_site_kind_mismatch/);
  assert.match(migration, /central_supply/);
  assert.match(migration, /central_kitchen/);
});
