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
    "supabase/migration-archive/20260725160907_add_customer_invoice_qr_flow.sql",
  );
  const zeroTotalMigration = read(
    "supabase/migrations/20260812105224_hddt_discount_projection_zero_total.sql",
  );

  assert.ok(
    !/status:\s*"not_required"/.test(src),
    "new tax invoice writes must not use status='not_required'",
  );
  assert.match(
    zeroTotalMigration,
    /COALESCE\(v_order\.total_amount, 0\) = 0[\s\S]*status', 'not_required'/,
    "zero-total payment path must mark tax_invoices not_required without an issue job",
  );
  assert.match(
    zeroTotalMigration,
    /DELETE FROM public\.tax_invoice_issue_jobs[\s\S]*status IN \('pending_payment', 'queued'\)/,
    "zero-total path must drop pending/queued issue jobs",
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
  const providerSrc = read(
    "packages/shared/src/providers/impl/viettel-sinvoice.ts",
  );
  assert.match(
    providerSrc,
    /export function resolveSinvoiceBuyerInfo/,
    "Viettel buyer mapping must stay in resolveSinvoiceBuyerInfo",
  );
  assert.doesNotMatch(
    providerSrc,
    /buyerLegalName:\s*buyerNotGetInvoice\s*\?\s*null\s*:\s*buyerName/,
    "company name must not be copied into both Viettel buyerName and buyerLegalName",
  );
  assert.match(
    providerSrc,
    /kind === "business"/,
    "business buyers must map via buyerKind, not tax-code alone",
  );
  assert.match(
    providerSrc,
    /kind === "individual"|buyerKind === "individual"/,
    "individual buyers must keep person name on buyerName",
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
    "supabase/migration-archive/20260726130118_enrich_hddt_issue_attention_identifiers.sql",
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
    /Mã đơn[\s\S]*job\.order_id[\s\S]*Mã HĐĐT[\s\S]*job\.tax_invoice_id[\s\S]*Số HĐ Viettel[\s\S]*job\.invoice_number[\s\S]*Mã giao dịch Viettel[\s\S]*job\.provider_ref/,
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
    /\["signing", "submitted"\]\.includes\(inv\.status\)[\s\S]*inv\.provider_ref/,
    "Owner must reconcile provider-bound signing/submitted invoices without waiting for a job",
  );
  assert.doesNotMatch(
    invoiceActions,
    /createTaxInvoice|issueTaxInvoiceForPaidOrder/,
    "reconciliation UI must never issue a second invoice",
  );
});

test("Finance requeues only the exact blocked HĐĐT job", () => {
  const actionSrc = read("apps/web/app/(protected)/finance/actions.ts");
  const workerMigration = read(
    "supabase/migration-archive/20260721120000_hddt_payment_completion_worker.sql",
  );
  const qrMigration = read(
    "supabase/migration-archive/20260725160907_add_customer_invoice_qr_flow.sql",
  );

  assert.match(actionSrc, /requeue_tax_invoice_issue_job/);
  assert.match(actionSrc, /requeue_invoice_total_mismatch_jobs/);
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
    "supabase/migration-archive/20260725160907_add_customer_invoice_qr_flow.sql",
  );
  const projectionMigration = read(
    "supabase/migrations/20260812105224_hddt_discount_projection_zero_total.sql",
  );
  const replaceSrc = read(
    "apps/web/app/(protected)/finance/replace-invoice-actions.ts",
  );
  const snapshotMigration = read(
    "supabase/migration-archive/20260727161500_invoice_profile_vat_snapshot.sql",
  );

  assert.match(
    migration,
    /'modifiers', item\.modifiers,[\s\S]*'sides', item\.sides/,
    "payment-time draft must preserve modifier/side snapshots",
  );
  assert.match(
    projectionMigration,
    /'orderDiscountAmount',[\s\S]*v_order\.order_discount_amount,[\s\S]*v_order\.discount_amount/,
    "payment-time draft must preserve the remaining order-level discount",
  );
  assert.match(
    projectionMigration,
    /'serviceCharge', COALESCE\(v_order\.service_charge, 0\)/,
    "payment-time draft must preserve service charge for ADR 0034 projection",
  );
  const snapshotServiceChargeMigration = read(
    "supabase/migrations/20260812113334_hddt_snapshot_service_charge.sql",
  );
  assert.match(
    snapshotServiceChargeMigration,
    /CREATE OR REPLACE FUNCTION private\.snapshot_invoice_job[\s\S]*'serviceCharge', COALESCE\(v_order\.service_charge, 0\)/,
    "profile snapshot rebuild must keep serviceCharge to avoid invoice_snapshot_immutable",
  );
  assert.match(
    migration,
    /'subtotal', item\.subtotal,[\s\S]*'discount_amount', item\.discount_amount/,
    "payment-time draft must preserve item-level discount inputs",
  );
  assert.ok(
    createSrc.includes("buildHddtProviderLines("),
    "prepared provider payload must project discounts via ADR 0034 helper",
  );
  assert.ok(
    !createSrc.includes("applyInvoiceLineDiscount("),
    "prepared provider payload must not use proportional discount allocation",
  );
  const lineItemsSrc = read("packages/shared/src/hddt/invoice-line-items.ts");
  assert.doesNotMatch(
    lineItemsSrc,
    /Phí dịch vụ/,
    "HĐĐT provider lines must not emit a named service-charge row",
  );

  assert.ok(
    snapshotMigration.includes("v_old.invoice_snapshot - 'submissionSnapshot'"),
    "replacement must copy the original immutable financial snapshot",
  );
  assert.ok(
    replaceSrc.includes('"reserve_tax_invoice_replacement"'),
    "replacement must use the durable queue reservation RPC",
  );
  assert.ok(
    !replaceSrc.includes("order_items") &&
      !replaceSrc.includes("createInvoice("),
    "replacement action must not rebuild mutable order lines or call Viettel inline",
  );
});

test("order lines snapshot item VAT without annual-revenue inference", () => {
  const createSrc = read("apps/web/lib/hddt-per-order.ts");
  const providerInitSrc = read("apps/web/lib/invoice-provider-init.ts");
  const migration = read(
    "supabase/migration-archive/20260727130000_snapshot_menu_item_vat_rate.sql",
  );

  assert.match(
    migration,
    /SELECT menu_items\.vat_rate[\s\S]*NEW\.vat_rate := v_vat_rate/,
    "order item VAT must be snapshotted from the sold menu item",
  );
  assert.doesNotMatch(
    migration,
    /NEW\.vat_rate := public\.resolve_gtgt_rate/,
    "order item VAT must not be inferred from annual revenue",
  );
  assert.ok(
    !createSrc.includes("resolveSalesTaxProfile") &&
      !createSrc.includes("estimateAnnualRevenue"),
    "HĐĐT issuance must not use the retired annual-revenue tax resolver",
  );
  assert.match(
    providerInitSrc,
    /\/\^1\\\//,
    "invoice provider initialization must accept only the registered VAT template family",
  );
});

test("invoice profile and replacement cutover stay fail-closed", () => {
  const migration = read(
    "supabase/migration-archive/20260727161500_invoice_profile_vat_snapshot.sql",
  );
  const provider = read(
    "packages/shared/src/providers/impl/viettel-sinvoice.ts",
  );
  const replacement = read(
    "apps/web/app/(protected)/finance/replace-invoice-actions.ts",
  );

  assert.match(migration, /CREATE TABLE public\.invoice_profiles/);
  assert.match(migration, /'1\/001'/);
  assert.match(migration, /'C26TCS'/);
  assert.match(
    migration,
    /FROM public\.tenants tenant[\s\S]*ON CONFLICT \(tenant_id, version\) DO NOTHING/,
  );
  assert.match(migration, /template_code ~ '\^1\/'/);
  assert.match(
    migration,
    /seller_tax_code IS DISTINCT FROM v_tenant\.tax_code/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.activate_invoice_profile\(\)[\s\S]*public\.auth_tenant_id\(\)[\s\S]*public\.has_permission_any\('settings:tenant'\)/,
    "profile activation must derive tenant authority from the authenticated caller",
  );
  assert.match(
    migration,
    /FROM public\.tenants tenant[\s\S]*WHERE tenant\.id = v_tenant_id[\s\S]*FOR UPDATE/,
    "profile activation must serialize against tenant identity changes",
  );
  assert.match(
    migration,
    /SET seller_tax_code = v_tenant\.tax_code,[\s\S]*status = 'active'/,
    "profile activation must bind the seller MST from the locked Tenant row",
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.activate_invoice_profile\(\)[\s\S]*FROM PUBLIC, anon, service_role;[\s\S]*GRANT EXECUTE ON FUNCTION public\.activate_invoice_profile\(\)[\s\S]*TO authenticated;/,
    "only authenticated callers may execute profile activation",
  );
  assert.match(migration, /ALTER COLUMN vat_rate DROP DEFAULT/);
  assert.match(migration, /CHECK \(vat_rate IN \(0, 5, 8, 10\)\)/);
  assert.match(migration, /'vat_rate', item\.vat_rate/);
  assert.match(migration, /'version', 1/);
  assert.doesNotMatch(migration, /'version', 2/);
  assert.match(migration, /submission_snapshot/);
  assert.match(migration, /Replacement confirmed by provider/);
  assert.match(
    migration,
    /WHERE job\.tax_invoice_id = v_invoice\.id[\s\S]*AND job\.status <> 'completed'/,
  );
  assert.doesNotMatch(
    migration,
    /WHERE tenant_id = v_invoice\.tenant_id[\s\S]*AND order_id = v_invoice\.order_id[\s\S]*AND status <> 'completed'/,
  );
  assert.ok(replacement.includes('"reserve_tax_invoice_replacement"'));
  assert.ok(!replacement.includes("createInvoice("));
  assert.ok(!provider.includes("direct_sales_gross"));
  assert.ok(!provider.includes("detectGrossInput"));
});

test("POS item-level discount migration and actions exist", () => {
  const migration = read(
    "supabase/migration-archive/20260609094000_pos_item_level_discount.sql",
  );
  const vndOnlyMigration = read(
    "supabase/migrations/20260812105224_hddt_discount_projection_zero_total.sql",
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
  assert.match(
    vndOnlyMigration,
    /order_items_discount_type_check[\s\S]*discount_type = 'vnd'/,
    "item discount CHECK must allow only vnd",
  );
  assert.match(
    vndOnlyMigration,
    /p_type IS NULL OR p_type IS DISTINCT FROM 'vnd'/,
    "apply_order_item_discount must reject pct",
  );
  assert.match(
    actions,
    /applyItemDiscountInputSchema[\s\S]*z\.literal\("vnd"/,
    "POS item discount action must accept VND only",
  );
  assert.ok(
    actions.includes("applyOrderItemDiscount") &&
      actions.includes("clearOrderItemDiscount"),
    "POS Server Actions must expose item-level discount mutations",
  );
});
