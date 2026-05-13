import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("POS invoice form defaults to buyer-not-get-invoice instead of opting out", () => {
  const src = read(
    "apps/web/app/br/[branchId]/pos/_components/bill/invoice-form-section.tsx",
  );

  assert.ok(
    !src.includes("if (!state.enabled) return null"),
    "invoice payload must never become null just because buyer details are hidden",
  );
  assert.ok(
    src.includes("BUYER_NOT_GET_INVOICE_NAME"),
    "missing Viettel-style default buyer payload for no-MST sales",
  );
  assert.ok(
    src.includes("buyerNotGetInvoice: true"),
    "missing buyerNotGetInvoice flag for buyer-not-get-invoice sales",
  );
  assert.ok(
    src.includes("Người mua không lấy hóa đơn"),
    "checkbox copy must match Viettel S-Invoice buyer-not-get-invoice mode",
  );
});

test("payment confirm actions always attempt HĐĐT after successful payment", () => {
  const src = read("apps/web/app/br/[branchId]/pos/payment-actions.ts");

  assert.ok(
    src.includes("always attempt HĐĐT issuance"),
    "payment/HĐĐT contract should state mandatory issuance",
  );
  assert.ok(
    !src.includes("data: { ...paymentResult.data, invoice: null }"),
    "successful payment must not return invoice:null without attempting HĐĐT",
  );
  assert.ok(
    src.includes("normalizeInvoicePayload(invoice)"),
    "missing no-MST fallback payload before createTaxInvoice",
  );
});

test("createTaxInvoice does not create new not_required/skipped rows", () => {
  const src = read("apps/web/app/finance/actions.ts");

  assert.ok(
    !/status:\s*"not_required"/.test(src),
    "new tax invoice writes must not use status='not_required'",
  );
  assert.ok(
    !/provider:\s*"skipped"/.test(src),
    "new no-MST sales must call the provider instead of provider='skipped'",
  );
  assert.ok(
    src.includes("BUYER_NOT_GET_INVOICE_NAME"),
    "missing default buyer name for no-MST provider calls",
  );
  assert.ok(
    src.includes("buyerNotGetInvoice"),
    "missing buyerNotGetInvoice pass-through to provider calls",
  );
  assert.ok(
    src.includes("signing_started_at"),
    "provider-submitted invoices must be reconcile-eligible",
  );
  assert.ok(
    src.includes("retryDraftInvoiceId"),
    "provider-rejected draft rows must be retryable after payload/config fixes",
  );
  assert.ok(
    src.includes('.select("id, invoice_number, status")'),
    "POS toast needs persisted invoice status, especially provider failures",
  );
});

test("per-order HĐĐT payload expands POS modifiers and sides", () => {
  const createSrc = read("apps/web/app/finance/actions.ts");
  const replaceSrc = read("apps/web/app/finance/replace-invoice-actions.ts");

  for (const src of [createSrc, replaceSrc]) {
    assert.ok(
      src.includes("order_items") && src.includes("modifiers, sides"),
      "HĐĐT order fetch must include modifier/side snapshots",
    );
    assert.ok(
      src.includes("buildInvoiceLineItemsFromOrderItems(activeItems)"),
      "provider item payload must split main item, paid modifiers, and sides",
    );
  }
});
