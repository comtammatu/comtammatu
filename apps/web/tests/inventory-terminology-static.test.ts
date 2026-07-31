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

test("ingredient unit dialog names input, output, and optional production roles", () => {
  const source = readWorkspaceFile(
    "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  const messages = readWorkspaceFile("lib/messages/inventory-master.ts");

  assert.match(source, /label=\{copy\.units\.inputUnit\}/);
  assert.match(source, /label=\{copy\.units\.outputUnit\}/);
  assert.match(source, /ConversionFactorField/);
  assert.match(source, /copy\.units\.productionEnabled/);
  assert.match(source, /label=\{copy\.units\.productionUnit\}/);
  assert.match(source, /copy\.units\.conversion\(fromUnitName, toUnitName\)/);
  assert.match(source, /text-muted-foreground">=<\/span>/);
  assert.doesNotMatch(source, /label=\{copy\.units\.colBase\}/);
  assert.doesNotMatch(source, /description=\{copy\.units\./);
  assert.doesNotMatch(
    source,
    /previewCanonical|DEFAULT_UNIT_CONVERSION_INPUT_DIRECTION|Đổi chiều quy đổi/,
  );
  assert.match(messages, /productionEnabled: "Dùng trong sản xuất"/);
  assert.match(messages, /standardUnit:/);
  assert.doesNotMatch(messages, /Số đơn vị xuất \/ 1 đơn vị nhập/);
  assert.doesNotMatch(messages, /1 đơn vị nhập = bao nhiêu đơn vị xuất/);
});

test("GRN entry copy keeps unit conversion and omits purchase-price helpers", () => {
  const source = readWorkspaceFile("lib/inventory/grn-create-copy.ts");

  assert.doesNotMatch(
    source,
    /unitCostTitle|priorPriceLine|unitPriceUnit|priceSetOnPoHint/,
  );
  assert.match(source, /baseConversionPreview/);
  assert.match(source, /Quy đổi về tồn chuẩn/);
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
