import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";
import {
  canConvertPosCashToVietQr,
  canPrintPosVietQrPayment,
} from "../app/(protected)/br/[branchId]/pos/_lib/cash-to-vietqr";

const root = process.cwd();
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(root, path), "utf8");
const repoRoot = join(root, "../..");

const migration = readSql(repoRoot, "supabase/migrations/20260816103524_pos_convert_cash_payment_to_vietqr.sql");
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
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.pos_convert_cash_payment_to_vietqr/,
  );
  assertSqlMatch(
    migration,
    /public\.has_permission\(v_order\.branch_id, 'pos:confirm_payment'\)/,
  );
  assertSqlMatch(migration, /v_payment\.method IS DISTINCT FROM 'cash'/);
  assertSqlMatch(migration, /PERFORM public\.ensure_order_payment_code\(/);
  assertSqlMatch(
    migration,
    /provider_ref = COALESCE\(NULLIF\(btrim\(provider_ref\), ''\), v_payment_code\)/,
  );
  assertSqlMatch(migration, /method = 'vietqr'/);
  assertSqlMatch(
    migration,
    /UPDATE public\.pos_sessions[\s\S]*expected_cash = v_expected_cash/,
  );
  assertSqlMatch(migration, /public\.log_audit\(\s*'payment\.method_correct'/);
  assertSqlMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.pos_convert_cash_payment_to_vietqr\(bigint\) TO authenticated/,
  );
  assertSqlNotMatch(migration, /p_new_method/);
});

test("POS convert action uses cash-confirm auth and does not import print-actions", () => {
  assertSqlMatch(action, /convertCashPaymentToVietQr = withActionPositional/);
  assertSqlMatch(action, /customAuth: posConfirmPaymentAuth/);
  assertSqlMatch(action, /"pos_convert_cash_payment_to_vietqr"/);
  assert.doesNotMatch(action, /from "\.\/print-actions"/);
});

test("paid VietQR receipts print transfer QR; cash receipts do not", () => {
  const render = readFileSync(
    join(repoRoot, "packages/print-render/src/materialize.ts"),
    "utf8",
  );
  const receiptPrint = readSql(repoRoot, "supabase/migrations/20260816113818_receipt_print_vietqr_for_paid_orders.sql");
  assertSqlMatch(render, /kind === "receipt" && rawText\(payload, "payment_method"\) === "vietqr"/);
  assertSqlMatch(receiptPrint, /v_order\.payment_method = 'vietqr'/);
  assertSqlMatch(receiptPrint, /AND method = 'vietqr'/);
  assertSqlMatch(receiptPrint, /AND status = 'completed'/);
  assertSqlMatch(
    receiptPrint,
    /NEW\.payload->>'payment_method' IS DISTINCT FROM 'vietqr'/,
  );
  assert.doesNotMatch(
    receiptPrint,
    /NEW\.payload := NEW\.payload - 'payment_qr' - 'invoice_qr'/,
  );
  assertSqlMatch(receiptPrint, /v_keep_payment_qr/);
});

test("cash→VietQR confirm is outside the pending transition", () => {
  assertSqlMatch(
    bill,
    /const confirmed = await confirmConvertCashToVietQr[\s\S]*startPrintTransition\(async/,
  );
  assert.doesNotMatch(
    bill,
    /startPrintTransition\(async \(\) => \{[\s\S]{0,240}confirmConvertCashToVietQr/,
  );
  assertSqlMatch(
    archived,
    /const confirmed = await confirmConvertCashToVietQr[\s\S]*startAction\(async/,
  );
  assertSqlNotMatch(archived,
    /startAction\(async \(\) => \{[\s\S]{0,240}confirmConvertCashToVietQr/,
  );
});

test("Đơn hoàn thành exposes cash→VietQR convert and VietQR print", () => {
  assertSqlMatch(messages, /convertCashToVietQr: "Đổi sang VietQR"/);
  assertSqlMatch(messages, /printVietQr: "In VietQR"/);
  assertSqlMatch(archived, /canConvertPosCashToVietQr/);
  assertSqlMatch(archived, /canPrintPosVietQrPayment/);
  assertSqlMatch(archived, /convertCashToVietQrAndPrint/);
  assertSqlMatch(archived, /printPaidVietQr/);
  assertSqlMatch(bill, /handleConvertCashToVietQr/);
  assertSqlMatch(bill, /handlePrintVietQr/);
  assertSqlMatch(
    financeDoc,
    /POS completed-order cash→VietQR conversion/,
  );
});
