import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const billReceiptSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  ),
  "utf8",
);

const posMessagesSource = readFileSync(
  join(process.cwd(), "lib/messages/pos.ts"),
  "utf8",
);

const confirmPaidBlock =
  /const handleConfirmPaid = useCallback\(async \(\) => \{([\s\S]*?)\n\s*\}, \[/.exec(
    billReceiptSource,
  )?.[1] ?? "";

test("POS only lets the cashier confirm cash; VietQR waits for SePay", () => {
  assert.match(confirmPaidBlock, /buildInvoicePayload\(invoiceForm\)/);
  assert.match(confirmPaidBlock, /confirmCashPaymentWithInvoice\(/);
  assert.doesNotMatch(confirmPaidBlock, /confirmVietQrPaymentWithInvoice\(/);
  assert.match(
    billReceiptSource,
    /Đang chờ SePay xác thực chuyển khoản/,
  );
  assert.doesNotMatch(confirmPaidBlock, /await confirm\(/);
  assert.doesNotMatch(posMessagesSource, /confirmIssue/);
});

test("POS closes a pending VietQR sheet as waiting without confirming payment", () => {
  assert.match(
    billReceiptSource,
    /const isWaitingForVietQr =\s*selectedMethod === "vietqr" && pendingExtras\?\.payment_id != null/,
  );
  assert.match(
    billReceiptSource,
    /variant=\{isWaitingForVietQr \? "default" : "outline"\}/,
  );
  assert.match(
    billReceiptSource,
    /onClick=\{onClose\}[\s\S]*?isWaitingForVietQr[\s\S]*?SELF_ORDER_VI\.paymentReconcileAction/,
  );
});

test("POS payment sheet separates payment step from HĐĐT details", () => {
  assert.match(billReceiptSource, /messages\.pos\.payment\.stepTitle/);
  assert.match(billReceiptSource, /messages\.pos\.payment\.stepDescription/);
  assert.match(billReceiptSource, /<InvoiceFormSection/);
  assert.match(posMessagesSource, /stepTitle: "Bước thanh toán"/);
  assert.match(posMessagesSource, /stepDescription:/);
});
