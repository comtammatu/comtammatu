import assert from "node:assert/strict";
import { test } from "node:test";
import { getPosOrderStatusInfo } from "../app/(protected)/br/[branchId]/pos/_lib/order-status-display";

const CREATED_AT = "2026-05-25T08:00:00.000Z";

test("POS ready and served order statuses use success tone", () => {
  assert.deepEqual(
    getPosOrderStatusInfo({
      status: "ready",
      payment_status: "unpaid",
      created_at: CREATED_AT,
    }),
    { label: "Sẵn sàng", variant: "success" },
  );

  assert.deepEqual(
    getPosOrderStatusInfo({
      status: "served",
      payment_status: "unpaid",
      created_at: CREATED_AT,
    }),
    { label: "Đã phục vụ", variant: "success" },
  );
});
