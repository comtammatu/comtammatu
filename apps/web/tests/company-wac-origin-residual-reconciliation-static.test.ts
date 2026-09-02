import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = resolve(import.meta.dirname, "../../..");
const _migrationsDir = resolve(root, "supabase/migrations");
const migrationName = "active";
const valueOnlyAllocationMigrationName = "active";

test("company WAC keeps account and origin value ledgers reconciled", () => {
  assert.ok(migrationName, "expected the company WAC reconciliation migration");
  const migration = readActiveMigrationSql(root);

  assertSqlMatch(migration, /^BEGIN;/m);
  assertSqlMatch(migration, /^COMMIT;/m);
  assertSqlMatch(migration,
    /DROP TRIGGER IF EXISTS inventory_allocate_company_wac_equalization/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.project_company_wac\(/,
  );
  assertSqlMatch(migration, /inventory_origin_account_reconciliation_required/);
  assertSqlMatch(migration, /v_actual_delta := v_new_book_value - v_balance\.book_value/);
  assertSqlMatch(migration, /allocated_value,\s+allocation_fraction[\s\S]*abs\(v_actual_delta\)/);
  assertSqlMatch(migration, /company_wac_residual_unallocated/);
  assertSqlMatch(migration, /company_wac_origin_postcondition_failed/);
  assertSqlMatch(migration, /'repair', 'company_wac_origin_residual'/);
  assertSqlMatch(migration, /inventory_origin_reconciliation_postcondition_failed/);
  assertSqlNotMatch(migration, /Nguyễn Hữu Thọ|branch_id\s*=\s*\d+/);
});

test("valuation allocation carries value-only origins through inventory holders", () => {
  assert.ok(
    valueOnlyAllocationMigrationName,
    "expected the value-only origin allocation migration",
  );
  const migration = readActiveMigrationSql(root);

  assertSqlMatch(migration, /^BEGIN;/m);
  assertSqlMatch(migration, /^COMMIT;/m);
  assertSqlMatch(migration, /balance\.quantity > 0 OR balance\.book_value > 0/);
  assertSqlMatch(migration, /ORDER BY \(balance\.quantity > 0\), balance\.origin_id/);
  assertSqlMatch(migration, /ORDER BY \(balance\.quantity > 0\), balance\.id/);
  assertSqlMatch(migration, /inventory_origin_allocation_incomplete/);
  assertSqlMatch(migration, /v_match_count <> 7/);
  assertSqlMatch(migration, /Value-only origins remain in transfer and production lineage/);
  assertSqlNotMatch(migration, /branch_id\s*=\s*\d+|valuation_account_id\s*=\s*996/);
});
