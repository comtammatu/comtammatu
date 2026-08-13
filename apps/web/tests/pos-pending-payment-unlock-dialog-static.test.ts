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
const posMessages = read("lib/messages/pos.ts");
const confirmDialog = read("app/components/confirm-dialog.tsx");

test("pending QR unlock uses the shared confirm Dialog, not a custom overlay", () => {
  assert.match(helper, /from "@\/components\/confirm-dialog"/);
  assert.match(helper, /await confirm\(pendingPaymentUnlockConfirmOptions\(\)\)/);
  assert.match(confirmDialog, /from "@comtammatu\/ui\/components\/alert-dialog"/);
  assert.doesNotMatch(helper, /window\.confirm|window\.alert/);
  assert.doesNotMatch(helper, /StationSheet|AppSheet|AppDialog/);
  assert.match(helper, /if \(!input\.locked\) return true/);
  assert.match(helper, /if \(!confirmed\) return false/);
});

test("confirm cancels the pending payment; dismiss keeps the lock", () => {
  assert.match(helper, /fetchPendingRemotePaymentForBill/);
  assert.match(helper, /cancelPendingPayment/);
  assert.match(
    helper,
    /const confirmed = await confirm\([\s\S]*if \(!confirmed\) return false/,
  );
  assert.match(
    helper,
    /if \(!confirmed\) return false[\s\S]*cancelPendingPayment/,
  );
});

test("POS copy asks to cancel the waiting payment code and continue", () => {
  assert.match(
    posMessages,
    /cancelPendingConfirmDescription:\s*"Đơn đã có mã thanh toán đang chờ, bạn có chắc hủy và tiếp tục\?"/,
  );
  assert.match(posMessages, /cancelPendingConfirmAction: "Hủy và tiếp tục"/);
  assert.match(posMessages, /cancelPendingKeep: "Giữ mã"/);
  assert.match(helper, /messages\.pos\.payment\.cancelPendingConfirmDescription/);
  assert.match(helper, /variant: "destructive"/);
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
  assert.match(inner, /confirmAndCancelPendingPayment/);
  assert.match(inner, /handleAppendOrderFromPicker/);
  assert.match(
    inner,
    /isPosOrderAmountLocked\(order\)[\s\S]*confirmAndCancelPendingPayment[\s\S]*startAppendTarget/,
  );
});
