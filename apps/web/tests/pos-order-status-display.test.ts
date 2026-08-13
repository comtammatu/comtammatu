import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getPosOrderStatusInfo } from "../app/(protected)/br/[branchId]/pos/_lib/order-status-display";

const CREATED_AT = "2026-05-25T08:00:00.000Z";
const posSourcePath = "app/(protected)/br/[branchId]/pos";

const orderDetailSource = readFileSync(
  join(process.cwd(), posSourcePath, "order-detail-sheet.tsx"),
  "utf8",
);
const orderHistorySource = readFileSync(
  join(process.cwd(), posSourcePath, "order-history.tsx"),
  "utf8",
);
const posProviderSource = readFileSync(
  join(process.cwd(), posSourcePath, "_providers/pos-desktop-provider.tsx"),
  "utf8",
);
const billSheetSource = readFileSync(
  join(
    process.cwd(),
    posSourcePath,
    "_components/bill/bill-receipt-sheet.tsx",
  ),
  "utf8",
);

test("POS ready status stays distinct while served waits for payment", () => {
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
    { label: "Chưa thanh toán", variant: "outline" },
  );
});

test("POS completed orders never expose the raw English status", () => {
  assert.deepEqual(
    getPosOrderStatusInfo({
      status: "completed",
      payment_status: "unpaid",
      created_at: CREATED_AT,
    }),
    { label: "Đã thanh toán", variant: "success" },
  );
  assert.deepEqual(
    getPosOrderStatusInfo({
      status: "completed",
      payment_status: "paid",
      created_at: CREATED_AT,
    }),
    { label: "Đã thanh toán", variant: "success" },
  );
});

test("POS order-level served action is not exposed to cashier surfaces", () => {
  assert.doesNotMatch(orderDetailSource, /handleStatus\("served"\)/);
  assert.doesNotMatch(orderDetailSource, /updateOrderStatus/);
  assert.doesNotMatch(orderDetailSource, /messages\.pos\.order\.markedServed/);

  assert.doesNotMatch(orderHistorySource, /pos-order-serve/);
  assert.doesNotMatch(orderHistorySource, /onServeOrder/);
  assert.doesNotMatch(orderHistorySource, /messages\.pos\.orderHistory\.serve/);

  assert.doesNotMatch(posProviderSource, /updateOrderStatus/);
  assert.doesNotMatch(posProviderSource, /serveOrder/);

  assert.doesNotMatch(billSheetSource, /showUnservedWarning/);
  assert.doesNotMatch(billSheetSource, /unservedTitle|unservedDescription/);
});
