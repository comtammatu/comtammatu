import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const newClient = read(
  "app/(protected)/br/[branchId]/(operator)/stock/production/new/branch-production-new-client.tsx",
);
const detailClient = read(
  "app/(protected)/br/[branchId]/(operator)/stock/production/[id]/branch-production-detail-client.tsx",
);
const atomicMigration = read(
  "../../supabase/migration-archive/20260711135909_record_production_run_atomic.sql",
);

test("branch production records planned and actual output on one screen", () => {
  assert.match(newClient, /recordProductionRun/);
  assert.match(newClient, /plannedQuantity: plannedQuantityNumber/);
  assert.match(newClient, /actualQuantity: actualQuantityNumber/);
  assert.match(newClient, /Định làm/);
  assert.match(newClient, /Thực ra/);
  assert.match(newClient, /Đúng định mức/);
  assert.match(newClient, /router\.push\(basePath\)/);
  assert.doesNotMatch(newClient, /createProductionRun/);
  assert.doesNotMatch(newClient, /confirmProductionRun/);
  assert.doesNotMatch(newClient, /QuantityInput/);
});

test("atomic production RPC creates a run only when confirmation succeeds", () => {
  assert.match(atomicMigration, /SECURITY INVOKER/);
  assert.match(atomicMigration, /create_production_run_with_locations/);
  assert.match(atomicMigration, /confirm_production_run/);
  assert.match(atomicMigration, /invalid_actual_quantity/);
  assert.match(atomicMigration, /REVOKE ALL ON FUNCTION public\.record_production_run/);
  assert.match(atomicMigration, /GRANT EXECUTE ON FUNCTION public\.record_production_run/);
});

test("branch production uses NumberPad and a recovery Sheet for shortages", () => {
  for (const source of [newClient, detailClient]) {
    assert.match(source, /NumberPadSheet/);
    assert.match(source, /<Sheet/);
    assert.match(source, /Sửa Thực chi/);
    assert.match(source, /shortage\.missing/);
    assert.doesNotMatch(source, /QuantityInput/);
    assert.doesNotMatch(source, /shortages\.length > 0 \? \(\s*<Alert/);
  }

  assert.match(
    detailClient,
    /if \(nextShortages\.length > 0\) \{\s*setShortages\(nextShortages\);\s*return;/,
  );
});
