import assert from "node:assert/strict";
import { test } from "node:test";
import { mapRpcError } from "../app/_lib/rpc-error-map";
import {
  confirmCashPaymentRpcFallback,
  confirmCashPaymentRpcMappings,
} from "../app/(protected)/br/[branchId]/pos/_lib/payment-messages";
import { METHOD_LABELS } from "../app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-types";

test("POS bill receipt labels completed MoMo payments", () => {
  assert.equal(METHOD_LABELS.momo, "MoMo");
});

test("missing cash-payment RPC does not masquerade as under-payment", () => {
  const result = mapRpcError(
    {
      code: "PGRST202",
      message:
        "Could not find the function public.confirm_cash_payment_with_invoice_binding(p_cash_received, p_order_id) in the schema cache",
    },
    confirmCashPaymentRpcMappings,
    confirmCashPaymentRpcFallback,
  );

  assert.equal(result.success, false);
  assert.equal(
    result.error,
    "Chức năng thanh toán chưa sẵn sàng. Vui lòng liên hệ quản lý.",
  );
});

test("cash under-payment keeps the cashier guidance", () => {
  const result = mapRpcError(
    { message: "cash_received must be >= total" },
    confirmCashPaymentRpcMappings,
    confirmCashPaymentRpcFallback,
  );

  assert.equal(result.success, false);
  assert.equal(result.error, "Tiền nhận phải lớn hơn hoặc bằng tổng cần thu.");
});
