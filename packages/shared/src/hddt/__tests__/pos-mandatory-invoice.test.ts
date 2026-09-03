import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("POS delegates buyer details to the receipt QR and keeps the no-MST fallback", () => {
  const actions = read(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const bill = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  assert.match(
    actions,
    /buyerName: BUYER_NOT_GET_INVOICE_NAME,[\s\S]*buyerNotGetInvoice: true/,
    "no-MST sales must still queue the legal fallback buyer payload",
  );
  assert.doesNotMatch(
    bill,
    /InvoiceFormSection|invoiceForm/,
    "cashier must not collect invoice buyer details",
  );
  assert.match(
    bill,
    /createPayment\([\s\S]*Number\(order\.total_amount\),[\s\S]*\);/,
    "POS must create the payment without collecting a buyer payload",
  );
});

test("payment completion records a mandatory HĐĐT job instead of calling Viettel inline", () => {
  const src = read(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );

  assert.ok(
    src.includes('invoice: { status: "queued" }'),
    "cash completion must return the queued HĐĐT state",
  );
  assert.ok(
    !src.includes("confirmVietQrPaymentWithInvoice"),
    "cashier must not complete a VietQR payment",
  );
  assert.ok(
    src.includes("invoiceSnapshot"),
    "remote payment must persist an immutable HĐĐT snapshot",
  );
});

test("POS payment actions do not accept an HĐĐT buyer payload", () => {
  const src = read(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const schemas = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
  );

  assert.match(
    src,
    /const POS_DEFAULT_INVOICE_PAYLOAD = \{[\s\S]*buyerName: BUYER_NOT_GET_INVOICE_NAME,[\s\S]*buyerNotGetInvoice: true/,
    "POS must own the fallback payload until the customer QR updates it",
  );
  assert.match(
    src,
    /p_invoice_payload: POS_DEFAULT_INVOICE_PAYLOAD/,
    "cash completion must use the server-owned fallback payload",
  );
  assert.match(
    src,
    /invoiceSnapshot: POS_DEFAULT_INVOICE_PAYLOAD/,
    "VietQR intent must use the server-owned fallback payload",
  );
  assert.doesNotMatch(
    src,
    /buyerTaxCode|buyerAddress|buyerEmail|InvoicePayload|parseInvoicePayload/,
    "POS actions must not expose buyer input fields",
  );
  assert.doesNotMatch(
    schemas,
    /\binvoice:\s*z\./,
    "POS action schemas must not accept an invoice argument",
  );
});

test("customer invoice buyer form is available from the receipt QR", () => {
  const page = read("apps/web/app/q/invoice/[token]/page.tsx");
  const form = read("apps/web/app/q/invoice/[token]/invoice-buyer-form.tsx");
  const action = read("apps/web/app/q/invoice/[token]/actions.ts");

  assert.match(page, /<InvoiceBuyerForm token=\{token\}/);
  assert.match(form, /lookupBusinessTaxCode/);
  assert.match(form, /readOnly/);
  assert.match(
    action,
    /fetchBusinessTaxCode\(parsed\.data\.taxCode\)/,
    "server action must recheck MST instead of trusting browser-filled buyer data",
  );
});

test("createTaxInvoice does not create new not_required/skipped rows", () => {
  const src = read("apps/web/lib/hddt-per-order.ts");
  const actionSrc = read("apps/web/app/(protected)/finance/actions.ts");
  const migration = read(
    "supabase/migrations/20260725160907_add_customer_invoice_qr_flow.sql",
  );

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
    migration.includes("signing_started_at = now()"),
    "provider-submitted invoices must be reconcile-eligible",
  );
  assert.ok(
    src.includes("prepare_tax_invoice_issue_job_as_system"),
    "provider submission must reserve the exact payment-time draft",
  );
  assert.ok(
    src.includes("reconcile_tax_invoice_provider_issued"),
    "provider-issued results must use the canonical reconciliation RPC",
  );
  assert.ok(
    actionSrc.includes("queue_tax_invoice_issue_job_for_completed_order"),
    "Finance manual issue must queue the shared worker job",
  );
});

test("SePay webhook only settles payment; the HĐĐT worker owns issuance", () => {
  const src = read("apps/web/app/api/webhooks/sepay/route.ts");
  const migration = read(
    "supabase/migration-archive/20260711024758_sepay_webhook_order_evidence.sql",
  );

  assert.doesNotMatch(src, /issueTaxInvoiceForPaidOrder|createInvoice/);
  assert.doesNotMatch(src, /confirm_sepay_payment/);
  assert.match(src, /"reconcile_sepay_order_evidence"/);
  assert.match(migration, /public\.confirm_sepay_payment\(/);
});

test("finance handles HĐĐT jobs instead of scanning SePay webhooks", () => {
  const actionSrc = read("apps/web/app/(protected)/finance/actions.ts");
  const listSrc = read("apps/web/app/(protected)/finance/invoice-list.tsx");
  const attentionMigration = read(
    "supabase/migrations/20260726130118_enrich_hddt_issue_attention_identifiers.sql",
  );

  assert.ok(
    actionSrc.includes("fetchTaxInvoiceIssueAttention"),
    "finance must list attention jobs",
  );
  assert.match(
    actionSrc,
    /requeueTaxInvoiceIssueJob/,
    "finance must requeue the exact failed job",
  );
  assert.match(
    actionSrc,
    /reconcileTaxInvoiceProviderIssued/,
    "finance must reconcile a provider-issued invoice through the canonical action",
  );
  assert.match(
    actionSrc,
    /lookupAndReconcileTaxInvoice/,
    "finance must look up a hung invoice by Viettel transactionUuid",
  );
  const lookupAction = sourceBetween(
    actionSrc,
    "export async function lookupAndReconcileTaxInvoice",
    "/* ─── HĐĐT: Manual issue",
  );
  assert.doesNotMatch(
    lookupAction,
    /createInvoice\(|issuePreparedTaxInvoice|issueTaxInvoiceForPaidOrder/,
    "lookup must never issue a second invoice",
  );
  assert.match(
    listSrc,
    /HĐĐT cần kiểm tra trên Viettel/,
    "finance list must expose attention jobs",
  );
  assert.match(
    attentionMigration,
    /'order_number', sales_order\.order_number[\s\S]*'invoice_number', invoice\.invoice_number/,
    "attention jobs must carry the human order code and provider invoice number",
  );
  assert.match(
    listSrc,
    /ID đơn[\s\S]*job\.order_id[\s\S]*ID HĐĐT[\s\S]*job\.tax_invoice_id[\s\S]*Số HĐ Viettel[\s\S]*job\.invoice_number[\s\S]*Mã giao dịch Viettel[\s\S]*job\.provider_ref/,
    "attention rows must label each operational identifier",
  );
  assert.doesNotMatch(
    listSrc,
    /\{job\.last_error \?\? job\.status\}/,
    "attention rows must not expose internal worker error codes",
  );
  assert.match(
    listSrc,
    /status === "reconcile_required"[\s\S]*Chưa xác định trạng thái phát hành trên Viettel[\s\S]*Phát hành tự động đang bị chặn/,
    "attention rows must translate both worker states into operator copy",
  );
  const invoiceActions = sourceBetween(
    listSrc,
    "function renderActions",
    "const columns",
  );
  assert.match(
    invoiceActions,
    /\["signing", "submitted"\]\.includes\(inv\.status\)[\s\S]*inv\.provider_ref[\s\S]*handleLookup\(inv\.id\)[\s\S]*openReconcileForInvoice/,
    "Owner must look up then manually reconcile provider-bound signing/submitted invoices",
  );
  assert.doesNotMatch(
    invoiceActions,
    /createTaxInvoice|issueTaxInvoiceForPaidOrder/,
    "reconciliation UI must never issue a second invoice",
  );
  assert.match(
    listSrc,
    /status === "reconcile_required"[\s\S]*handleLookup[\s\S]*openReconcileForJob/,
    "attention rows must offer Viettel lookup before manual reconcile",
  );
});

test("Finance requeues only the exact blocked HĐĐT job", () => {
  const actionSrc = read("apps/web/app/(protected)/finance/actions.ts");
  const workerMigration = read(
    "supabase/migrations/20260721120000_hddt_payment_completion_worker.sql",
  );
  const qrMigration = read(
    "supabase/migrations/20260725160907_add_customer_invoice_qr_flow.sql",
  );

  assert.match(actionSrc, /requeue_tax_invoice_issue_job/);
  assert.doesNotMatch(actionSrc, /reissueAllDraftInvoices/);
  assert.match(
    workerMigration,
    /v_job\.status NOT IN \('blocked', 'reconcile_required'\)[\s\S]*v_invoice\.status <> 'draft'/,
  );
  assert.match(
    workerMigration,
    /SET status = 'queued', locked_until = NULL, last_error = NULL, updated_at = now\(\)/,
  );
  assert.ok(
    qrMigration.includes(
      "buyer_email = NULLIF(v_buyer_payload ->> 'buyerEmail', '')",
    ),
    "per-order HĐĐT writes must persist buyer_email",
  );
});

test("per-order HĐĐT payload expands POS modifiers and sides", () => {
  const createSrc = read("apps/web/lib/hddt-per-order.ts");
  const migration = read(
    "supabase/migrations/20260725160907_add_customer_invoice_qr_flow.sql",
  );
  const replaceSrc = read(
    "apps/web/app/(protected)/finance/replace-invoice-actions.ts",
  );

  assert.match(
    migration,
    /'modifiers', item\.modifiers,[\s\S]*'sides', item\.sides/,
    "payment-time draft must preserve modifier/side snapshots",
  );
  assert.match(
    migration,
    /'orderDiscountAmount',[\s\S]*v_order\.order_discount_amount,[\s\S]*v_order\.discount_amount/,
    "payment-time draft must preserve the remaining order-level discount",
  );
  assert.match(
    migration,
    /'subtotal', item\.subtotal,[\s\S]*'discount_amount', item\.discount_amount/,
    "payment-time draft must preserve item-level discount inputs",
  );
  assert.ok(
    createSrc.includes("buildInvoiceLineItemsFromOrderItems(activeItems)"),
    "prepared provider payload must expand the immutable item snapshot",
  );
  assert.ok(
    createSrc.includes("applyInvoiceLineDiscount("),
    "prepared provider payload must allocate the immutable order discount",
  );

  assert.ok(
    replaceSrc.includes("order_items") &&
      replaceSrc.includes("modifiers, sides"),
    "replacement HĐĐT fetch must include modifier/side snapshots",
  );
  assert.ok(
    replaceSrc.includes("buildInvoiceLineItemsFromOrderItems(activeItems)"),
    "provider item payload must split main item, paid modifiers, and sides",
  );
  assert.ok(
    replaceSrc.includes("order_discount_amount"),
    "HĐĐT order fetch must include order-level POS discount source",
  );
  assert.ok(
    replaceSrc.includes("subtotal, discount_amount"),
    "HĐĐT order item fetch must include item-level POS discount_amount",
  );
  assert.ok(
    replaceSrc.includes("applyInvoiceLineDiscount("),
    "provider item payload must allocate POS discounts to legal lines",
  );
  assert.ok(
    replaceSrc.includes(
      "order.order_discount_amount ?? order.discount_amount ?? 0",
    ),
    "provider item payload must apply only the remaining order-level discount after item discounts",
  );
  assert.match(
    replaceSrc,
    /calculateHddtTotal\([\s\S]*Number\(order\.total_amount\)[\s\S]*Number\(order\.service_charge\)/,
    "replacement HĐĐT must exclude the non-revenue holiday surcharge",
  );
});

test("per-order HKD HĐĐT never carries VAT", () => {
  const createSrc = read("apps/web/lib/hddt-per-order.ts");
  const migration = read(
    "supabase/migrations/20260830132712_exclude_holiday_surcharge_from_hddt.sql",
  );

  assert.match(
    migration,
    /v_hddt_total := GREATEST\([\s\S]*v_order\.total_amount[\s\S]*- COALESCE\(v_order\.service_charge, 0\)/,
    "HKD HĐĐT total must exclude the non-revenue holiday surcharge",
  );
  assert.match(
    migration,
    /'subtotal', v_hddt_total,[\s\S]*'vatRate', 0,[\s\S]*'vatAmount', 0,[\s\S]*'totalAmount', v_hddt_total/,
    "HKD HĐĐT snapshot must use the surcharge-free total without reverse VAT",
  );
  assert.match(
    migration,
    /v_hddt_total,[\s\S]*0,[\s\S]*0,[\s\S]*v_hddt_total,[\s\S]*'viettel'/,
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

test("holiday surcharge backfill touches retryable draft HĐĐT only", () => {
  const migration = read(
    "supabase/migrations/20260830132712_exclude_holiday_surcharge_from_hddt.sql",
  );
  const backfill = migration.slice(
    migration.indexOf("WITH canonical AS"),
    migration.indexOf("COMMIT;"),
  );

  assert.match(backfill, /job\.status IN \('queued', 'blocked'\)/);
  assert.match(backfill, /invoice\.status = 'draft'/);
  assert.match(backfill, /invoice\.invoice_number IS NULL/);
  assert.doesNotMatch(backfill, /job\.status\s+IN\s*\([^)]*processing/i);
  assert.doesNotMatch(
    backfill,
    /job\.status\s+IN\s*\([^)]*reconcile_required/i,
  );
  assert.doesNotMatch(backfill, /invoice\.status\s+IN\s*\([^)]*issued/i);
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
