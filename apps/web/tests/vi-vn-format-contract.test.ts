import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { formatConversionFactorDisplay } from "../app/(protected)/inventory/_lib/unit-conversion-input";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const businessDateFieldSource = readWeb(
  "app/components/form/business-date-field.tsx",
);
const ingredientImportSource = readWeb(
  "app/(protected)/inventory/ingredient-actions.ts",
);
const recipeImportSource = readWeb(
  "app/(protected)/inventory/production-recipe-actions.ts",
);
const menuImportSource = readWeb("app/(protected)/menu/actions.ts");
const inventoryMessageSource = readWeb("lib/messages/inventory.ts");
const employeeMessageSource = readWeb("lib/messages/employee.ts");
const hrMessageSource = readWeb("lib/messages/hr.ts");
const payslipSource = readWeb("lib/staff-runtime/payslip/payslip-client.tsx");

test("business-date picker displays and navigates in Vietnamese", () => {
  assert.match(
    businessDateFieldSource,
    /import \{ Calendar, vi \} from "@comtammatu\/ui\/components\/calendar"/,
  );
  assert.match(businessDateFieldSource, /formatVNBusinessDate\(rawValue\)/);
  assert.match(businessDateFieldSource, /<Calendar[\s\S]*locale=\{vi\}/);
});

test("inventory CSV imports use the strict shared locale parser", () => {
  for (const source of [ingredientImportSource, recipeImportSource]) {
    assert.match(source, /parseVietnameseNumericImport/);
  }

  assert.doesNotMatch(ingredientImportSource, /replace\(\/\[,\\s\]\//);
  assert.doesNotMatch(recipeImportSource, /const decimalComma/);
  assert.match(ingredientImportSource, /Số phải theo định dạng vi-VN/);
  assert.match(recipeImportSource, /Number\.isSafeInteger\(n\)/);
});

test("menu spreadsheet imports normalize vi-VN numbers before validation", () => {
  assert.match(menuImportSource, /parseVietnameseNumericImport/);
  assert.match(menuImportSource, /function parseMenuImportNumber/);
  assert.match(menuImportSource, /maxFractionDigits: 0/);
  assert.match(
    menuImportSource,
    /const importItemRowSchema[\s\S]*base_price: z\.number\(\)/,
  );
});

test("inventory threshold copy formats fractional quantities", () => {
  assert.match(inventoryMessageSource, /import \{ formatCount, formatQuantity \}/);
  assert.match(inventoryMessageSource, /Tồn \$\{formatQuantity\(current\)\}/);
  assert.match(inventoryMessageSource, /Ngưỡng \$\{formatQuantity\(reorder\)\}/);
});

test("operational copy formats fractional quantities and workday balances", () => {
  assert.match(inventoryMessageSource, /formatQuantity\(required\)/);
  assert.match(inventoryMessageSource, /formatQuantity\(delivered\)/);
  assert.match(employeeMessageSource, /formatDecimal\(payable, 1\)/);
  assert.match(hrMessageSource, /formatDecimal\(remaining, 1\)/);
  assert.match(
    payslipSource,
    /formatDecimal\(Number\(selected\.working_days\), 1\)/,
  );
});

test("unit-conversion previews stay Vietnamese while storage remains canonical", () => {
  assert.equal(formatConversionFactorDisplay(1.5), "1,5");
  assert.equal(formatConversionFactorDisplay(1_234.5), "1.234,5");
});
