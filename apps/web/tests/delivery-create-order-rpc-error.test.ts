import assert from "node:assert/strict";
import test from "node:test";
import { mapRelayCreateOrderRpcError } from "../lib/delivery/create-order-rpc-error";

test("daily-limit disabled is a stable terminal relay failure", () => {
  assert.deepEqual(
    mapRelayCreateOrderRpcError(
      { message: "daily_limit_item_disabled" },
      "channel price",
    ),
    {
      status: 422,
      code: "daily_limit_item_disabled",
      message: "Có món đã bị tắt bán trong ngày — cần xử lý đơn thủ công",
    },
  );
});

test("daily-limit exhaustion is a stable terminal relay failure", () => {
  assert.equal(
    mapRelayCreateOrderRpcError(
      { message: "daily_limit_exceeded" },
      "channel price",
    ).status,
    422,
  );
});

test("unknown create-order errors remain retryable server failures", () => {
  assert.deepEqual(
    mapRelayCreateOrderRpcError({ message: "database unavailable" }, "unused"),
    {
      status: 500,
      code: "create_order_failed",
      message: "Không thể tạo đơn hàng trên POS",
    },
  );
});
