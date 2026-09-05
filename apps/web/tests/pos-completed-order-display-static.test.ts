import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getPosCompletedOrderStatusInfo } from "../app/(protected)/br/[branchId]/pos/_lib/order-status-display";
import { assertSqlNotMatch, readSql } from "./_lib/active-sql.ts";

const root = process.cwd();
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(root, path), "utf8");

const archived = read(
  "app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx",
);
const history = read("app/(protected)/br/[branchId]/pos/order-history.tsx");
const inner = read("app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx");
const floorSelect = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-pos-floor-select.ts",
);
const bill = read(
  "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
);
const messages = read("lib/messages/pos.ts");

test("POS completed list uses one hóa đơn vocabulary", () => {
  assert.match(messages, /trigger: "Đơn hoàn thành"/);
  assert.match(messages, /sheetTitle: "Đơn hoàn thành"/);
  assert.match(messages, /viewReceipt: "Xem hóa đơn"/);
  assert.match(messages, /convertCashToVietQr: "Đổi sang VietQR"/);
  assert.match(messages, /printVietQr: "In VietQR"/);
  assert.match(messages, /empty: "Chưa có đơn hoàn thành"/);
  assert.doesNotMatch(messages, /sheetTitle: "Đơn đã xử lý"/);
  assert.doesNotMatch(messages, /viewReceipt: "Xem biên nhận"/);
});

test("POS completed rows are receipt chrome, not live kitchen pills", () => {
  assert.match(archived, /getPosCompletedOrderStatusInfo/);
  assert.match(archived, /metaTimestamp=\{order\.updated_at\}/);
  assert.match(archived, /onViewBill\(order\.id, "receipt"\)/);
  assertSqlNotMatch(archived, /<OrderStatePill/);
  assertSqlNotMatch(archived, /intent: "payment"/);
});

test("POS completed status helper is paid or cancelled only", () => {
  assert.deepEqual(
    getPosCompletedOrderStatusInfo({
      status: "ready",
      payment_status: "paid",
      created_at: "2026-05-25T08:00:00.000Z",
    }),
    { label: "Đã thanh toán", variant: "success" },
  );
  assert.deepEqual(
    getPosCompletedOrderStatusInfo({
      status: "cancelled",
      payment_status: "unpaid",
      created_at: "2026-05-25T08:00:00.000Z",
    }),
    { label: "Đã hủy", variant: "destructive" },
  );
});

test("POS live orders surface cash-call in the same interrupt language", () => {
  assert.match(history, /SELF_ORDER_VI\.cashCallStaff/);
  assert.match(history, /SELF_ORDER_VI\.vietQrPendingStaff/);
  assert.match(inner, /paymentCallByOrderId/);
  assert.match(inner, /usePosFloorSelect/);
  assert.match(floorSelect, /openBill\(paymentCallOrder\.id, "payment"\)/);
});

test("POS receipt intent never mounts Self-Order payment chrome", () => {
  assert.match(bill, /const isReadOnlyOrder =/);
  assert.match(bill, /isReceiptIntent \|\|/);
  assert.match(bill, /order\?\.status === "completed"/);
  assert.match(
    inner,
    /billOrderId === null \|\| billIntent === "receipt"/,
  );
});
