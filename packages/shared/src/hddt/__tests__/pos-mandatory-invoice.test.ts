import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POS_VI } from "../../messages";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

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
    src.includes("POS_VI.buyerNoInvoice") &&
      POS_VI.buyerNoInvoice === "Khách không lấy hóa đơn (vẫn xuất HĐĐT)",
    "checkbox copy must state an HĐĐT still issues (NĐ 254/2026), without embedding the server-owned legal buyerName",
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

test("POS validates HĐĐT buyer payload before committing payment", () => {
  const src = read(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const cashBlock = sourceBetween(
    src,
    "export async function confirmCashPaymentWithInvoice",
    "/* ─── fetchVietQrConfig",
  );
  const vietQrStart = src.indexOf(
    "export async function confirmVietQrPaymentWithInvoice",
  );
  assert.notEqual(vietQrStart, -1, "missing VietQR invoice orchestrator");
  const vietQrBlock = src.slice(vietQrStart);

  assert.match(
    src,
    /buyerTaxCode:[\s\S]*regex\(MST_REGEX/,
    "POS server action must enforce the same MST format as createTaxInvoice",
  );
  assert.match(
    src,
    /refine\(\(v\) => !v\.buyerTaxCode \|\|/,
    "POS server action must require buyerName when MST is present",
  );
  assert.ok(
    cashBlock.indexOf("parseInvoicePayload(invoice)") <
      cashBlock.indexOf("const paymentResult = await confirmCashPayment("),
    "cash HĐĐT buyer validation must happen before payment commit",
  );
  assert.ok(
    vietQrBlock.indexOf("parseInvoicePayload(invoice)") <
      vietQrBlock.indexOf("const paymentResult = await confirmVietQrPayment("),
    "VietQR HĐĐT buyer validation must happen before payment commit",
  );
});

test("POS invoice buyer form is available for cash and VietQR confirmation", () => {
  const src = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  assert.match(
    src,
    /const showInvoiceForm =\s*selectedMethod === "cash" \|\| selectedMethod === "vietqr";/,
    "buyer invoice form must be available for both cashier-confirmed payment paths",
  );
  assert.equal(
    src.match(/<InvoiceFormSection/g)?.length,
    1,
    "buyer invoice form should be rendered once, outside method-specific panels",
  );
  assert.match(
    src,
    /\{showInvoiceForm \? \(\s*<InvoiceFormSection/,
    "buyer invoice form must not live only inside the cash payment panel",
  );
});

test("createTaxInvoice does not create new not_required/skipped rows", () => {
  const src = read("apps/web/lib/hddt-per-order.ts");
  const actionSrc = read("apps/web/app/(protected)/finance/actions.ts");

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
    src.includes("buyerEmail"),
    "missing buyerEmail pass-through to provider calls",
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
  assert.ok(
    actionSrc.includes("issueTaxInvoiceForPaidOrder"),
    "createTaxInvoice action must use the shared per-order issue helper",
  );
});

test("SePay webhook uses the POS settlement service without direct HĐĐT issuance", () => {
  const src = read("apps/web/app/api/webhooks/sepay/route.ts");
  const migration = read(
    "supabase/migration-archive/20260711024758_sepay_webhook_order_evidence.sql",
  );

  assert.doesNotMatch(src, /issueTaxInvoiceForPaidOrder/);
  assert.doesNotMatch(src, /confirm_sepay_payment/);
  assert.match(src, /"reconcile_sepay_order_evidence"/);
  assert.match(migration, /public\.confirm_sepay_payment\(/);
});

test("MoMo webhook attempts HĐĐT after successful webhook payment", () => {
  const src = read("apps/web/app/api/webhooks/momo/route.ts");

  assert.ok(
    src.includes("issueTaxInvoiceForPaidOrder"),
    "MoMo paid webhook must attempt per-order HĐĐT issuance",
  );
  assert.match(
    src,
    /case "completed":\s*\n\s*case "already_completed": \{/,
    "HĐĐT attempt must run for both fresh and idempotent MoMo paid outcomes",
  );
  assert.ok(
    src.includes("annotateInvoiceAttemptFailure") &&
      src.includes('error_code: "invoice_attempt_failed"'),
    "MoMo webhook event should record invoice attempt failure without failing payment",
  );
});

test("finance can recover paid SePay orders that missed HĐĐT", () => {
  const actionSrc = read("apps/web/app/(protected)/finance/actions.ts");
  const listSrc = read("apps/web/app/(protected)/finance/invoice-list.tsx");

  assert.ok(
    actionSrc.includes("issueMissingSepayInvoices"),
    "finance must expose a bounded recovery action for processed SePay webhooks",
  );
  assert.match(
    actionSrc,
    /\.from\("webhook_events"\)[\s\S]*\.eq\("provider", "sepay"\)[\s\S]*\.eq\("processing_status", "processed"\)/,
    "recovery candidates must come from processed SePay webhook events",
  );
  assert.match(
    actionSrc,
    /\.or\("error_code\.is\.null,error_code\.neq\.invoice_binding_manual_review"\)/,
    "recovery must preserve NULL errors while excluding ambiguous buyer bindings",
  );
  assert.match(
    actionSrc,
    /\.eq\("error_code", "invoice_binding_manual_review"\)[\s\S]*\.in\("payment_id", candidatePaymentIds\)/,
    "recovery must find any manual-review event sharing a candidate payment",
  );
  assert.match(
    actionSrc,
    /candidatePaymentIds\.filter\([\s\S]*!manualReviewPaymentIds\.has\(paymentId\)/,
    "a second event must not make a manual-review payment eligible again",
  );
  assert.match(
    actionSrc,
    /\.from\("payments"\)[\s\S]*\.eq\("method", "vietqr"\)[\s\S]*\.eq\("status", "completed"\)/,
    "recovery must bind processed webhooks to completed VietQR payments",
  );
  assert.match(
    actionSrc,
    /issueTaxInvoiceForPaidOrder\(\{/,
    "recovery must reuse the shared per-order HĐĐT helper and duplicate guards",
  );
  assert.ok(
    listSrc.includes("issueMissingSepayInvoices"),
    "finance invoice list must expose the recovery action to operators",
  );
});

test("draft HĐĐT reissue preserves stored buyer contact fields", () => {
  const actionSrc = read("apps/web/app/(protected)/finance/actions.ts");
  const createSrc = read("apps/web/lib/hddt-per-order.ts");

  assert.match(
    actionSrc,
    /\.select\(\s*"id, order_id, buyer_name, buyer_tax_code, buyer_address, buyer_email",?\s*\)/,
    "draft reissue must load buyer address/email with the other buyer fields",
  );
  assert.ok(
    actionSrc.includes("buyerAddress: draft.buyer_address ?? undefined"),
    "draft reissue must pass buyer_address back into createTaxInvoice",
  );
  assert.ok(
    actionSrc.includes("buyerEmail: draft.buyer_email ?? undefined"),
    "draft reissue must pass buyer_email back into createTaxInvoice",
  );
  assert.ok(
    createSrc.includes("buyer_email: buyerEmail ?? null"),
    "per-order HĐĐT writes must persist buyer_email",
  );
});

test("per-order HĐĐT payload expands POS modifiers and sides", () => {
  const createSrc = read("apps/web/lib/hddt-per-order.ts");
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

test("per-order HKD HĐĐT never carries VAT", () => {
  const createSrc = read("apps/web/lib/hddt-per-order.ts");

  assert.match(
    createSrc,
    /const subtotal(?:: number)? = orderTotal;/,
    "HKD HĐĐT subtotal must be the paid total, not a reverse VAT split",
  );
  assert.match(
    createSrc,
    /const vatRate(?:: number)? = 0;[\s\S]*const vatAmount(?:: number)? = 0;/,
    "HKD HĐĐT must not carry VAT rate or VAT amount",
  );
  assert.ok(
    !createSrc.includes("resolveSalesTaxProfile") &&
      !createSrc.includes("estimateAnnualRevenue") &&
      !createSrc.includes("item.vat_rate") &&
      !createSrc.includes("status, vat_rate"),
    "per-order HĐĐT must not derive VAT from tax profiles or order_items",
  );
});

test("POS item-level discount migration and actions exist", () => {
  const migration = read(
    "supabase/migration-archive/20260609094000_pos_item_level_discount.sql",
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
      migration.includes(
        "CREATE OR REPLACE FUNCTION public.apply_order_item_discount",
      ),
    "order_items must persist and mutate item-level discount metadata",
  );
  assert.ok(
    actions.includes("applyOrderItemDiscount") &&
      actions.includes("clearOrderItemDiscount"),
    "POS Server Actions must expose item-level discount mutations",
  );
});
