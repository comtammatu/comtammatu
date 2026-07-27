import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const retiredPaths = [
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/page.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/branch-supplier-returns-list-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/new/page.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/new/branch-supplier-return-create-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/[id]/page.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/[id]/branch-supplier-return-detail-client.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/page.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/supplier-returns-client.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/new/page.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/new/supplier-return-create-client.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/[id]/page.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/[id]/supplier-return-detail-client.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/[id]/supplier-return-confirm-cta.tsx",
  "apps/web/app/(protected)/inventory/supplier-return-actions.ts",
  "apps/web/lib/inventory/branch-supplier-return-data.ts",
  "apps/web/lib/inventory/supplier-return-model.ts",
];

test("supplier returns have no Branch or Owner surface daily-use surface", () => {
  for (const path of retiredPaths) {
    assert.equal(existsSync(resolve(repoRoot, path)), false, path);
  }

  const operatorNav = read("packages/shared/src/auth/nav-config.ts");
  const officeNav = read(
    "apps/web/app/(protected)/inventory/_lib/inventory-nav.ts",
  );
  const routeResolution = read("packages/shared/src/auth/route-resolution.ts");
  const stockHub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  const dictionary = read(
    "apps/web/app/(protected)/inventory/_lib/dictionary.ts",
  );

  for (const source of [
    operatorNav,
    officeNav,
    routeResolution,
    stockHub,
    dictionary,
  ]) {
    assert.doesNotMatch(
      source,
      /supplier-returns|supplierReturns|Trả hàng NCC/,
    );
  }
  assert.match(operatorNav, /hrefTemplate: "\/br\/\{branchId\}\/stock\/waste"/);
});

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
  const baseline = normalizePgDumpSql(
    read("supabase/migrations/20260727120000_baseline.sql"),
  );
  const integrityMigration = read(
    "supabase/migration-archive/20260708130500_inventory_supplier_integrity_gates.sql",
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
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_returns_active_grn/,
  );
  assert.match(
    integrityMigration,
    /CREATE OR REPLACE FUNCTION public\.create_supplier_return_from_grn/,
  );
  assert.equal(grnActions.match(/has_active_supplier_return/g)?.length, 2);
});
