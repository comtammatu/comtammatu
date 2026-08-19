import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildCountSlipLineView } from "../lib/inventory/count-slip-model";

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
  assert.match(clientSource, /controlSize="touch"/);
  assert.match(clientSource, /size="touch-lg"/);
  assert.match(clientSource, /FieldGroup/);
  assert.match(clientSource, /sm:grid-cols-2 sm:items-end/);
  assert.doesNotMatch(clientSource, /buildCountUnitPreview/);
  assert.doesNotMatch(clientSource, /INVENTORY_VI\.convertedColon/);
  assert.doesNotMatch(clientSource, /Đơn vị chuẩn/);
  assert.doesNotMatch(clientSource, /minmax\(7\.5rem,9rem\)/);
  assert.doesNotMatch(clientSource, /min-h-12 text-base tabular-nums md:text-sm/);
  assert.doesNotMatch(clientSource, /Ví dụ:/);
  assert.doesNotMatch(clientSource, /\.toLocaleString\("vi-VN"/);
  assert.match(clientSource, /getDefaultCountUnitChoice/);
  assert.match(clientSource, /return getBaseCountUnit\(units\)/);
  assert.doesNotMatch(clientSource, /toBaseFactor > best.toBaseFactor/);
  assert.doesNotMatch(clientSource, /assignment\.measureUnit/);
  assert.doesNotMatch(pageSource, /measureUnit/);
  assert.doesNotMatch(clientSource, /className="w-24 shrink-0"/);
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
