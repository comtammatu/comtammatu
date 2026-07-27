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

test("ingredient unit dialog names only input and output roles", () => {
  const source = readWorkspaceFile(
    "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  const messages = readWorkspaceFile("lib/messages/inventory-master.ts");

  assert.match(source, /label=\{copy\.units\.inputUnit\}/);
  assert.match(source, /label=\{copy\.units\.outputUnit\}/);
  assert.match(source, /ConversionFactorField/);
  assert.match(source, /\{copy\.units\.conversion\}/);
  assert.match(source, /\{inputUnitName\}/);
  assert.match(source, /\{outputUnitName\}/);
  assert.match(source, /text-muted-foreground">=<\/span>/);
  assert.doesNotMatch(source, /label=\{copy\.units\.colBase\}/);
  assert.doesNotMatch(source, /description=\{copy\.units\./);
  assert.doesNotMatch(
    source,
    /previewCanonical|DEFAULT_UNIT_CONVERSION_INPUT_DIRECTION|Đổi chiều quy đổi/,
  );
  assert.match(messages, /conversion: "Quy đổi"/);
  assert.doesNotMatch(messages, /Số đơn vị xuất \/ 1 đơn vị nhập/);
  assert.doesNotMatch(messages, /1 đơn vị nhập = bao nhiêu đơn vị xuất/);
});

test("GRN entry labels purchase price and conversion without calling it cost basis", () => {
  const source = readWorkspaceFile("lib/inventory/grn-create-copy.ts");

  assert.match(source, /unitCostTitle: "Đơn giá nhập"/);
  assert.match(source, /unitPriceUnit: \(unit: string, unitCost: number\) =>/);
  assert.match(source, /Đơn giá \$\{formatVND\(unitCost\)\} \/ \$\{unit\}/);
  assert.match(source, /baseConversionPreview/);
  assert.match(source, /Quy đổi về tồn chuẩn/);
  assert.doesNotMatch(source, /label=\{FORM_VI\.unitPrice\}/);
});

test("stock value surfaces use avg cost then reference cost fallback", () => {
  const listSource = readWorkspaceFile("lib/inventory/stock-on-hand-data.ts");
  const detailSource = readWorkspaceFile(
    "app/(protected)/inventory/stock/[ingredientId]/page.tsx",
  );

  assert.match(listSource, /inventoryLineValue/);
  assert.match(listSource, /ingredients \( unit_cost \)/);
  assert.match(listSource, /stock\?\.avgUnitCost \?\? referenceCost/);
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
  assert.match(
    dictionary,
    /branchKitchen: \{ short: "Bếp", long: "Bếp chi nhánh" \}/,
  );

  const migration = readWorkspaceFile(
    "../../supabase/migration-archive/20260710101500_normalize_inventory_location_display_names.sql",
  );
  assert.match(migration, /SET name = 'Kho chi nhánh'/);
  assert.match(migration, /SET name = 'Bếp chi nhánh'/);
});
