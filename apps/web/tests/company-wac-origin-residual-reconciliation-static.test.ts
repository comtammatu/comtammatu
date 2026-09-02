import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migrationsDir = resolve(root, "supabase/migration-archive");
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_company_wac_origin_residual_reconciliation.sql"),
);
const valueOnlyAllocationMigrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_inventory_origin_value_only_allocation.sql"),
);

test("company WAC keeps account and origin value ledgers reconciled", () => {
  assert.ok(migrationName, "expected the company WAC reconciliation migration");
  const migration = readFileSync(resolve(migrationsDir, migrationName), "utf8");

  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.match(
    migration,
    /DROP TRIGGER IF EXISTS inventory_allocate_company_wac_equalization/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.project_company_wac\(/,
  );
  assert.match(migration, /inventory_origin_account_reconciliation_required/);
  assert.match(migration, /v_actual_delta := v_new_book_value - v_balance\.book_value/);
  assert.match(migration, /allocated_value,\s+allocation_fraction[\s\S]*abs\(v_actual_delta\)/);
  assert.match(migration, /company_wac_residual_unallocated/);
  assert.match(migration, /company_wac_origin_postcondition_failed/);
  assert.match(migration, /'repair', 'company_wac_origin_residual'/);
  assert.match(migration, /inventory_origin_reconciliation_postcondition_failed/);
  assert.doesNotMatch(migration, /Nguyễn Hữu Thọ|branch_id\s*=\s*\d+/);
});

test("valuation allocation carries value-only origins through inventory holders", () => {
  assert.ok(
    valueOnlyAllocationMigrationName,
    "expected the value-only origin allocation migration",
  );
  const migration = readFileSync(
    resolve(migrationsDir, valueOnlyAllocationMigrationName),
    "utf8",
  );

  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.match(migration, /balance\.quantity > 0 OR balance\.book_value > 0/);
  assert.match(migration, /ORDER BY \(balance\.quantity > 0\), balance\.origin_id/);
  assert.match(migration, /ORDER BY \(balance\.quantity > 0\), balance\.id/);
  assert.match(migration, /inventory_origin_allocation_incomplete/);
  assert.match(migration, /v_match_count <> 7/);
  assert.match(migration, /Value-only origins remain in transfer and production lineage/);
  assert.doesNotMatch(migration, /branch_id\s*=\s*\d+|valuation_account_id\s*=\s*996/);
});
