import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildCountSlipLineView,
  countSlipQuantityDisplayUnits,
  formatCountSlipComparableQuantities,
} from "../lib/inventory/count-slip-model";
import { formatQty } from "../lib/inventory/format";
import { formatQuantityInLargestUnits } from "../lib/inventory/quantity-unit-format";

const viNumber = (value: number): string =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value);

test("count slip review promotes base quantities into the largest convertible units", () => {
  const units = [
    {
      unit_code: "ml",
      to_base_factor: 1,
      is_base: true,
      is_active: true,
      sort_order: 0,
    },
    {
      unit_code: "lít",
      to_base_factor: 1000,
      is_base: false,
      is_active: true,
      sort_order: 1,
    },
  ];

  assert.equal(formatQuantityInLargestUnits(5320, units, viNumber), "5 lít 320 ml");
  assert.equal(formatQuantityInLargestUnits(3, units, viNumber), "3 ml");
  assert.equal(formatQuantityInLargestUnits(6.4, units, viNumber), "6,4 ml");
  assert.equal(
    formatQuantityInLargestUnits(-5317, units, viNumber),
    "−5 lít 317 ml",
  );

  const line = buildCountSlipLineView({
    id: 109,
    ingredientId: 77,
    ingredientName: "Nước mắm Má Tư",
    systemQuantity: 5320,
    countedQuantity: 3,
    countedBaseQuantity: 3,
    currentLiveQuantity: 4960,
    entryUnitId: 1,
    entryUnitCode: "ml",
    baseUnitCode: "ml",
    toBaseFactor: 1,
    displayUnits: units,
    note: null,
  });

  assert.equal(line.systemBaseQuantity, 5320);
  assert.equal(line.countedBaseQuantity, 3);
  assert.equal(line.varianceBaseQuantity, -5317);
  assert.equal(line.currentLiveBaseQuantity, 4960);
  assert.deepEqual(line.displayUnits, units);
});

test("count slip review keeps book and counted leftovers on the employee unit ladder", () => {
  const orangeUnits = [
    {
      unit_code: "g",
      to_base_factor: 1,
      is_base: true,
      is_active: true,
      sort_order: 0,
    },
    {
      unit_code: "kg",
      to_base_factor: 1000,
      is_base: false,
      is_active: true,
      sort_order: 1,
    },
    {
      unit_code: "trái",
      to_base_factor: 20,
      is_base: false,
      is_active: true,
      sort_order: 2,
    },
  ];

  assert.equal(
    formatQuantityInLargestUnits(1542, orangeUnits, formatQty),
    "1 kg 542 g",
  );
  assert.equal(
    formatQuantityInLargestUnits(2380, orangeUnits, formatQty),
    "2 kg 19 trái",
  );

  const line = buildCountSlipLineView({
    id: 1004,
    ingredientId: 72,
    ingredientName: "Trái cam",
    systemQuantity: 1542,
    countedQuantity: 2.38,
    countedBaseQuantity: 2380,
    entryUnitId: 16,
    entryUnitCode: "kg",
    baseUnitCode: "g",
    toBaseFactor: 1000,
    displayUnits: orangeUnits,
    note: null,
  });
  const comparable = countSlipQuantityDisplayUnits(line);
  const formatted = formatCountSlipComparableQuantities(line, formatQty);

  assert.equal(
    formatQuantityInLargestUnits(line.systemBaseQuantity, comparable, formatQty),
    "1 kg 542 g",
  );
  assert.equal(
    formatQuantityInLargestUnits(line.countedBaseQuantity ?? 0, comparable, formatQty),
    "2 kg 380 g",
  );
  assert.equal(formatted.system, "1 kg 542 g");
  assert.equal(formatted.counted, "2 kg 380 g");
  assert.equal(formatted.variance, "+838 g");
  assert.equal(line.varianceBaseQuantity, 838);
});

test("count slip review keeps packaging remainder on the same locked ladder", () => {
  const units = [
    {
      unit_code: "lon",
      to_base_factor: 1,
      is_base: true,
      is_active: true,
      sort_order: 0,
    },
    {
      unit_code: "thùng",
      to_base_factor: 24,
      is_base: false,
      is_active: true,
      sort_order: 1,
    },
  ];
  const line = buildCountSlipLineView({
    id: 4,
    ingredientId: 143,
    ingredientName: "Coca Cola",
    systemQuantity: 93,
    countedQuantity: 4,
    countedBaseQuantity: 96,
    entryUnitId: 2,
    entryUnitCode: "thùng",
    baseUnitCode: "lon",
    toBaseFactor: 24,
    displayUnits: units,
    note: null,
  });
  const formatted = formatCountSlipComparableQuantities(line, formatQty);
  assert.equal(formatted.system, "3 thùng 21 lon");
  assert.equal(formatted.counted, "4 thùng");
  assert.equal(formatted.variance, "+3 lon");
});

test("count slip review compares book and counted qty in the employee unit", () => {
  const line = buildCountSlipLineView({
    id: 1,
    ingredientName: "Nước Suối - Thành Phẩm",
    systemQuantity: 2.417,
    countedQuantity: 5,
    entryUnitId: 10,
    entryUnitCode: "chai",
    baseUnitCode: "thùng",
    toBaseFactor: 1 / 24,
    note: null,
  });

  assert.equal(line.countedQuantity, 5);
  assert.equal(line.countedUnit, "chai");
  assert.equal(line.systemUnit, "chai");
  assert.equal(line.varianceUnit, "chai");
  assert.equal(Number(line.systemQuantity.toFixed(3)), 58.008);
  assert.equal(Number(line.countedBaseQuantity?.toFixed(3)), 0.208);
  assert.equal(Number(line.variance?.toFixed(3)), -53.008);
});

test("count slip review converts gram book stock into the employee kg unit", () => {
  const line = buildCountSlipLineView({
    id: 2,
    ingredientName: "Sườn cây",
    systemQuantity: 5000,
    countedQuantity: 5,
    entryUnitId: 20,
    entryUnitCode: "kg",
    baseUnitCode: "g",
    toBaseFactor: 1000,
    note: null,
  });

  assert.equal(line.countedQuantity, 5);
  assert.equal(line.countedUnit, "kg");
  assert.equal(line.systemQuantity, 5);
  assert.equal(line.systemUnit, "kg");
  assert.equal(line.countedBaseQuantity, 5000);
  assert.equal(line.variance, 0);
  assert.equal(line.varianceUnit, "kg");
});

test("count slip review keeps Coca comparison in lon when staff counted lon", () => {
  const line = buildCountSlipLineView({
    id: 3,
    ingredientName: "Coca Cola",
    systemQuantity: 93,
    countedQuantity: 93,
    entryUnitId: 1,
    entryUnitCode: "lon",
    baseUnitCode: "lon",
    toBaseFactor: 1,
    note: null,
  });

  assert.equal(line.systemQuantity, 93);
  assert.equal(line.systemUnit, "lon");
  assert.equal(line.countedQuantity, 93);
  assert.equal(line.countedUnit, "lon");
  assert.equal(line.variance, 0);
  assert.equal(line.varianceUnit, "lon");
});

test("count slip review converts lon book stock when staff counted thùng", () => {
  const line = buildCountSlipLineView({
    id: 4,
    ingredientName: "Coca Cola",
    systemQuantity: 93,
    countedQuantity: 4,
    entryUnitId: 2,
    entryUnitCode: "thùng",
    baseUnitCode: "lon",
    toBaseFactor: 24,
    note: null,
  });

  assert.equal(line.systemQuantity, 3.875);
  assert.equal(line.systemUnit, "thùng");
  assert.equal(line.countedQuantity, 4);
  assert.equal(line.countedUnit, "thùng");
  assert.equal(line.countedBaseQuantity, 96);
  assert.equal(line.variance, 0.125);
  assert.equal(line.varianceUnit, "thùng");
});

test("count slip review withholds variance when the entry unit cannot convert", () => {
  const line = buildCountSlipLineView({
    id: 5,
    ingredientName: "Coca Cola",
    systemQuantity: 93,
    countedQuantity: 4,
    entryUnitId: 2,
    entryUnitCode: "thùng",
    baseUnitCode: "lon",
    toBaseFactor: null,
    note: null,
  });

  assert.equal(line.systemQuantity, 93);
  assert.equal(line.systemUnit, "lon");
  assert.equal(line.countedQuantity, 4);
  assert.equal(line.countedUnit, "thùng");
  assert.equal(line.countedBaseQuantity, null);
  assert.equal(line.variance, null);
});

test("count slip review formats book counted and variance through one locked formatter", () => {
  const ownerSource = readFileSync(
    join(process.cwd(), "app/(protected)/inventory/count-slips/count-slips-client.tsx"),
    "utf8",
  );
  const branchSource = readFileSync(
    join(
      process.cwd(),
      "app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    ),
    "utf8",
  );
  const inventory = readFileSync(
    join(import.meta.dirname, "../../../docs/ref/inventory.md"),
    "utf8",
  );
  const screenMap = readFileSync(
    join(import.meta.dirname, "../../../docs/ref/screen-context-map.md"),
    "utf8",
  );

  assert.match(ownerSource, /formatCountSlipComparableQuantities/);
  assert.match(branchSource, /formatCountSlipComparableQuantities/);
  assert.doesNotMatch(ownerSource, /formatQuantityInLargestUnits/);
  assert.doesNotMatch(branchSource, /formatQuantityInLargestUnits/);
  assert.match(
    inventory,
    /Tồn lúc gửi, Thực đếm và Chênh lệch luôn cùng một thang khóa/,
  );
  assert.match(screenMap, /luôn cùng một thang khóa/);
  assert.doesNotMatch(screenMap, /đơn vị lớn nhất có số lượng ít nhất 1/);
});

test("count slip review no longer trusts mixed-unit generated variance", () => {
  const source = readFileSync(
    join(process.cwd(), "app/(protected)/inventory/count-slips/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /\n\s*variance,/);
  assert.match(source, /to_base_factor/);
  assert.match(source, /buildCountSlipLineView/);
});

test("count slip review resolves submitted employee names through service lookup", () => {
  const source = readFileSync(
    join(process.cwd(), "app/(protected)/inventory/count-slips/page.tsx"),
    "utf8",
  );

  assert.match(source, /createServiceClient/);
  assert.match(source, /const employeeNameById = new Map<number, string>\(\)/);
  assert.match(
    source,
    /\.from\("employees"\)[\s\S]*\.select\("id, profiles\(full_name\)"\)[\s\S]*\.in\("id", employeeIds\)/,
  );
  assert.match(
    source,
    /employeeNameById\.get\(Number\(slip\.employee_id\)\)\s*\?\?/,
  );
});

test("employee count UI uses named touch sizes without extra unit hints", () => {
  const pageSource = readFileSync(
    join(process.cwd(), "lib/staff-runtime/count/page.tsx"),
    "utf8",
  );
  const clientSource = readFileSync(
    join(process.cwd(), "lib/staff-runtime/count/count-client.tsx"),
    "utf8",
  );

  assert.match(pageSource, /to_base_factor/);
  assert.match(pageSource, /toBaseFactor/);
  assert.match(clientSource, /formatQty/);
  assert.match(clientSource, /NumberPadSheet/);
  assert.match(clientSource, /size="touch-lg"/);
  assert.match(clientSource, /size="touch"/);
  assert.doesNotMatch(clientSource, /buildCountUnitPreview/);
  assert.doesNotMatch(clientSource, /INVENTORY_VI\.convertedColon/);
  assert.doesNotMatch(clientSource, /Đơn vị chuẩn/);
  assert.doesNotMatch(clientSource, /minmax\(7\.5rem,9rem\)/);
  assert.doesNotMatch(clientSource, /min-h-12 text-base tabular-nums md:text-sm/);
  assert.doesNotMatch(clientSource, /Ví dụ:/);
  assert.doesNotMatch(clientSource, /\.toLocaleString\("vi-VN"/);
  assert.match(clientSource, /getDefaultCountUnitChoice/);
  assert.match(clientSource, /const largest = getLargestIngredientUnit\(options\)/);
  assert.doesNotMatch(
    clientSource,
    /function getDefaultCountUnitChoice\([^)]*\) \{\s*return getBaseCountUnit\(units\);\s*\}/,
  );
  assert.doesNotMatch(clientSource, /toBaseFactor > best.toBaseFactor/);
  assert.doesNotMatch(clientSource, /assignment\.measureUnit/);
  assert.doesNotMatch(pageSource, /measureUnit/);
  assert.doesNotMatch(clientSource, /className="w-24 shrink-0"/);
  assert.doesNotMatch(clientSource, /grid-cols-2/);
});

test("stocktake count UI previews conversion to base unit before submission", () => {
  const pageSource = readFileSync(
    join(
      process.cwd(),
      "app/(protected)/inventory/stocktake/[id]/count/page.tsx",
    ),
    "utf8",
  );
  const clientSource = readFileSync(
    join(
      process.cwd(),
      "app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
    ),
    "utf8",
  );
  const wizardSource = readFileSync(
    join(
      process.cwd(),
      "app/(protected)/inventory/stocktake/[id]/count/stocktake-count-wizard.tsx",
    ),
    "utf8",
  );
  const sharedInventoryMessages = readFileSync(
    join(process.cwd(), "../../packages/shared/src/messages/inventory.ts"),
    "utf8",
  );

  assert.match(pageSource, /to_base_factor/);
  assert.match(pageSource, /toBaseFactor/);
  assert.match(clientSource, /buildCountUnitPreview/);
  assert.match(clientSource, /INVENTORY_VI\.convertedColon/);
  assert.match(clientSource, /INVENTORY_VI\.conversionMissing/);
  assert.match(
    sharedInventoryMessages,
    /convertedColon: "Quy đổi về đơn vị chuẩn:"/,
  );
  assert.match(
    sharedInventoryMessages,
    /conversionMissing: "Chưa cấu hình quy đổi"/,
  );
  assert.match(clientSource, /unitPreviewByIngredient/);
  assert.match(wizardSource, /unitPreviewByIngredient/);
});
