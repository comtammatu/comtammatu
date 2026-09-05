import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const helper = read(
  "app/(protected)/br/[branchId]/pos/_lib/confirm-cancel-pending-payment.ts",
);
const sheet = read("app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx");
const picker = read(
  "app/(protected)/br/[branchId]/pos/_components/multi-order-table-picker.tsx",
);
const inner = read("app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx");
const floorSelect = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-pos-floor-select.ts",
);
const posMessages = read("lib/messages/pos.ts");

test("pending QR unlock performs non-blocking silent unlock without modal disruption", () => {
  assert.doesNotMatch(helper, /window\.confirm|window\.alert/);
  assert.doesNotMatch(helper, /StationSheet|AppSheet|AppDialog/);
  assert.match(helper, /if \(!input\.locked\) return true/);
  assert.match(helper, /fetchPendingRemotePaymentForBill/);
  assert.match(helper, /cancelPendingPayment/);
});

test("POS copy retains pending payment message definitions", () => {
  assert.match(
    posMessages,
    /cancelPendingConfirmDescription:\s*"Đơn đã có mã thanh toán đang chờ, bạn có chắc hủy và tiếp tục\?"/,
  );
  assert.match(posMessages, /cancelPendingConfirmAction: "Hủy và tiếp tục"/);
  assert.match(posMessages, /cancelPendingKeep: "Giữ mã"/);
});

test("locked amount mutations stay offered and continue after unlock", () => {
  assert.match(sheet, /runAfterPendingPaymentUnlock/);
  assert.match(sheet, /confirmAndCancelPendingPayment/);
  assert.match(sheet, /canOfferPosOrderAppend/);
  assert.match(
    sheet,
    /const canMutateUnpaidOrder = canShowPaymentAction;/,
  );

  for (const action of [
    "onStartAppend",
    "setShowDiscount",
    "setShowServiceCharge",
    "setShowSplit",
    "setShowMerge",
    "setShowCancel",
    "setVoidItemId",
    "setReduceItemId",
    "setDiscountItemId",
    "onStartEditSent",
  ]) {
    assert.match(
      sheet,
      new RegExp(`runAfterPendingPaymentUnlock\\([\\s\\S]*?${action}`),
      `expected ${action} to continue after pending-payment unlock`,
    );
  }

  assert.match(picker, /canOfferPosOrderAppend/);
  assert.match(floorSelect, /confirmAndCancelPendingPayment/);
  assert.match(floorSelect, /handleAppendOrderFromPicker/);
  assert.match(
    floorSelect,
    /isPosOrderAmountLocked\(order\)[\s\S]*confirmAndCancelPendingPayment[\s\S]*startAppendTarget/,
  );
  assert.match(inner, /usePosFloorSelect/);
  assert.match(inner, /handleAppendOrderFromPicker/);
});
