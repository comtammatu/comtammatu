import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const paymentActionsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/payment-actions.ts",
  ),
  "utf8",
);

const financeActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/finance/actions.ts"),
  "utf8",
);

const reexportSource = readFileSync(
  join(process.cwd(), "app/_actions/finance.ts"),
  "utf8",
);

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

test("cash orchestrator short-circuits an idempotent replay via the existing-invoice resolve", () => {
  assert.match(cashBlock, /status === "already_completed"/);
  assert.match(cashBlock, /resolveExistingInvoiceForOrder\(orderId\)/);
  assert.match(cashBlock, /mapTaxInvoiceOutcome\(existing\.data\)/);
});

test("vietqr orchestrator keys replay off `idempotent`, NOT `status` (it has no status field)", () => {
  assert.match(vietqrBlock, /idempotent === true/);
  assert.match(vietqrBlock, /resolveExistingInvoiceForOrder\(orderId\)/);
  // VietQR's result carries no `status` field — keying off it would be dead code.
  assert.doesNotMatch(vietqrBlock, /status === "already_completed"/);
});

test("short-circuit only fires for a genuinely-issued invoice (compliance: never fake success)", () => {
  for (const block of [cashBlock, vietqrBlock]) {
    assert.match(block, /existing\.data\.status === "issued"/);
    assert.match(block, /existing\.data\.status === "submitted"/);
    assert.match(block, /existing\.data\.status === "signing"/);
  }
});

test("the benign-replay decision is made on invoice status, never by matching the duplicate-invoice copy", () => {
  assert.doesNotMatch(cashBlock, /Đơn hàng đã có hóa đơn/);
  assert.doesNotMatch(vietqrBlock, /Đơn hàng đã có hóa đơn/);
});

test("resolve helper is exported and re-exported through the POS finance boundary", () => {
  assert.match(
    financeActionsSource,
    /export async function resolveExistingInvoiceForOrder\(/,
  );
  // Byte-identical existing-invoice filter to createTaxInvoice (no drift).
  assert.match(
    financeActionsSource,
    /\.not\("status", "in", '\("cancelled","replaced","not_required"\)'\)/g,
  );
  assert.match(
    reexportSource,
    /export async function resolveExistingInvoiceForOrder\(/,
  );
});

test("shared createTaxInvoice keeps its duplicate-guard branches so finance accounting cannot silently break", () => {
  // Existing-active-invoice guard (drives finance reissue/UI counters).
  assert.match(financeActionsSource, /error: "Đơn hàng đã có hóa đơn\."/);
  // Concurrent-insert unique-violation guard.
  assert.match(financeActionsSource, /23505/);
});
