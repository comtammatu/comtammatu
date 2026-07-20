import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";
import {
  lineTotalFromUnitCost,
  unitCostFromLineTotal,
} from "../lib/inventory/grn-draft";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "../lib/inventory/purchase-units";
import {
  getDisplayReferenceCost,
  getReferenceCostForUnit,
} from "../lib/inventory/reference-cost";
import { getIngredientUnitDisplayName } from "../app/(protected)/inventory/_lib/unit-display";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("GRN supplier line resolves a non-base purchase unit as the entry unit", () => {
  // "Thùng" (case, non-base) alongside "Lon" (base) — mirrors a real
  // ingredient_units row shape (is_base false, 24x factor).
  const ingredient = {
    units: [
      {
        id: 1,
        unit_id: 100,
        unit_code: "Lon",
        unit_name: "lon",
        to_base_factor: 1,
        is_base: true,
        is_active: true,
        sort_order: 0,
      },
      {
        id: 2,
        unit_id: 200,
        unit_code: "Thùng",
        unit_name: "thùng",
        to_base_factor: 24,
        is_base: false,
        is_active: true,
        sort_order: 1,
      },
    ],
  };

  const options = getPurchaseUnitOptions(ingredient);
  assert.equal(options.length, 2);
  assert.deepEqual(
    options.map((o) => o.code),
    ["Lon", "Thùng"],
  );
  assert.deepEqual(
    options.map((o) => o.label),
    ["lon", "thùng"],
  );

  // Purchase defaults to the largest active unit so reference prices are useful
  // for receiving/procurement instead of tiny base-unit prices.
  const defaultUnit = getDefaultPurchaseUnit(ingredient);
  assert.equal(defaultUnit?.unitId, 200);
  const nonBase = options.find((o) => o.code === "Thùng");
  assert.equal(nonBase?.unitId, 200);
  assert.equal(nonBase?.isBase, false);
});

test("GRN line amount entry derives unit cost from the entered line total", () => {
  const unitCost = unitCostFromLineTotal(0.3, 30000);

  assert.equal(unitCost, 100000);
  assert.equal(lineTotalFromUnitCost(0.3, unitCost), 30000);
});

test("getPurchaseUnitOptions excludes an is_active=false unit (inv_to_base would reject it)", () => {
  // Mirrors the GRN-create bug: an ingredient_units row
  // true but is_active false must never reach the picker, because
  // inv_to_base(ingredient_id, entry_unit_id, qty) requires is_active and
  // raises 23503 otherwise, which confirm_goods_receipt_note surfaces as
  // "Không thể xác nhận phiếu nhập." on the whole GRN.
  const ingredient = {
    units: [
      {
        id: 1,
        unit_id: 100,
        unit_code: "Kg",
        unit_name: "kg",
        to_base_factor: 1,
        is_base: true,
        is_active: true,
        sort_order: 0,
      },
      {
        id: 2,
        unit_id: 200,
        unit_code: "Bao",
        unit_name: "bao",
        to_base_factor: 25,
        is_base: false,
        is_active: false,
        sort_order: 1,
      },
    ],
  };

  const options = getPurchaseUnitOptions(ingredient);
  assert.equal(options.length, 1);
  assert.deepEqual(
    options.map((o) => o.code),
    ["Kg"],
  );
  assert.equal(
    options.some((o) => o.unitId === 200),
    false,
    "inactive unit must not appear in purchase unit options",
  );
  assert.deepEqual(
    options.map((o) => o.label),
    ["kg"],
  );

  // With the inactive unit gone, default must not fall back to it either.
  const defaultUnit = getDefaultPurchaseUnit(ingredient);
  assert.equal(defaultUnit?.unitId, 100);
});

test("getPurchaseUnitOptions includes every active ingredient unit", () => {
  const ingredient = {
    units: [
      {
        id: 1,
        unit_id: 100,
        unit_code: "kg",
        unit_name: "kg",
        to_base_factor: 1,
        is_base: true,
        is_active: true,
        sort_order: 0,
      },
      {
        id: 2,
        unit_id: 200,
        unit_code: "bich",
        unit_name: "bịch",
        to_base_factor: 0.5,
        is_base: false,
        is_active: true,
        sort_order: 1,
      },
    ],
  };

  const options = getPurchaseUnitOptions(ingredient);
  assert.deepEqual(
    options.map((o) => o.code),
    ["kg", "bich"],
  );
  assert.deepEqual(
    options.map((o) => o.label),
    ["kg", "bịch"],
  );
});

test("reference cost uses display and selected units instead of raw base-unit cost", () => {
  const ingredient = {
    unit_cost: 50,
    units: [
      {
        id: 1,
        unit_id: 100,
        unit_code: "g",
        unit_name: "g",
        to_base_factor: 1,
        is_base: true,
        is_active: true,
        sort_order: 0,
      },
      {
        id: 2,
        unit_id: 200,
        unit_code: "bich",
        unit_name: "bịch",
        to_base_factor: 5000,
        is_base: false,
        is_active: true,
        sort_order: 1,
      },
    ],
  };

  const display = getDisplayReferenceCost(ingredient);
  assert.equal(display?.value, 250000);
  assert.equal(display?.unit, "bịch");
  assert.equal(getReferenceCostForUnit(ingredient, 100)?.value, 50);
  assert.equal(getReferenceCostForUnit(ingredient, 200)?.value, 250000);
});

test("inventory unit display uses the catalog name, not the unit code", () => {
  const units = [
    {
      id: 1,
      unit_id: 100,
      unit_code: "kg",
      unit_name: "kg",
      to_base_factor: 1,
      is_base: true,
      is_active: true,
      sort_order: 0,
    },
    {
      id: 2,
      unit_id: 200,
      unit_code: "bich",
      unit_name: "bịch",
      to_base_factor: 0.5,
      is_base: false,
      is_active: true,
      sort_order: 1,
    },
  ];

  assert.equal(getIngredientUnitDisplayName(units, 200, "bich"), "bịch");
});

test("inventory unit option helpers are not role-gated by allow flags", () => {
  const sharedSource = readRepo(
    "apps/web/lib/inventory/unit-options.ts",
  );
  assert.match(sharedSource, /unit\.is_active && unit\.unit_code !== ""/);

  for (const path of [
    "apps/web/lib/inventory/purchase-units.ts",
    "apps/web/app/(protected)/inventory/_lib/issue-units.ts",
    "apps/web/app/(protected)/inventory/_lib/production-units.ts",
    "apps/web/app/(protected)/inventory/_lib/count-units.ts",
  ]) {
    const source = readRepo(path);
    assert.match(source, /getIngredientUnitOptions/, path);
  }
});

test("ingredients list does not render raw base-unit reference cost", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );

  assert.match(source, /getDisplayReferenceCost/);
  assert.doesNotMatch(source, /formatVND\(item\.unit_cost\)/);
});

test("GRN create reference cost follows the selected entry unit", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/_components/grn-line-editor.tsx",
  );

  assert.match(
    source,
    /getReferenceCostForUnit\(\s*edit\.ingredient,\s*edit\.entryUnitId/,
  );
  assert.doesNotMatch(
    source,
    /const referenceCost = edit\.ingredient\.unit_cost/,
  );
});

test("GRN supplier lines require an entered current unit price", () => {
  const controller = readRepo(
    "apps/web/lib/inventory/use-grn-create-controller.ts",
  );
  const data = readRepo("apps/web/lib/inventory/grn-create-data.ts");
  const client = readRepo(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/branch-grn-create-client.tsx",
  );
  const editor = readRepo(
    "apps/web/app/(protected)/inventory/_components/grn-line-editor.tsx",
  );

  assert.match(controller, /const unitCost = existing\?\.unitCost \?\? null/);
  assert.doesNotMatch(
    controller,
    /referenceCost\?\.value\s*\?\?|ingredient\.unit_cost/,
  );
  assert.match(editor, /edit\.unitCost != null/);
  assert.match(editor, /edit\.unitCost > 0/);
  assert.match(editor, /GRN_CREATE_COPY\.varianceReference\(variance\)/);
  assert.match(editor, /GRN_CREATE_COPY\.lastCostReference/);
  assert.match(
    readRepo(
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
    ),
    /GRN_CREATE_COPY\.varianceReference\(variance\)/,
  );
  assert.match(controller, /lines: existingDraft\?\.lines \?\? recentLines/);
  assert.match(controller, /const hasMissingPrice = draft\.lines\.some/);
  assert.match(controller, /!hasMissingPrice/);
  assert.match(client, /GRN_CREATE_COPY\.linePriceRequired/);
  assert.match(data, /\.from\("goods_received_notes"\)/);
  assert.match(data, /\.eq\("supplier_id", supplierId\)/);
  assert.match(data, /\.eq\("branch_id", defaultBranchId\)/);
  assert.match(data, /\.eq\("status", "confirmed"\)/);
  assert.match(
    data,
    /\.select\("ingredient_id, received_quantity, entry_unit_id"\)/,
  );
  assert.doesNotMatch(data, /supplier_price_list/);
  assert.doesNotMatch(
    data,
    /\.select\("ingredient_id, received_quantity, entry_unit_id, unit_cost"\)/,
  );
});

test("GRN line defaults scale ingredient cost by receiving unit", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );
  assert.match(source, /getReferenceCostForUnit/);
});

test("quickCreateIngredient refuses units outside the catalog instead of creating a new unit", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );
  const fnStart = source.indexOf("export const quickCreateIngredient");
  assert.ok(fnStart >= 0, "quickCreateIngredient not found");
  const fnBody = source.slice(fnStart, fnStart + 5000);

  assert.match(fnBody, /Đơn vị không có trong danh mục\./);
  assert.doesNotMatch(
    fnBody,
    /\.from\("units"\)[\s\S]{0,500}\.insert\(/,
    "quick create must not auto-create free-text unit codes",
  );
});

test("GRN create-from-supplier saveLine threads the picked entryUnitId to upsertGrnLine", () => {
  const source = readRepo(
    "apps/web/lib/inventory/use-grn-create-controller.ts",
  );
  const callStart = source.indexOf("const lineRes = await upsertGrnLine({");
  assert.ok(callStart >= 0, "upsertGrnLine call not found");
  const saveCall = source.slice(
    callStart,
    source.indexOf("if (!lineRes.success)", callStart),
  );

  assert.match(
    saveCall,
    /entryUnitId:\s*edit\.entryUnitId/,
    "saveLine must forward the selected entryUnitId, not force the base unit",
  );
  assert.doesNotMatch(
    saveCall,
    /\bunit\s*:/,
    "saveLine must not send unit text/code to the write action",
  );
});

test("confirm_goods_receipt_note converts every grn_items row via inv_to_base regardless of source (PO or supplier)", () => {
  const sql = normalizePgDumpSql(
    readRepo("supabase/migrations/20260720035548_baseline.sql"),
  );
  const fnStart = sql.indexOf(
    "CREATE FUNCTION public.confirm_goods_receipt_note",
  );
  assert.ok(fnStart >= 0, "confirm_goods_receipt_note not found in baseline");
  const fnBody = sql.slice(fnStart, fnStart + 6000);

  // The loop over grn_items has no PO-vs-supplier branch: every line's
  // entry_unit_id is converted the same way (D053 §10).
  assert.match(
    fnBody,
    /v_recv_base := public\.inv_to_base\(v_item\.ingredient_id, v_item\.entry_unit_id, v_recv\)/,
  );
  assert.doesNotMatch(
    fnBody,
    /IF\s+v_grn\.po_id\s+IS\s+NOT\s+NULL\s+THEN[\s\S]{0,50}inv_to_base/,
  );
});
