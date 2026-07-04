import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "../app/(protected)/inventory/_lib/purchase-units";
import { getIngredientUnitDisplayName } from "../app/(protected)/inventory/_lib/unit-display";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("GRN supplier line resolves a non-base purchase unit as the entry unit", () => {
  // "Thùng" (case, non-base) alongside "Lon" (base) — mirrors a real
  // ingredient_units row shape (allow_purchase true, is_base false, 24x factor).
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
        allow_purchase: true,
        allow_issue: true,
        allow_production: false,
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
        allow_purchase: true,
        allow_issue: false,
        allow_production: false,
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

  // Default stays the base unit; the picker still lets the user pick "Thùng".
  const defaultUnit = getDefaultPurchaseUnit(ingredient);
  assert.equal(defaultUnit?.unitId, 100);
  const nonBase = options.find((o) => o.code === "Thùng");
  assert.equal(nonBase?.unitId, 200);
  assert.equal(nonBase?.isBase, false);
});

test("getPurchaseUnitOptions excludes an is_active=false allow_purchase unit (inv_to_base would reject it)", () => {
  // Mirrors the GRN-create bug: an ingredient_units row with allow_purchase
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
        allow_purchase: true,
        allow_issue: true,
        allow_production: false,
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
        allow_purchase: true,
        allow_issue: false,
        allow_production: false,
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

test("getPurchaseUnitOptions includes every active ingredient unit regardless of allow_purchase", () => {
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
        allow_purchase: true,
        allow_issue: true,
        allow_production: false,
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
        allow_purchase: false,
        allow_issue: false,
        allow_production: false,
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
      allow_purchase: true,
      allow_issue: true,
      allow_production: true,
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
      allow_purchase: true,
      allow_issue: true,
      allow_production: true,
      sort_order: 1,
    },
  ];

  assert.equal(getIngredientUnitDisplayName(units, 200, "bich"), "bịch");
});

test("inventory unit option helpers are not role-gated by allow flags", () => {
  for (const path of [
    "apps/web/app/(protected)/inventory/_lib/purchase-units.ts",
    "apps/web/app/(protected)/inventory/_lib/issue-units.ts",
    "apps/web/app/(protected)/inventory/_lib/production-units.ts",
    "apps/web/app/(protected)/inventory/_lib/count-units.ts",
  ]) {
    const source = readRepo(path);
    assert.match(source, /u\.is_active && u\.unit_code !== ""/, path);
    assert.doesNotMatch(source, /u\.allow_(purchase|issue|production)/, path);
  }
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
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
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
  const sql = readRepo("supabase/migrations/00000000000000_baseline.sql");
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
