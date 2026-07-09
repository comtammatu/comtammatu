import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWorkspaceFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("inventory messages use the standardized cost and value terms", () => {
  const source = readWorkspaceFile("lib/messages/inventory.ts");

  assert.match(source, /lineHeaderCost: "Đơn giá nhập"/);
  assert.match(source, /stockValue: "Giá trị tồn kho"/);
  assert.match(source, /wac: "Giá vốn BQ"/);
  assert.match(source, /movementUnitCost: "Đơn giá ghi sổ"/);
  assert.match(source, /unitCostWac: "Đơn giá ghi sổ"/);
  assert.match(source, /wacCost: "Đơn giá ghi sổ"/);
  assert.doesNotMatch(source, /Đơn giá \(WAC\)/);
  assert.doesNotMatch(source, /Giá WAC/);
  assert.doesNotMatch(source, /theo WAC/);
});

test("ingredient unit dialog always previews canonical conversion to base stock unit", () => {
  const source = readWorkspaceFile(
    "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );

  assert.match(source, /previewCanonical/);
  assert.match(source, /DEFAULT_UNIT_CONVERSION_INPUT_DIRECTION/);
  assert.doesNotMatch(source, /Đổi chiều quy đổi/);
  assert.doesNotMatch(source, /displayAnchorFactor/);
  assert.doesNotMatch(source, /preferredConversionInputDirection/);
  assert.doesNotMatch(source, /toStoredAnchorFactor/);
});

test("GRN entry labels purchase price and conversion without calling it cost basis", () => {
  const source = readWorkspaceFile(
    "app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );

  assert.match(source, /unitCostTitle: "Đơn giá nhập"/);
  assert.match(source, /unitPriceUnit: \(unit: string\) => `₫ \/ \$\{unit\}`/);
  assert.match(source, /baseConversionPreview/);
  assert.match(source, /Quy đổi về tồn chuẩn/);
  assert.doesNotMatch(source, /label=\{FORM_VI\.unitPrice\}/);
});

test("stock value surfaces use avg cost then reference cost fallback", () => {
  const listSource = readWorkspaceFile("lib/inventory/stock-on-hand-data.ts");
  const modelSource = readWorkspaceFile("lib/inventory/stock-on-hand-model.ts");
  const detailSource = readWorkspaceFile(
    "app/(protected)/inventory/stock/[ingredientId]/page.tsx",
  );

  assert.match(listSource, /inventoryLineValue/);
  assert.match(listSource, /ingredients \( unit_cost \)/);
  assert.match(modelSource, /row\.avgUnitCost \?\? ingredient\.referenceCost/);
  assert.match(detailSource, /movementUnitCost/);
  assert.doesNotMatch(detailSource, /stockCopy\.table\.wac:\{" "\}/);
});
