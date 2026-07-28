import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "../lib/inventory/purchase-units";
import { persistPendingGrnDraftLines } from "../lib/inventory/persist-grn-draft-lines";
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

test("inventory unit option helpers are not role-gated by allow flags", () => {
  const sharedSource = readRepo("apps/web/lib/inventory/unit-options.ts");
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

test("GRN create editor no longer seeds commercial price from reference cost (D091)", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/_components/grn-line-editor.tsx",
  );

  assert.doesNotMatch(source, /getReferenceCostForUnit/);
  assert.doesNotMatch(source, /MoneyVndInput/);
  assert.doesNotMatch(source, /priceSetOnPoHint/);
});

test("GRN warehouse draft does not require unit price (D091)", () => {
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

  assert.doesNotMatch(controller, /unitCost/);
  assert.doesNotMatch(controller, /hasMissingPrice/);
  assert.doesNotMatch(controller, /toastMissingPrices/);
  assert.doesNotMatch(editor, /edit\.unitCost != null/);
  assert.doesNotMatch(editor, /MoneyVndInput/);
  assert.doesNotMatch(editor, /priceSetOnPoHint/);
  assert.match(client, /GRN_CREATE_COPY\.lineQtyOnly/);
  assert.doesNotMatch(client, /GRN_CREATE_COPY\.linePriceRequired/);
  assert.match(controller, /lines: recentLines/);
  assert.doesNotMatch(controller, /existingDraft/);
  assert.match(data, /\.from\("goods_received_notes"\)/);
  assert.doesNotMatch(data, /\.eq\("supplier_id", supplierId\)/);
  assert.match(data, /\.eq\("branch_id", defaultBranchId\)/);
  assert.match(data, /\.eq\("status", "confirmed"\)/);
  assert.match(
    data,
    /ingredient_id, received_quantity, entry_unit_id, supplier_id/,
  );
  assert.doesNotMatch(data, /supplier_price_list/);
  assert.doesNotMatch(
    data,
    /\.select\("ingredient_id, received_quantity, entry_unit_id, unit_cost"\)/,
  );
});

test("GRN add-line dialog is qty/UOM only without PO price hint (D091)", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );
  assert.doesNotMatch(source, /getReferenceCostForUnit/);
  assert.doesNotMatch(source, /const \[unitCost/);
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
  assert.match(
    saveCall,
    /supplierId:\s*edit\.supplierId/,
    "saveLine must forward the selected line supplierId",
  );
  assert.doesNotMatch(
    saveCall,
    /\bunit\s*:/,
    "saveLine must not send unit text/code to the write action",
  );
});

test("GRN submit persists preloaded recent lines before review navigation", async () => {
  const controller = readRepo(
    "apps/web/lib/inventory/use-grn-create-controller.ts",
  );
  const persistIndex = controller.indexOf(
    "const persisted = await persistPendingGrnDraftLines(",
  );
  const reviewNavigationIndex = controller.indexOf(
    "router.push(`${grnBasePath}/${grnId}`)",
  );
  assert.ok(persistIndex >= 0, "submit must persist pending draft lines");
  assert.ok(
    reviewNavigationIndex > persistIndex,
    "review navigation must happen after pending lines are persisted",
  );

  const calls: Array<{
    grnId: number;
    ingredientId: number;
    supplierId: number;
    receivedQuantity: number;
    entryUnitId: number | null;
  }> = [];
  const result = await persistPendingGrnDraftLines(
    91,
    [
      {
        ingredientId: 10,
        ingredientName: "Gạo",
        supplierId: 7,
        supplierName: "NCC A",
        unit: "bao",
        entryUnitId: 3,
        quantity: 2,
      },
      {
        lineId: 44,
        ingredientId: 11,
        ingredientName: "Muối",
        supplierId: 8,
        supplierName: "NCC B",
        unit: "kg",
        entryUnitId: null,
        quantity: 1,
      },
    ],
    async (input) => {
      calls.push(input);
      return { success: true, data: { id: 45 } };
    },
  );

  assert.deepEqual(calls, [
    {
      grnId: 91,
      ingredientId: 10,
      supplierId: 7,
      receivedQuantity: 2,
      entryUnitId: 3,
    },
  ]);
  assert.deepEqual(result, {
    success: true,
    lines: [
      {
        lineId: 45,
        ingredientId: 10,
        ingredientName: "Gạo",
        supplierId: 7,
        supplierName: "NCC A",
        unit: "bao",
        entryUnitId: 3,
        quantity: 2,
      },
      {
        lineId: 44,
        ingredientId: 11,
        ingredientName: "Muối",
        supplierId: 8,
        supplierName: "NCC B",
        unit: "kg",
        entryUnitId: null,
        quantity: 1,
      },
    ],
  });
});

test("GRN submit stops when a preloaded line cannot be persisted", async () => {
  let attempts = 0;
  const result = await persistPendingGrnDraftLines(
    92,
    [
      {
        ingredientId: 20,
        ingredientName: "Dầu",
        supplierId: 7,
        supplierName: "NCC A",
        unit: "can",
        quantity: 1,
      },
      {
        ingredientId: 21,
        ingredientName: "Đường",
        supplierId: 8,
        supplierName: "NCC B",
        unit: "kg",
        quantity: 1,
      },
    ],
    async () => {
      attempts += 1;
      return { success: false, error: "Không thể lưu dòng phiếu nhập." };
    },
  );

  assert.equal(attempts, 1);
  assert.deepEqual(result, {
    success: false,
    error: "Không thể lưu dòng phiếu nhập.",
  });
});
