import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("supplier-return UI copy is retired while GRN rejection copy stays neutral", () => {
  const appMessages = read("apps/web/lib/messages/inventory.ts");
  const sharedMessages = read("packages/shared/src/messages/inventory.ts");

  assert.doesNotMatch(appMessages, /supplierReturns:/);
  assert.doesNotMatch(
    sharedMessages,
    /createSupplierReturn|supplierReturnFromGrn|supplierReturnsTitle|noSupplierReturns/,
  );
  assert.match(appMessages, /rejectedLabel: \(unit: string\) => `Từ chối nhận/);
  assert.doesNotMatch(appMessages, /rejectedLabel:.*Trả NCC/);
});

test("supplier-return history, RPCs, and GRN integrity gates remain", () => {
  const baseline = read("supabase/migrations/00000000000000_baseline.sql");
  const integrityMigration = read(
    "supabase/migrations/00000000000000_baseline.sql",
  );
  const grnActions = read("apps/web/app/(protected)/inventory/grn-actions.ts");

  assert.match(baseline, /CREATE TABLE public\.supplier_returns/);
  assert.match(baseline, /CREATE TABLE public\.supplier_return_items/);
  assert.match(
    baseline,
    /CREATE FUNCTION public\.create_supplier_return_from_grn/,
  );
  assert.match(baseline, /CREATE FUNCTION public\.confirm_supplier_return/);
  assert.match(baseline, /CREATE FUNCTION public\.transition_supplier_return/);
  assert.match(
    integrityMigration,
    /CREATE UNIQUE INDEX uq_supplier_returns_active_grn/,
  );
  assert.match(
    integrityMigration,
    /CREATE FUNCTION public\.create_supplier_return_from_grn/,
  );
  assert.equal(grnActions.match(/has_active_supplier_return/g)?.length, 2);
});
