import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
  formatVND,
  formatAccountingVND,
  formatCount,
  formatVNBusinessDate,
  resolveLabelByContext,
  ORDER_VI,
  BRANCH_VI,
  STAFF_VI,
  PRODUCT_VI,
  VN_TIME_ZONE,
  VN_BUSINESS_DAY_CUTOFF_HOUR,
} from "../lib/branch-operator/index.ts";

test("branch-operator barrel exports components and SSOT helpers", () => {
  assert.equal(typeof BranchOperatorPage, "function");
  assert.equal(typeof BranchOperatorPanel, "function");
  assert.equal(VN_TIME_ZONE, "Asia/Ho_Chi_Minh");
  assert.equal(VN_BUSINESS_DAY_CUTOFF_HOUR, 4);

  // Currency
  assert.equal(formatVND(45000), "45.000đ");
  assert.equal(formatVND(0), "0đ");
  assert.equal(formatAccountingVND(1234.5), "1.234,50đ");

  // Count
  assert.equal(formatCount(1200), "1.200");

  // Date
  assert.equal(formatVNBusinessDate("2026-09-08"), "08/09/2026");

  // Labels
  assert.equal(ORDER_VI.short, "Đơn bán");
  assert.equal(ORDER_VI.long, "Đơn hàng bán");
  assert.equal(BRANCH_VI.acronym, "CN");
  assert.equal(STAFF_VI.shortBadge, "NV");
  assert.equal(PRODUCT_VI.posItem, "Món");
  assert.equal(PRODUCT_VI.inventoryItem, "Mặt hàng");
  assert.equal(PRODUCT_VI.rawIngredient, "Nguyên liệu");
});

test("resolveLabelByContext follows Short Ladder Contract", () => {
  const variants = {
    short: "Đơn bán",
    long: "Đơn hàng bán",
  };

  assert.equal(resolveLabelByContext(variants, "button"), "Đơn bán");
  assert.equal(resolveLabelByContext(variants, "tab"), "Đơn bán");
  assert.equal(resolveLabelByContext(variants, "badge"), "Đơn bán");
  assert.equal(resolveLabelByContext(variants, "navigation"), "Đơn bán");
  assert.equal(resolveLabelByContext(variants, "heading"), "Đơn hàng bán");
  assert.equal(resolveLabelByContext(variants, "table"), "Đơn hàng bán");
});
