import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  canConvertPosCashToVietQr,
  canPrintPosVietQrPayment,
} from "../app/(protected)/br/[branchId]/pos/_lib/cash-to-vietqr";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const repoRoot = join(root, "../..");

const migration = readFileSync(
  join(
    repoRoot,
    "supabase/migrations/20260816103524_pos_convert_cash_payment_to_vietqr.sql",
  ),
  "utf8",
);
const action = read(
  "app/(protected)/br/[branchId]/pos/payment-actions.ts",
);
const archived = read(
  "app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx",
);
const bill = read(
  "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
);
const messages = read("lib/messages/pos.ts");
const financeDoc = readFileSync(
  join(repoRoot, "docs/modules/finance.md"),
  "utf8",
);

test("cash→VietQR convert is paid cash plus cashier and VietQR config", () => {
  assert.equal(
    canConvertPosCashToVietQr({
      status: "completed",
      paymentStatus: "paid",
      paymentMethod: "cash",
      canConfirmCash: true,
      vietQrEnabled: true,
    }),
    true,
  );
  assert.equal(
    canConvertPosCashToVietQr({
      status: "completed",
      paymentStatus: "paid",
      paymentMethod: "cash",
      canConfirmCash: false,
      vietQrEnabled: true,
    }),
    false,
  );
  assert.equal(
    canConvertPosCashToVietQr({
      status: "completed",
      paymentStatus: "paid",
      paymentMethod: "vietqr",
      canConfirmCash: true,
      vietQrEnabled: true,
    }),
    false,
  );
  assert.equal(
    canConvertPosCashToVietQr({
      status: "cancelled",
      paymentStatus: "paid",
      paymentMethod: "cash",
      canConfirmCash: true,
      vietQrEnabled: true,
    }),
    false,
  );
});

test("VietQR reprint is paid VietQR only", () => {
  assert.equal(
    canPrintPosVietQrPayment({
      status: "completed",
      paymentStatus: "paid",
      paymentMethod: "vietqr",
    }),
    true,
  );
  assert.equal(
    canPrintPosVietQrPayment({
      status: "completed",
      paymentStatus: "paid",
      paymentMethod: "cash",
    }),
    false,
  );
});

test("POS convert RPC is cashier-gated cash→VietQR with payment code and session recalc", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.pos_convert_cash_payment_to_vietqr/,
  );
  assert.match(
    migration,
    /public\.has_permission\(v_order\.branch_id, 'pos:confirm_payment'\)/,
  );
  assert.match(migration, /v_payment\.method IS DISTINCT FROM 'cash'/);
  assert.match(migration, /PERFORM public\.ensure_order_payment_code\(/);
  assert.match(
    migration,
    /provider_ref = COALESCE\(NULLIF\(btrim\(provider_ref\), ''\), v_payment_code\)/,
  );
  assert.match(migration, /method = 'vietqr'/);
  assert.match(
    migration,
    /UPDATE public\.pos_sessions[\s\S]*expected_cash = v_expected_cash/,
  );
  assert.match(migration, /public\.log_audit\(\s*'payment\.method_correct'/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.pos_convert_cash_payment_to_vietqr\(bigint\) TO authenticated/,
  );
  assert.doesNotMatch(migration, /p_new_method/);
});

test("POS convert action uses cash-confirm auth and does not import print-actions", () => {
  assert.match(action, /convertCashPaymentToVietQr = withActionPositional/);
  assert.match(action, /customAuth: posConfirmPaymentAuth/);
  assert.match(action, /"pos_convert_cash_payment_to_vietqr"/);
  assert.doesNotMatch(action, /from "\.\/print-actions"/);
});

test("paid VietQR receipts print transfer QR; cash receipts do not", () => {
  const render = readFileSync(
    join(repoRoot, "packages/print-render/src/materialize.ts"),
    "utf8",
  );
  const receiptPrint = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260816113818_receipt_print_vietqr_for_paid_orders.sql",
    ),
    "utf8",
  );
  assert.match(render, /kind === "receipt" && rawText\(payload, "payment_method"\) === "vietqr"/);
  assert.match(receiptPrint, /v_order\.payment_method = 'vietqr'/);
  assert.match(receiptPrint, /AND method = 'vietqr'/);
  assert.match(receiptPrint, /AND status = 'completed'/);
  assert.match(
    receiptPrint,
    /NEW\.payload->>'payment_method' IS DISTINCT FROM 'vietqr'/,
  );
  assert.doesNotMatch(
    receiptPrint,
    /NEW\.payload := NEW\.payload - 'payment_qr' - 'invoice_qr'/,
  );
  assert.match(receiptPrint, /v_keep_payment_qr/);
});

test("cash→VietQR confirm is outside the pending transition", () => {
  assert.match(
    bill,
    /const confirmed = await confirmConvertCashToVietQr[\s\S]*startPrintTransition\(async/,
  );
  assert.doesNotMatch(
    bill,
    /startPrintTransition\(async \(\) => \{[\s\S]{0,240}confirmConvertCashToVietQr/,
  );
  assert.match(
    archived,
    /const confirmed = await confirmConvertCashToVietQr[\s\S]*startAction\(async/,
  );
  assert.doesNotMatch(
    archived,
    /startAction\(async \(\) => \{[\s\S]{0,240}confirmConvertCashToVietQr/,
  );
});

test("Đơn hoàn thành exposes cash→VietQR convert and VietQR print", () => {
  assert.match(messages, /convertCashToVietQr: "Đổi sang VietQR"/);
  assert.match(messages, /printVietQr: "In VietQR"/);
  assert.match(archived, /canConvertPosCashToVietQr/);
  assert.match(archived, /canPrintPosVietQrPayment/);
  assert.match(archived, /convertCashToVietQrAndPrint/);
  assert.match(archived, /printPaidVietQr/);
  assert.match(bill, /handleConvertCashToVietQr/);
  assert.match(bill, /handlePrintVietQr/);
  assert.match(
    financeDoc,
    /POS completed-order cash→VietQR conversion/,
  );
});
