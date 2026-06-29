import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Static wiring guards for the idempotent-replay path. The behavioral cover
// (executing the decision + the resolve query) lives in
// pos-payment-replay-behavioral.test.ts; this file guards the orchestrator
// wiring those behaviors hang off of.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const paymentActionsSource = read(
  "app/(protected)/br/[branchId]/pos/payment-actions.ts",
);
const invoiceOutcomeSource = read(
  "app/(protected)/br/[branchId]/pos/_lib/invoice-outcome.ts",
);
const invoiceQueriesSource = read(
  "app/(protected)/finance/_lib/invoice-queries.ts",
);
const financeActionsSource = read("app/(protected)/finance/actions.ts");

function fnBlock(source: string, name: string): string {
  const block = new RegExp(
    `export async function ${name}\\([\\s\\S]*?\\n\\}`,
  ).exec(source)?.[0];
  assert.ok(block, `expected to find function ${name}`);
  return block;
}

const cashBlock = fnBlock(paymentActionsSource, "confirmCashPaymentWithInvoice");
const vietqrBlock = fnBlock(
  paymentActionsSource,
  "confirmVietQrPaymentWithInvoice",
);

test("cash orchestrator gates replay on already_completed and delegates the decision", () => {
  assert.match(cashBlock, /status === "already_completed"/);
  assert.match(cashBlock, /resolveExistingInvoiceForOrder\(orderId\)/);
  assert.match(cashBlock, /existingIssuedInvoiceOutcome\(/);
});

test("vietqr orchestrator keys replay off `idempotent`, NOT `status` (it has no status field)", () => {
  assert.match(vietqrBlock, /idempotent === true/);
  assert.match(vietqrBlock, /resolveExistingInvoiceForOrder\(orderId\)/);
  assert.match(vietqrBlock, /existingIssuedInvoiceOutcome\(/);
  assert.doesNotMatch(vietqrBlock, /status === "already_completed"/);
});

test("short-circuit decision accepts only genuinely-issued invoices (behavior tested separately)", () => {
  // The issued/submitted/signing decision lives in the pure, behaviorally-tested
  // existingIssuedInvoiceOutcome (pos-payment-replay-behavioral.test.ts). Guard
  // that the three lodged states stay defined together here.
  assert.match(invoiceOutcomeSource, /"issued"/);
  assert.match(invoiceOutcomeSource, /"submitted"/);
  assert.match(invoiceOutcomeSource, /"signing"/);
});

test("the benign-replay decision is never made by matching the duplicate-invoice copy", () => {
  assert.doesNotMatch(cashBlock, /Đơn hàng đã có hóa đơn/);
  assert.doesNotMatch(vietqrBlock, /Đơn hàng đã có hóa đơn/);
});

test("resolve helper is exported and its filter matches createTaxInvoice (no drift)", () => {
  assert.match(
    financeActionsSource,
    /export async function resolveExistingInvoiceForOrder\(/,
  );
  const activeFilter =
    /\.not\("status", "in", '\("cancelled","replaced","not_required"\)'\)/;
  // Same filter in the extracted query helper AND createTaxInvoice's own check.
  assert.match(invoiceQueriesSource, activeFilter);
  assert.match(financeActionsSource, activeFilter);
});

test("shared createTaxInvoice keeps its duplicate-guard branches so finance accounting cannot silently break", () => {
  assert.match(financeActionsSource, /error: "Đơn hàng đã có hóa đơn\."/);
  assert.match(financeActionsSource, /23505/);
});
