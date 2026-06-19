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

test("POS payment confirmation runs from the Đã thanh toán button without an extra confirm dialog", () => {
  assert.match(confirmPaidBlock, /buildInvoicePayload\(invoiceForm\)/);
  assert.match(confirmPaidBlock, /confirmCashPaymentWithInvoice\(/);
  assert.match(confirmPaidBlock, /confirmVietQrPaymentWithInvoice\(/);
  assert.doesNotMatch(confirmPaidBlock, /await confirm\(/);
  assert.doesNotMatch(billReceiptSource, /confirm-dialog/);
  assert.doesNotMatch(posMessagesSource, /confirmIssue/);
});
