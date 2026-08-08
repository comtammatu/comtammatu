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

test("POS and Self-Order defer buyer details to the receipt QR", () => {
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
  assert.doesNotMatch(
    selfOrderPaymentPanel,
    /buyerTaxCode|buyerNotGetInvoice|lookupBusinessTaxCode/,
  );
  assert.doesNotMatch(
    selfOrderClient,
    /buyerTaxCode|buyerNotGetInvoice|paymentConfirmInvoice/,
  );
  assert.match(selfOrderClient, /\{ clientOpId: intent\.clientOpId, method \}/);
  assert.doesNotMatch(selfOrderClient, /invoice: invoicePayload/);
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
  assert.doesNotMatch(issuer, /issueTaxInvoiceForPaidOrder|DRAFT-/);
  assert.match(buyerServer, /if \(result\.success\)/);
  assert.match(buyerServer, /buyerKind: "business" \| "individual"/);
  assert.match(buyerServer, /buyerEmail: string/);
  assert.match(buyerServer, /return \{ status: "failed", jobId: null \}/);
  assert.match(action, /buyerName: business\.name/);
  assert.match(action, /buyerAddress: business\.address/);
  assert.match(action, /buyerName: parsed\.data\.buyerName/);
  assert.match(form, /ToggleGroup/);
  assert.match(form, /buyerKindBusiness|buyerKindIndividual/);
  assert.match(form, /readOnly=\{buyerKind === "business"\}/);
  assert.match(form, /id="invoice-buyer-email"[\s\S]*required/);
  assert.match(form, /formatVNDateTime\(expiresAt\)/);
  assert.match(
    form,
    /Date\.parse\(expiresAt\) - Date\.now\(\)[\s\S]*window\.setTimeout\(\(\) => setExpired\(true\), remaining\)/,
  );
  assert.match(form, /result && !result\.ok && result\.terminal/);
  assert.match(page, /expiresAt=\{request\.expiresAt\}/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(form, /invoiceBuyer\.optional/);
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
