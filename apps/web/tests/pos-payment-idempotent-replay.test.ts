import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Static wiring guards for payment completion and durable HĐĐT job creation.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const paymentActionsSource = read(
  "app/(protected)/br/[branchId]/pos/payment-actions.ts",
);
const invoiceQueriesSource = read(
  "app/(protected)/finance/_lib/invoice-queries.ts",
);
const perOrderInvoiceSource = read("lib/hddt-per-order.ts");

function fnBlock(source: string, name: string): string {
  const block = new RegExp(
    `export async function ${name}\\([\\s\\S]*?\\n\\}`,
  ).exec(source)?.[0];
  assert.ok(block, `expected to find function ${name}`);
  return block;
}

const cashBlock = fnBlock(paymentActionsSource, "confirmCashPaymentWithInvoice");
test("cash completion queues HĐĐT instead of issuing it inline", () => {
  assert.match(cashBlock, /confirmCashPayment\(/);
  assert.match(cashBlock, /invoice: \{ status: "queued" \}/);
  assert.doesNotMatch(cashBlock, /createTaxInvoice\(/);
});

test("POS no longer exposes a cashier VietQR completion action", () => {
  assert.doesNotMatch(paymentActionsSource, /confirmVietQrPaymentWithInvoice/);
  assert.doesNotMatch(paymentActionsSource, /confirm_vietqr_payment/);
});

test("worker-side issuer keeps the active-invoice guard", () => {
  const activeFilter =
    /\.not\("status", "in", '\("cancelled","replaced","not_required"\)'\)/;
  // Same filter in the extracted query helper AND createTaxInvoice's own check.
  assert.match(invoiceQueriesSource, activeFilter);
  assert.match(perOrderInvoiceSource, activeFilter);
});

test("shared createTaxInvoice keeps its duplicate-guard branches so finance accounting cannot silently break", () => {
  assert.match(perOrderInvoiceSource, /error: "Đơn hàng đã có hóa đơn\."/);
  assert.match(perOrderInvoiceSource, /23505/);
});
