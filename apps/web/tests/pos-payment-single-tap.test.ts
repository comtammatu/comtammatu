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
  assert.match(confirmPaidBlock, /confirmCashPaymentWithInvoice\(/);
  assert.match(
    confirmPaidBlock,
    /confirmCashPaymentWithInvoice\([\s\S]*?cashReceived,[\s\S]*?null/,
  );
  assert.doesNotMatch(confirmPaidBlock, /confirmVietQrPaymentWithInvoice\(/);
  assert.doesNotMatch(
    billReceiptSource,
    /SELF_ORDER_VI\.paymentReconcileDescription/,
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
    /isWaitingForVietQr \? \(\s*<Button[\s\S]*?onClick=\{handleWaitingForVietQrClose\}[\s\S]*?SELF_ORDER_VI\.paymentReconcileAction/,
  );
  assert.match(
    billReceiptSource,
    /size="touch-lg"[\s\S]*?className="w-full"[\s\S]*?SELF_ORDER_VI\.paymentReconcileAction/,
  );
  assert.match(
    billReceiptSource,
    /<PaymentQrCode[\s\S]*?className="max-h-40 max-w-40"/,
  );
  assert.match(billReceiptSource, /REMOTE_PAYMENT_COPY\.createQr/);
  assert.doesNotMatch(billReceiptSource, /autoQrTriggeredRef/);
  assert.doesNotMatch(
    billReceiptSource,
    /Auto-create the QR payment when the bill dialog opens/,
  );
  assert.match(
    billReceiptSource,
    /if \(existingPaymentId != null && !selfOrderPaymentRequestId\)/,
  );
  assert.doesNotMatch(billReceiptSource, /InvoiceFormSection|invoiceForm/);
  assert.match(
    billReceiptSource,
    /aria-pressed=\{isSelected\}/,
  );
  assert.match(
    billReceiptSource,
    /variant="ghost"[\s\S]*?size="touch"[\s\S]*?messages\.pos\.payment\.cancelPending/,
  );
});

test("POS payment sheet delegates HĐĐT buyer details to the receipt QR", () => {
  assert.match(billReceiptSource, /messages\.pos\.payment\.stepTitle/);
  assert.match(billReceiptSource, /messages\.pos\.payment\.stepDescription/);
  assert.doesNotMatch(billReceiptSource, /InvoiceFormSection|invoiceForm/);
  assert.match(posMessagesSource, /stepTitle: "Bước thanh toán"/);
  assert.match(posMessagesSource, /stepDescription:/);
});
