import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
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

test("GRN supplier line resolves every active unit as an entry option", () => {
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

  // Manual entry defaults to the standard unit.
  const defaultUnit = getDefaultPurchaseUnit(ingredient);
  assert.equal(defaultUnit?.unitId, 100);
  assert.equal(defaultUnit?.isBase, true);
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

test("getPurchaseUnitOptions exposes every active ingredient unit", () => {
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
      {
        id: 3,
        unit_id: 300,
        unit_code: "g",
        unit_name: "g",
        to_base_factor: 0.001,
        is_base: false,
        is_active: true,
        sort_order: 2,
      },
    ],
  };

  const options = getPurchaseUnitOptions(ingredient);
  assert.deepEqual(
    options.map((o) => o.code),
    ["kg", "bich", "g"],
  );
  assert.equal(
    options.some((o) => o.unitId === 300),
    true,
    "every active unit must appear on the GRN picker",
  );
});

test("reference cost uses display and selected units instead of raw base-unit cost", () => {
  const ingredient = {
    monetary: { unitCost: 50 },
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

test("inventory unit display falls back to unit code when the name is empty", () => {
  const units = [
    {
      id: 2,
      unit_id: 200,
      unit_code: "bich",
      unit_name: "",
      to_base_factor: 0.5,
      is_base: false,
      is_active: true,
      sort_order: 1,
    },
  ];
  assert.equal(getIngredientUnitDisplayName(units, 200, "fallback"), "bich");
});

test("inventory unit option helpers use every active ingredient unit", () => {
  const sharedSource = readRepo("apps/web/lib/inventory/unit-options.ts");
  assert.match(sharedSource, /unit\.is_active && unit\.unit_code !== ""/);
  assert.doesNotMatch(sharedSource, /getIngredientRoleUnit/);

  const purchase = readRepo("apps/web/lib/inventory/purchase-units.ts");
  assert.match(purchase, /getIngredientUnitOptions\(ingredient\)/);

  const issue = readRepo(
    "apps/web/app/(protected)/inventory/_lib/issue-units.ts",
  );
  assert.match(
    issue,
    /getIngredientUnitOptions\(ingredient, \{ includeToBaseFactor: true \}\)/,
  );

  const count = readRepo(
    "apps/web/app/(protected)/inventory/_lib/count-units.ts",
  );
  assert.match(count, /getIngredientUnitOptions/);

  const productionLines = readRepo(
    "apps/web/app/(protected)/inventory/_components/ingredient-lines-editor.tsx",
  );
  assert.match(productionLines, /getIngredientUnitOptions\(ingredient\)/);
  assert.doesNotMatch(productionLines, /production[_A-Z]|productionUnit/);
});

test("ingredients list does not render raw base-unit reference cost", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );

  assert.match(source, /getDisplayReferenceCost/);
  assert.doesNotMatch(source, /formatVND\(item\.unit_cost\)/);
});

test("GRN create editor does not seed book price from catalog reference cost", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );

  assert.doesNotMatch(source, /getReferenceCostForUnit/);
  assert.doesNotMatch(source, /priceSetOnPoHint/);
});

test("GRN warehouse draft requires net unit price (ADR 0041)", () => {
  const dialog = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );
  const row = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx",
  );
  const sheet = readRepo(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
  );
  const actions = readRepo("apps/web/lib/inventory/use-grn-detail-actions.ts");

  assert.match(dialog, /MoneyVndInput/);
  assert.match(dialog, /unitCost: parsedUnitCost/);
  assert.match(dialog, /unitCostUnitId: entryUnitId/);
  assert.doesNotMatch(dialog, /priceSetOnPoHint/);
  assert.match(row, /MoneyVndInput/);
  assert.match(row, /patchGrnLineUnitPrice/);
  assert.match(row, /applyGrnLinePriceUnit/);
  assert.match(sheet, /numericField === "unitPrice"/);
  assert.match(sheet, /unitCost: parsedUnitCost/);
  assert.match(sheet, /unitCostUnitId: entryUnitId/);
  assert.match(sheet, /applyGrnLinePriceUnit/);
  assert.match(actions, /unitCost: line\.monetary\?\.unitPrice \?\? 0/);
  assert.match(actions, /unitCostUnitId: line\.unitCostUnitId/);
  assert.match(actions, /unitPriceRequired/);
});

test("GRN add-line dialog is qty/UOM/unit price without PO price hint", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );
  assert.doesNotMatch(source, /getReferenceCostForUnit/);
  assert.match(source, /const \[unitPrice/);
  assert.doesNotMatch(source, /priceSetOnPoHint/);
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

test("GRN add-line dialog threads the picked entryUnitId to upsertGrnLine", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );
  const callStart = source.indexOf("const res = await upsertGrnLine({");
  assert.ok(callStart >= 0, "upsertGrnLine call not found");
  const saveCall = source.slice(
    callStart,
    source.indexOf("if (!res.success || !res.data)", callStart),
  );

  assert.match(
    saveCall,
    /entryUnitId,/,
    "saveLine must forward the selected entryUnitId, not force the base unit",
  );
  assert.match(
    saveCall,
    /supplierId:\s*parsedSupplierId/,
    "saveLine must forward the selected line supplierId",
  );
  assert.doesNotMatch(
    saveCall,
    /\bunit\s*:/,
    "saveLine must not send unit text/code to the write action",
  );
});

test("GRN draft line qty control shows and persists the selected entry unit", () => {
  const lineRow = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx",
  );
  const sheet = readRepo(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
  );
  const client = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );

  assert.match(lineRow, /getPurchaseUnitOptions/);
  assert.match(lineRow, /applyGrnLineEntryUnit/);
  assert.match(lineRow, /<Select/);
  assert.match(lineRow, /FORM_VI\.unit/);
  assert.match(client, /ingredient=\{ingredientById\.get\(line\.ingredientId\)\}/);
  assert.match(sheet, /applyGrnLineEntryUnit/);
  assert.match(sheet, /getPurchaseUnitOptions\(ingredient\)/);
});
