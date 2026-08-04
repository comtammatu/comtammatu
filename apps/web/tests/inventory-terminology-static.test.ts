import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWorkspaceFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("inventory messages use the standardized cost and value terms", () => {
  const source = readWorkspaceFile("lib/messages/inventory.ts");

  assert.doesNotMatch(source, /lineHeaderCost/);
  assert.match(source, /stockValue: "Giá trị tồn kho"/);
  assert.match(source, /wac: "Giá vốn bình quân"/);
  assert.match(source, /movementUnitCost: "Đơn giá ghi sổ"/);
  assert.match(source, /unitCostWac: "Đơn giá ghi sổ"/);
  assert.match(source, /wacCost: "Đơn giá ghi sổ"/);
  assert.doesNotMatch(source, /Đơn giá \(WAC\)/);
  assert.doesNotMatch(source, /Giá WAC/);
  assert.doesNotMatch(source, /theo WAC/);
});

test("ingredient unit dialog models active units around one standard unit", () => {
  const source = readWorkspaceFile(
    "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  const messages = readWorkspaceFile("lib/messages/inventory-master.ts");

  assert.match(source, /unit_ids: z/);
  assert.match(source, /\.max\(20/);
  assert.match(source, /name: "base_unit_id"/);
  assert.match(source, /unit_anchor_ids: z\.record/);
  assert.match(source, /unit_factors: z\.record/);
  assert.match(source, /UnitRelationRow/);
  assert.doesNotMatch(source, /<RadioGroup/);
  assert.match(source, /<ItemGroup/);
  assert.match(source, /<FormattedNumberInput/);
  assert.match(source, /anchorOptions=\{anchorOptions\}/);
  assert.match(source, /buildCatalogUnits/);
  assert.match(source, /rebaseUnitRelations/);
  assert.doesNotMatch(source, /copy\.units\.productionNone/);
  assert.doesNotMatch(source, /label=\{copy\.units\.productionUnit\}/);
  assert.doesNotMatch(messages, /productionNone|productionUnit/);
  assert.doesNotMatch(source, /conversionRows|conversionSection/);
  assert.doesNotMatch(source, /disabled=\{isBase \|\| automatic\}/);
  assert.match(source, /controlSize === "touch" \? "touch" : "default"/);
  assert.doesNotMatch(
    source,
    /input_to_output_factor|output_to_production_factor|input_unit_is_different/,
  );
  assert.doesNotMatch(
    source,
    /DEFAULT_UNIT_CONVERSION_INPUT_DIRECTION|Đổi chiều quy đổi/,
  );
  assert.match(messages, /baseUnit: "Đơn vị chuẩn"/);
  assert.match(messages, /sectionLabel: "Đơn vị và quy đổi"/);
  assert.match(messages, /add: "Thêm đơn vị mới"/);
  assert.doesNotMatch(messages, /Đơn vị nhập|Đơn vị xuất|vai trò độc lập/);
  assert.doesNotMatch(messages, /Nhập ≥ Xuất ≥ Sản xuất/);
  assert.doesNotMatch(messages, /Số đơn vị xuất \/ 1 đơn vị nhập/);
  assert.doesNotMatch(messages, /1 đơn vị nhập = bao nhiêu đơn vị xuất/);
});

test("owner and branch catalog consumers share the same ingredient dialog", () => {
  const owner = readWorkspaceFile(
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );
  const branch = readWorkspaceFile(
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/ingredients/catalog-ingredients-client.tsx",
  );

  assert.match(owner, /<IngredientDialog/);
  assert.match(branch, /<IngredientDialog/);
});

test("GRN entry copy keeps unit conversion and omits purchase-price helpers", () => {
  const source = readWorkspaceFile("lib/inventory/grn-create-copy.ts");

  assert.doesNotMatch(
    source,
    /unitCostTitle|priorPriceLine|unitPriceUnit|priceSetOnPoHint/,
  );
  assert.match(source, /baseConversionPreview/);
  assert.match(source, /Quy đổi về đơn vị chuẩn/);
  assert.doesNotMatch(source, /label=\{FORM_VI\.unitPrice\}/);
});

test("stock value surfaces use ledger average cost without reference-price fallback", () => {
  const listSource = readWorkspaceFile("lib/inventory/stock-on-hand-data.ts");
  const detailSource = readWorkspaceFile(
    "app/(protected)/inventory/stock/[ingredientId]/page.tsx",
  );

  assert.match(listSource, /inventoryLineValue/);
  assert.match(listSource, /\(avgUnitCost \?\? 0\)/);
  assert.doesNotMatch(listSource, /ingredients \( unit_cost \)|referenceCost/);
  assert.match(detailSource, /movementUnitCost/);
  assert.doesNotMatch(detailSource, /stockCopy\.table\.wac:\{" "\}/);
});

test("operator-facing inventory copy does not reintroduce branch abbreviations", () => {
  const sourcePaths = [
    "app/(protected)/inventory/_lib/dictionary.ts",
    "app/(protected)/inventory/transfer-actions.ts",
    "app/(protected)/br/[branchId]/(operator)/menu-limits/actions.ts",
    "lib/messages/pos.ts",
    "lib/messages/settings.ts",
  ];

  for (const path of sourcePaths) {
    assert.doesNotMatch(readWorkspaceFile(path), /Kho CN|Bếp CN/);
  }

  const dictionary = readWorkspaceFile(
    "app/(protected)/inventory/_lib/dictionary.ts",
  );
  assert.match(
    dictionary,
    /branchWarehouse: \{ short: "Kho", long: "Kho chi nhánh" \}/,
  );
  assert.doesNotMatch(dictionary, /branchKitchen|Bếp chi nhánh/);
});
