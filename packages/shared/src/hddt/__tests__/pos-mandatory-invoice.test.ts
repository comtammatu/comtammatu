import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("POS invoice form defaults to buyer-not-get-invoice instead of opting out", () => {
  const src = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/invoice-form-section.tsx",
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
  const src = read(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );

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
  const src = read("apps/web/app/(protected)/finance/actions.ts");

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
  const createSrc = read("apps/web/app/(protected)/finance/actions.ts");
  const replaceSrc = read(
    "apps/web/app/(protected)/finance/replace-invoice-actions.ts",
  );

  for (const src of [createSrc, replaceSrc]) {
    assert.ok(
      src.includes("order_items") && src.includes("modifiers, sides"),
      "HĐĐT order fetch must include modifier/side snapshots",
    );
    assert.ok(
      src.includes("buildInvoiceLineItemsFromOrderItems(activeItems)"),
      "provider item payload must split main item, paid modifiers, and sides",
    );
    assert.ok(
      src.includes("order_discount_amount"),
      "HĐĐT order fetch must include order-level POS discount source",
    );
    assert.ok(
      src.includes("subtotal, discount_amount"),
      "HĐĐT order item fetch must include item-level POS discount_amount",
    );
    assert.ok(
      src.includes("applyInvoiceLineDiscount("),
      "provider item payload must allocate POS discounts to legal lines",
    );
    assert.ok(
      src.includes("order.order_discount_amount ?? order.discount_amount ?? 0"),
      "provider item payload must apply only the remaining order-level discount after item discounts",
    );
  }
});

test("POS item-level discount migration and actions exist", () => {
  const migration = read(
    "supabase/migrations/_archive/20260609094000_pos_item_level_discount.sql",
  );
  const actions = read(
    "apps/web/app/(protected)/br/[branchId]/pos/discount-actions.ts",
  );

  assert.ok(
    migration.includes("ADD COLUMN IF NOT EXISTS order_discount_amount") &&
      migration.includes("ADD COLUMN IF NOT EXISTS item_discount_amount"),
    "orders must split total discount into order-level and item-level sources",
  );
  assert.ok(
    migration.includes("ADD COLUMN IF NOT EXISTS discount_amount") &&
      migration.includes("CREATE OR REPLACE FUNCTION public.apply_order_item_discount"),
    "order_items must persist and mutate item-level discount metadata",
  );
  assert.ok(
    actions.includes("applyOrderItemDiscount") &&
      actions.includes("clearOrderItemDiscount"),
    "POS Server Actions must expose item-level discount mutations",
  );
});
