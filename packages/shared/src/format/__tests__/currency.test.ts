import assert from "node:assert/strict";
import test from "node:test";
import { INVENTORY_VI } from "../../messages/inventory";
import {
  formatCount,
  formatAccountingVND,
  formatPercent,
  formatQuantity,
  formatVND,
  parseVietnameseNumericImport,
} from "../currency";

test("vi-VN display formatters use dot grouping and comma fractions", () => {
  assert.equal(formatVND(45_000), "45.000đ");
  assert.equal(formatVND(1_234.5), "1.234,5đ");
  assert.equal(formatVND("1234.50"), "1.234,5đ");
  assert.equal(formatAccountingVND(1_234.5), "1.234,50đ");
  assert.equal(formatAccountingVND("invalid"), "0,00đ");
  assert.equal(formatCount(1_234), "1.234");
  assert.equal(formatQuantity(1_234.5), "1.234,5");
  assert.equal(formatPercent(12.5), "12,5%");
  assert.equal(formatPercent(12.345, 2), "12,35%");
});

test("inventory message percentages use the shared vi-VN formatter", () => {
  assert.equal(
    INVENTORY_VI.branchTodayUsage("1.000đ", "2.000đ", 12.5),
    "Chi nhánh hôm nay: 1.000đ / 2.000đ (12,5%)",
  );
});

test("vi-VN import parser accepts supported locale variants without changing magnitude", () => {
  const cases = [
    ["1,5", "1.5"],
    ["1.5", "1.5"],
    ["1.234", "1234"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
  ] as const;

  for (const [input, canonical] of cases) {
    const result = parseVietnameseNumericImport(input, {
      maxFractionDigits: 3,
    });
    assert.equal(result.state, "valid", input);
    if (result.state === "valid") assert.equal(result.canonical, canonical);
  }

  assert.notEqual(
    parseVietnameseNumericImport("1.234.56", { maxFractionDigits: 3 }).state,
    "valid",
  );
  assert.notEqual(
    parseVietnameseNumericImport("1,234", { maxFractionDigits: 0 }).state,
    "valid",
  );
  assert.equal(
    parseVietnameseNumericImport("9007199254740993", {
      maxFractionDigits: 0,
    }).state,
    "invalid",
  );
});
