import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildCountSlipLineView } from "../lib/inventory/count-slip-model";

test("count slip review keeps entry unit separate from base comparison", () => {
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
  assert.equal(line.systemUnit, "thùng");
  assert.equal(line.varianceUnit, "thùng");
  assert.equal(Number(line.countedBaseQuantity?.toFixed(3)), 0.208);
  assert.equal(Number(line.variance?.toFixed(3)), -2.209);
});

test("count slip review converts employee kg counts before comparing gram stock", () => {
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
  assert.equal(line.systemQuantity, 5000);
  assert.equal(line.systemUnit, "g");
  assert.equal(line.countedBaseQuantity, 5000);
  assert.equal(line.variance, 0);
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

test("employee count UI previews the comparison unit before submission", () => {
  const pageSource = readFileSync(
    join(process.cwd(), "lib/staff-runtime/count/page.tsx"),
    "utf8",
  );
  const clientSource = readFileSync(
    join(process.cwd(), "lib/staff-runtime/count/count-client.tsx"),
    "utf8",
  );
  const sharedInventoryMessages = readFileSync(
    join(process.cwd(), "../../packages/shared/src/messages/inventory.ts"),
    "utf8",
  );

  assert.match(pageSource, /to_base_factor/);
  assert.match(pageSource, /toBaseFactor/);
  assert.match(clientSource, /formatQty/);
  assert.match(clientSource, /buildCountUnitPreview/);
  assert.match(clientSource, /INVENTORY_VI\.convertedColon/);
  assert.match(clientSource, /Đơn vị chuẩn/);
  assert.match(clientSource, /INVENTORY_VI\.conversionMissing/);
  assert.doesNotMatch(clientSource, /\.toLocaleString\("vi-VN"/);
  assert.match(
    sharedInventoryMessages,
    /convertedColon: "Quy đổi về đơn vị chuẩn:"/,
  );
  assert.match(
    sharedInventoryMessages,
    /conversionMissing: "Chưa cấu hình quy đổi"/,
  );
  assert.match(clientSource, /selectedUnit\?\.code/);
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
