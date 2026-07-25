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
  assert.match(billReceiptSource, /SELF_ORDER_VI\.paymentReconcileDescription/);
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
  assert.match(
    billReceiptSource,
    /<PaymentQrCode[\s\S]*?className="max-h-56 max-w-56"/,
  );
  assert.doesNotMatch(billReceiptSource, /InvoiceFormSection|invoiceForm/);
  assert.match(billReceiptSource, /role="status"/);
});

test("POS payment sheet delegates HĐĐT buyer details to the receipt QR", () => {
  assert.match(billReceiptSource, /messages\.pos\.payment\.stepTitle/);
  assert.match(billReceiptSource, /messages\.pos\.payment\.stepDescription/);
  assert.doesNotMatch(billReceiptSource, /InvoiceFormSection|invoiceForm/);
  assert.match(posMessagesSource, /stepTitle: "Bước thanh toán"/);
  assert.match(posMessagesSource, /stepDescription:/);
});
