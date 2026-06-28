import assert from "node:assert/strict";
import { test } from "node:test";
import { mapRpcError } from "../app/_lib/rpc-error-map";
import {
  REFUND_PAID_ORDER_MAPPINGS,
  REFUND_PAID_ORDER_FALLBACK,
} from "../app/(protected)/br/[branchId]/pos/_lib/void-paid-messages";

test("cross_period_invoice maps to accountant routing message", () => {
  const result = mapRpcError(
    { message: "cross_period_invoice" },
    REFUND_PAID_ORDER_MAPPINGS,
    REFUND_PAID_ORDER_FALLBACK,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "pos.void_paid.cross_period_invoice");
  assert.ok(
    result.error?.includes("Kế toán"),
    `expected accountant routing in: ${result.error}`,
  );
});

test("order_in_daily_summary maps to accountant routing message", () => {
  const result = mapRpcError(
    { message: "order_in_daily_summary" },
    REFUND_PAID_ORDER_MAPPINGS,
    REFUND_PAID_ORDER_FALLBACK,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "pos.void_paid.order_in_daily_summary");
  assert.ok(
    result.error?.includes("Kế toán"),
    `expected accountant routing in: ${result.error}`,
  );
});

test("forbidden with code 42501 maps to no-permission message", () => {
  const result = mapRpcError(
    { message: "forbidden", code: "42501" },
    REFUND_PAID_ORDER_MAPPINGS,
    REFUND_PAID_ORDER_FALLBACK,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "DB_PERMISSION_DENIED");
  assert.ok(
    result.error?.includes("không có quyền") ||
      result.error?.includes("Bạn không có quyền"),
    `expected no-permission message in: ${result.error}`,
  );
});

test("code 42501 without 'forbidden' in message maps to no-permission message", () => {
  const result = mapRpcError(
    { message: "permission denied for table orders", code: "42501" },
    REFUND_PAID_ORDER_MAPPINGS,
    REFUND_PAID_ORDER_FALLBACK,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "DB_PERMISSION_DENIED");
});

test("unmapped error returns fallback message", () => {
  const result = mapRpcError(
    { message: "something_else" },
    REFUND_PAID_ORDER_MAPPINGS,
    REFUND_PAID_ORDER_FALLBACK,
  );
  assert.equal(result.success, false);
  assert.equal(result.error, REFUND_PAID_ORDER_FALLBACK.userMessage);
  assert.equal(result.error, "Không thể huỷ đơn đã thanh toán.");
});
