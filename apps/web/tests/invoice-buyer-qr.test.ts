import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "../..");
const readRepo = (path: string) => readFileSync(join(root, path), "utf8");
const migration = readRepo(
  "supabase/migration-archive/20260725160907_add_customer_invoice_qr_flow.sql",
);
const worker = readRepo("apps/web/lib/tax-invoice-issue-worker.ts");

test("customer invoice QR keeps buyer writes private and before issuance claim", () => {
  assert.match(migration, /CREATE TABLE public\.tax_invoice_buyer_requests/);
  assert.match(
    migration,
    /ALTER TABLE public\.tax_invoice_buyer_requests ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.tax_invoice_buyer_requests[\s\S]*PUBLIC, anon, authenticated/,
  );
  assert.match(migration, /extensions\.gen_random_bytes\(24\)/);
  assert.match(migration, /extensions\.digest\(/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /NEW\.payload := NEW\.payload - 'payment_qr'/);
  assert.match(migration, /- 'invoice_qr'/);
  assert.match(migration, /entry\.block->>'type' IS DISTINCT FROM 'paymentQr'/);
  assert.match(migration, /entry\.block->>'type' IS DISTINCT FROM 'invoiceQr'/);
  assert.match(
    migration,
    /v_available_at := v_payment\.paid_at \+ interval '2 hours'/,
  );
  assert.match(
    migration,
    /FROM public\.tax_invoice_issue_jobs job[\s\S]*JOIN public\.payments payment[\s\S]*payment\.id = job\.payment_id[\s\S]*JOIN public\.tax_invoices invoice[\s\S]*job\.status = 'queued'[\s\S]*invoice\.status = 'draft'/,
  );
  assert.match(
    migration,
    /job\.available_at <= now\(\)[\s\S]*FOR UPDATE SKIP LOCKED/,
  );
  assert.match(
    migration,
    /'invoiceTime', v_payment\.paid_at[\s\S]*'items', v_items/,
  );
  assert.match(
    migration,
    /WHERE job\.status = 'queued'[\s\S]*job\.tax_invoice_id IS NULL[\s\S]*PERFORM private\.upsert_tax_invoice_issue_job/,
  );
  assert.match(
    migration,
    /INSERT INTO public\.tax_invoices[\s\S]*'draft'[\s\S]*v_payment\.paid_at/,
  );
  assert.match(
    migration,
    /submit_invoice_buyer_request_as_system[\s\S]*FOR UPDATE[\s\S]*UPDATE public\.tax_invoices[\s\S]*buyer_tax_code[\s\S]*invoice_payload = v_payload[\s\S]*available_at = now\(\)/,
  );
  assert.match(
    migration,
    /prepare_tax_invoice_issue_job_as_system[\s\S]*status = 'signing'[\s\S]*provider_ref = btrim\(p_provider_ref\)/,
  );
  assert.match(
    migration,
    /OLD\.invoice_payload -> 'draftSnapshot'[\s\S]*IS DISTINCT FROM NEW\.invoice_payload -> 'draftSnapshot'/,
  );
  assert.match(
    migration,
    /NOT \(COALESCE\(NEW\.provider_data, '\{\}'::jsonb\) \? 'invoiceSnapshot'\)[\s\S]*NEW\.provider_data :=[\s\S]*jsonb_build_object\('invoiceSnapshot', OLD\.provider_data -> 'invoiceSnapshot'\)[\s\S]*jsonb_typeof\(OLD\.provider_data #> '\{invoiceSnapshot,draftSnapshot\}'\)/,
  );
  assert.match(migration, /ON CONFLICT \(tenant_id, order_id\) DO NOTHING/);
  assert.match(migration, /status IN \('open', 'submitted', 'expired'\)/);
  assert.match(migration, /close_reason = 'customer_submitted'/);
  assert.match(migration, /close_reason = 'deadline_elapsed'/);
  assert.match(
    migration,
    /prepare_tax_invoice_issue_job_as_system[\s\S]*FROM public\.tax_invoice_buyer_requests request[\s\S]*FOR UPDATE[\s\S]*FROM public\.tax_invoice_issue_jobs job[\s\S]*FOR UPDATE[\s\S]*FROM public\.tax_invoices invoice[\s\S]*FOR UPDATE/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.queue_tax_invoice_issue_job_for_completed_order\([\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*GRANT EXECUTE ON FUNCTION public\.queue_tax_invoice_issue_job_for_completed_order\([\s\S]*TO authenticated, service_role;/,
  );
  assert.match(worker, /Promise\.all\(/);
  assert.match(worker, /const WORKER_CONCURRENCY = 4/);
  assert.match(worker, /Array\.from\(\{ length: WORKER_CONCURRENCY \}/);
  assert.match(worker, /\{ p_limit: 1, p_lease_seconds: 300 \}/);
  assert.doesNotMatch(worker, /\{ p_limit: 20, p_lease_seconds: 300 \}/);
  assert.doesNotMatch(worker, /const jobs = \[\.\.\.\(data \?\? \[\]\)\]/);
  assert.doesNotMatch(worker, /for \(const job of data \?\? \[\]\)/);
  assert.doesNotMatch(
    migration,
    /interval '10 minutes'|SET token_hash = EXCLUDED\.token_hash/,
  );
});

test("backlog HĐĐT drafts send the S-invoice submit instant", () => {
  const helper = readRepo("packages/shared/src/hddt/issue-date.ts");
  const issuer = readRepo("apps/web/lib/hddt-per-order.ts");
  const evening = readRepo(
    "supabase/migrations/20260818101813_hddt_evening_immediate_issue.sql",
  );
  const requeue = readRepo(
    "supabase/migrations/20260818161136_hddt_backlog_submit_date.sql",
  );
  const collision = readRepo(
    "supabase/migrations/20260818224935_hddt_uuid_collision_rebind.sql",
  );

  assert.match(helper, /allowBacklogSubmitDate === true/);
  assert.match(helper, /return submittedAt\.toISOString\(\)/);
  assert.match(helper, /return null/);
  assert.match(issuer, /allowBacklogSubmitDate: z\.boolean\(\)\.optional\(\)/);
  assert.match(
    issuer,
    /allowBacklogSubmitDate: parsed\.data\.allowBacklogSubmitDate === true/,
  );
  assert.match(issuer, /errorCode: "invoice_issue_date_not_today"/);
  assert.match(
    evening,
    /EXTRACT\(\s*HOUR FROM \(p_paid_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)\s*\) >= 22 THEN p_paid_at/,
  );
  assert.match(requeue, /job\.status = 'blocked'/);
  assert.match(requeue, /invoice\.status = 'draft'/);
  assert.match(requeue, /last_error = 'invoice_issue_date_not_today'/);
  assert.match(requeue, /INVOICE_ISSUE_DATE_INVALID_TT78/);
  assert.match(
    requeue,
    /jsonb_build_object\('allowBacklogSubmitDate', true\)/,
  );
  assert.match(collision, /hddt_uuid_collision_expected_pairs_invalid/);
  assert.match(collision, /uq_tax_invoices_issued_invoice_number/);
  assert.match(collision, /tax_invoice_number_already_bound/);
  assert.match(collision, /status = 'cancelled'/);
  assert.match(
    collision,
    /jsonb_build_object\('allowBacklogSubmitDate', true\)/,
  );
  assert.doesNotMatch(requeue, /reconcile_required/);
});

test("buyer request submit close_reason matches queue_submitted constraint", () => {
  const submitMigration = readRepo(
    "supabase/migrations/20260808130119_hddt_buyer_kind_invoice_payload.sql",
  );
  const closeStateMigration = readRepo(
    "supabase/migrations/20260811030705_hddt_buyer_request_queue_submitted_close_reason.sql",
  );

  assert.match(
    submitMigration,
    /submit_invoice_buyer_request_as_system[\s\S]*close_reason = 'queue_submitted'/,
  );
  assert.match(
    closeStateMigration,
    /DROP CONSTRAINT tax_invoice_buyer_requests_close_state_check/,
  );
  assert.match(
    closeStateMigration,
    /status = 'submitted'[\s\S]*close_reason = 'queue_submitted'/,
  );
  assert.match(
    closeStateMigration,
    /WHERE status = 'submitted'\s+AND close_reason = 'customer_submitted'/,
  );
});

test("POS defers buyer details to the receipt QR; Self-Order may collect VAT invoice on G7", () => {
  const bill = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );
  const selfOrderClient = readRepo(
    "apps/web/app/q/[token]/self-order-client.tsx",
  );
  const selfOrderPaymentPanel = readRepo(
    "apps/web/app/q/[token]/self-order/payment-panel.tsx",
  );
  const action = readRepo("apps/web/app/q/invoice/[token]/actions.ts");
  const buyerServer = readRepo(
    "apps/web/lib/hddt/invoice-buyer-request-server.ts",
  );
  const form = readRepo(
    "apps/web/app/q/invoice/[token]/invoice-buyer-form.tsx",
  );
  const orderCard = readRepo(
    "apps/web/app/q/invoice/[token]/invoice-buyer-order-card.tsx",
  );
  const page = readRepo("apps/web/app/q/invoice/[token]/page.tsx");
  const issuer = readRepo("apps/web/lib/hddt-per-order.ts");
  const posPaymentActions = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const posPaymentSchemas = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
  );

  assert.doesNotMatch(bill, /InvoiceFormSection|invoiceForm/);
  assert.match(
    bill,
    /createPayment\([\s\S]*Number\(order\.total_amount\),[\s\S]*\);/,
  );
  assert.doesNotMatch(
    posPaymentActions,
    /buyerTaxCode|buyerAddress|buyerEmail|InvoicePayload|parseInvoicePayload/,
  );
  assert.doesNotMatch(posPaymentSchemas, /\binvoice:\s*z\./);
  assert.match(
    posPaymentActions,
    /p_invoice_payload: POS_DEFAULT_INVOICE_PAYLOAD/,
  );
  assert.match(
    selfOrderPaymentPanel,
    /buyerTaxCode|buyerNotGetInvoice|lookupBusinessTaxCode/,
  );
  assert.match(selfOrderClient, /invoice/);
  assert.match(
    selfOrderClient,
    /\{ clientOpId: intent\.clientOpId, method, invoice \}/,
  );
  assert.match(action, /buyerKind: z\.literal\("business"\)/);
  assert.match(action, /buyerKind: z\.literal\("individual"\)/);
  assert.match(action, /fetchBusinessTaxCode\(parsed\.data\.taxCode\)/);
  assert.match(action, /rateLimit\.limit/);
  assert.match(action, /runTaxInvoiceIssueWorker\(jobId\)/);
  assert.match(action, /import \{ after \} from "next\/server"/);
  assert.match(action, /after\(async \(\) =>/);
  assert.doesNotMatch(
    action,
    /await runTaxInvoiceIssueWorker\(submission\.jobId\)/,
  );
  assert.match(action, /email: z\.string\(\)\.trim\(\)\.email\(\)\.max\(254\)/);
  assert.match(action, /buyerEmail: parsed\.data\.email/);
  assert.match(
    action,
    /submission\.status === "expired"[\s\S]*terminal: true[\s\S]*submission\.status === "closed"[\s\S]*terminal: true/,
  );
  assert.match(
    issuer,
    /kind === "business"[\s\S]*buyerTaxCode &&[\s\S]*buyerName &&[\s\S]*buyerAddress &&[\s\S]*buyerEmail/,
  );
  assert.match(
    issuer,
    /kind === "individual"[\s\S]*buyerName && value\.buyerEmail/,
  );
  assert.match(
    issuer,
    /const invoiceProvider = createInvoiceProvider\(profile\);[\s\S]*invoice_provider_not_configured[\s\S]*const providerRef = buildSinvoiceTransactionUuid\(taxInvoiceId\);[\s\S]*invoice_total_mismatch[\s\S]*prepare_tax_invoice_issue_job_as_system/,
  );
  assert.match(issuer, /if \(drift !== 0\)/);
  assert.doesNotMatch(issuer, /drift > 10/);
  assert.match(issuer, /errorCode: "invoice_issue_date_not_today"/);
  assert.match(
    issuer,
    /allowBacklogSubmitDate: parsed\.data\.allowBacklogSubmitDate === true/,
  );
  assert.doesNotMatch(issuer, /issueTaxInvoiceForPaidOrder|DRAFT-/);
  assert.match(buyerServer, /if \(result\.success\)/);
  assert.match(buyerServer, /buyerKind: "business" \| "individual"/);
  assert.match(buyerServer, /buyerEmail: string/);
  assert.match(buyerServer, /return \{ status: "failed", jobId: null \}/);
  assert.match(action, /buyerName: business\.name/);
  assert.match(action, /buyerAddress: business\.address/);
  assert.match(action, /buyerName: parsed\.data\.buyerName/);
  assert.match(form, /TabsList/);
  assert.match(form, /buyerKindSelected/);
  assert.match(form, /TabsTrigger value="business"/);
  assert.doesNotMatch(form, /ToggleGroup/);
  assert.match(form, /buyerKindBusiness|buyerKindIndividual/);
  assert.match(form, /readOnly=\{buyerKind === "business"\}/);
  assert.match(form, /id="invoice-buyer-email"[\s\S]*required/);
  assert.match(form, /InputGroupButton/);
  assert.match(form, /aria-label=\{invoiceBuyer.lookupAction\}/);
  assert.doesNotMatch(form, /sm:grid-cols-\[1fr_auto\]/);
  assert.match(form, /formatVNDateTime\(expiresAt\)/);
  assert.match(
    form,
    /Date\.parse\(expiresAt\) - Date\.now\(\)[\s\S]*window\.setTimeout\(\(\) => setExpired\(true\), remaining\)/,
  );
  assert.match(form, /result && !result\.ok && result\.terminal/);
  assert.match(page, /InvoiceBuyerOrderCard/);
  assert.match(page, /expiresAt=\{request\.expiresAt\}/);
  assert.doesNotMatch(page, /export const instant\s*=/);
  assert.match(page, /request\.state === "not_required"/);
  assert.match(page, /invoiceBuyer\.notRequiredTitle/);
  assert.match(orderCard, /<Collapsible/);
  assert.match(orderCard, /CollapsibleTrigger/);
  assert.match(orderCard, /justify-between/);
  assert.match(orderCard, /invoiceBuyer\.detailsTitle/);
  assert.match(orderCard, /formatVND\(summary\.totalAmount\)/);
  assert.match(orderCard, /grid-cols-6/);
  assert.match(orderCard, /col-span-2/);
  assert.match(orderCard, /invoiceBuyer\.quantityLabel/);
  assert.match(orderCard, /invoiceBuyer\.unitPriceLabel/);
  assert.match(orderCard, /invoiceBuyer\.lineTotalLabel/);
  assert.match(orderCard, /invoiceBuyer\.vatRateLabel/);
  assert.match(orderCard, /formatPercent\(item\.vatRate, 0\)/);
  assert.match(orderCard, /formatQuantity\(item\.quantity\)/);
  assert.match(orderCard, /formatVND\(item\.unitPrice\)/);
  assert.doesNotMatch(orderCard, /formatPortionQuantity/);
  assert.doesNotMatch(orderCard, /BrandMascot|PublicSection|DataTable/);
  assert.match(buyerServer, /from\("order_items"\)/);
  assert.match(buyerServer, /unit_price, subtotal, discount_amount, vat_rate, modifiers, sides/);
  assert.match(buyerServer, /buildInvoiceLineItemsFromOrderItems/);
  assert.match(buyerServer, /bakeGrossDiscountCheapFirst/);
  assert.doesNotMatch(buyerServer, /buildHddtProviderLines/);
  assert.match(buyerServer, /loadOrderSummary/);
  const buyerCopy = readRepo("apps/web/lib/messages/invoice-buyer.ts");
  assert.match(buyerCopy, /quantityLabel: "SL"/);
  assert.match(buyerCopy, /unitPriceLabel: "Đơn giá"/);
  assert.match(buyerCopy, /lineTotalLabel: "Thành tiền"/);
  assert.match(buyerCopy, /vatRateLabel: "GTGT"/);
  assert.doesNotMatch(
    buyerServer,
    /snapshotSchema = z\.object\([\s\S]*orderId/,
  );
  assert.match(
    buyerServer,
    /state: z\.enum\(\["open", "submitted", "expired", "closed", "not_required"\]\)/,
  );
  assert.doesNotMatch(form, /invoiceBuyer\.optional/);
  const zeroTotalMigration = readRepo(
    "supabase/migrations/20260812105224_hddt_discount_projection_zero_total.sql",
  );
  assert.match(
    zeroTotalMigration,
    /OR EXISTS \([\s\S]*invoice\.status = 'not_required'/,
  );
  assert.match(
    zeroTotalMigration,
    /WHEN v_invoice\.status = 'not_required'[\s\S]*THEN 'not_required'/,
  );
  assert.match(
    zeroTotalMigration,
    /RETURN jsonb_build_object\('status', 'not_required'\)/,
  );
  const buyerKindMigration = readRepo(
    "supabase/migrations/20260808130119_hddt_buyer_kind_invoice_payload.sql",
  );
  assert.match(buyerKindMigration, /buyerKind/);
  assert.match(
    buyerKindMigration,
    /v_kind NOT IN \('business', 'individual'\)/,
  );
  assert.match(buyerKindMigration, /p_buyer_kind text DEFAULT NULL/);
});
