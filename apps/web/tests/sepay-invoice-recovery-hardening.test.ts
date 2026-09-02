import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInvoiceSchema } from "../lib/hddt-per-order";
import { dueTaxInvoiceIssueJobId } from "../lib/tax-invoice-issue-worker";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = new URL("../../../", import.meta.url);

function read(path: string): string {
  return String(path).includes("supabase/migrations/")
    ? readSql(process.cwd(), String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(new URL(path, root), "utf8");
}

test("stored buyer intent is explicit and cannot collapse into an empty B2C payload", () => {
  const savedBuyer = createInvoiceSchema.safeParse({
    orderId: 91,
    buyerAddress: "12 Nguyễn Huệ",
    buyerNotGetInvoice: false,
  });
  assert.equal(savedBuyer.success, true);
  if (savedBuyer.success) {
    assert.equal(savedBuyer.data.buyerNotGetInvoice, false);
    assert.equal(savedBuyer.data.buyerAddress, "12 Nguyễn Huệ");
  }

  assert.equal(
    createInvoiceSchema.safeParse({ orderId: 91, buyerNotGetInvoice: false })
      .success,
    false,
  );
});

test("SePay only completes payment; the durable job owns HĐĐT recovery", () => {
  const webhook = read("apps/web/app/api/webhooks/sepay/route.ts");
  const finance = read("apps/web/app/(protected)/finance/actions.ts");
  const vercel = read("apps/web/vercel.json");
  const migration = read(
    "supabase/migrations/20260721120000_hddt_payment_completion_worker.sql",
  );

  assert.match(webhook, /"reconcile_sepay_order_evidence"/);
  assert.doesNotMatch(webhook, /issueTaxInvoiceForPaidOrder|createInvoice/);
  assert.doesNotMatch(finance, /issueMissingSepayInvoices|webhook_events/);
  assertSqlMatch(migration, /CREATE TABLE public\.tax_invoice_issue_jobs/);
  assertSqlMatch(migration, /UNIQUE \(tenant_id, order_id\)/);
  assertSqlMatch(migration,
    /pending_payment', 'queued', 'processing', 'completed', 'blocked', 'reconcile_required/,
  );
  assertSqlMatch(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(vercel, /"path": "\/api\/cron\/tax-invoice-issue"/);
  assert.match(vercel, /"schedule": "\*\/5 \* \* \* \*"/);
});

test("provider-issued result is reconciled atomically and never written directly", () => {
  const issuer = read("apps/web/lib/hddt-per-order.ts");
  const migration = read(
    "supabase/migrations/20260721120000_hddt_payment_completion_worker.sql",
  );
  const bindingFix = read(
    "supabase/migrations/20260721211000_bind_tax_invoice_job_on_reconcile.sql",
  );

  assert.match(issuer, /reconcile_tax_invoice_provider_issued/);
  assert.doesNotMatch(issuer, /\.update\(invoiceWrite\)/);
  assertSqlMatch(migration,
    /FOR UPDATE[\s\S]*tax_invoice_reconcile_status_invalid/,
  );
  assertSqlMatch(migration, /tax_invoice_provider_ref_mismatch/);
  assertSqlMatch(migration, /INSERT INTO public\.tax_invoice_events/);
  assertSqlMatch(migration, /INSERT INTO public\.reconcile_run_log/);
  assertSqlMatch(bindingFix,
    /tax_invoice_id = COALESCE\(tax_invoice_id, v_invoice\.id\)/,
  );
  assertSqlMatch(bindingFix,
    /job\.status = 'completed'[\s\S]*job\.tax_invoice_id IS NULL/,
  );
});

test("internal payment helper and two-argument cash overload are not callable directly", () => {
  const migration = read(
    "supabase/migrations/20260721211000_bind_tax_invoice_job_on_reconcile.sql",
  );

  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION private\.upsert_tax_invoice_issue_job\(bigint, bigint, bigint, bigint, jsonb, text\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.confirm_cash_payment_with_invoice_binding\(bigint, numeric\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
});

test("only the service worker can claim or finalize HĐĐT jobs", () => {
  const migration = read(
    "supabase/migrations/20260721121000_harden_tax_invoice_issue_job_acl.sql",
  );

  for (const signature of [
    "public.claim_tax_invoice_issue_jobs(integer, integer)",
    "public.finish_tax_invoice_issue_job_as_system(bigint, text, text)",
  ]) {
    assertSqlMatch(migration,
      new RegExp(
        "REVOKE ALL ON FUNCTION " +
          signature.replace(/[().]/g, "\\$&") +
          " FROM PUBLIC, anon, authenticated;",
      ),
    );
    assertSqlMatch(migration,
      new RegExp(
        "GRANT EXECUTE ON FUNCTION " +
          signature.replace(/[().]/g, "\\$&") +
          " TO service_role;",
      ),
    );
  }
});

test("one-shot HĐĐT worker claims only the requested job", () => {
  const worker = read("apps/web/lib/tax-invoice-issue-worker.ts");
  const issuer = read("apps/web/lib/hddt-per-order.ts");
  const route = read("apps/web/app/api/cron/tax-invoice-issue/route.ts");
  const migration = read(
    "supabase/migrations/20260721210937_add_scoped_tax_invoice_job_claim.sql",
  );

  assert.match(
    worker,
    /if \(jobId !== undefined\)[\s\S]*"claim_tax_invoice_issue_job"[\s\S]*p_job_id: jobId[\s\S]*return summary/,
  );
  assert.match(route, /searchParams\.get\("jobId"\)/);
  assert.match(route, /runTaxInvoiceIssueWorker\(jobId\)/);
  assertSqlMatch(migration, /WHERE job\.id = p_job_id/);
  assertSqlMatch(migration, /FOR UPDATE SKIP LOCKED/);
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.claim_tax_invoice_issue_job\(bigint, integer\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.claim_tax_invoice_issue_job\(bigint, integer\)[\s\S]*TO service_role;/,
  );
  assert.match(
    worker,
    /if \(finalStatus === "issued"\) \{\s*return "completed";\s*\}/,
  );
  assert.match(worker, /issuePreparedTaxInvoice/);
  assert.match(worker, /\.eq\("id", taxInvoiceId\)/);
  assert.match(issuer, /prepare_tax_invoice_issue_job_as_system/);
  assert.match(
    issuer,
    /const invoiceIssuedAt = resolveSinvoiceIssuedAt\([\s\S]*allowBacklogSubmitDate: parsed\.data\.allowBacklogSubmitDate === true/,
  );
  assert.match(issuer, /errorCode: "invoice_issue_date_not_today"/);
});

test("HĐĐT worker failures log bounded diagnostics and preserve recovery state", () => {
  const worker = read("apps/web/lib/tax-invoice-issue-worker.ts");
  const route = read("apps/web/app/api/cron/tax-invoice-issue/route.ts");

  assert.match(
    worker,
    /catch \(error\)[\s\S]*\[tax-invoice-worker\] job failed[\s\S]*jobId: job\.id[\s\S]*tenantId: job\.tenant_id[\s\S]*branchId: job\.branch_id[\s\S]*orderId: job\.order_id[\s\S]*attemptCount: job\.attempt_count[\s\S]*code: workerErrorCode\(error\)[\s\S]*"reconcile_required", "worker_exception"/,
  );
  assert.doesNotMatch(worker, /error\.message/);
  assert.match(
    route,
    /catch \(error\)[\s\S]*\[cron\/tax-invoice-issue\] worker failed"[\s\S]*code: code\.slice\(0, 64\)/,
  );
  assert.doesNotMatch(route, /console\.error\([^;]*error\.message/);
});

test("due HĐĐT jobs can be kicked immediately after payment without bypassing the claim", () => {
  const now = new Date("2026-08-26T16:58:50.000Z");
  assert.equal(
    dueTaxInvoiceIssueJobId(
      {
        id: 3424,
        status: "queued",
        available_at: "2026-08-26T16:58:42.000Z",
      },
      now,
    ),
    3424,
  );
  assert.equal(
    dueTaxInvoiceIssueJobId(
      {
        id: 3424,
        status: "queued",
        available_at: "2026-08-26T16:59:00.000Z",
      },
      now,
    ),
    null,
  );
  assert.equal(
    dueTaxInvoiceIssueJobId(
      {
        id: 3424,
        status: "reconcile_required",
        available_at: "2026-08-26T16:58:42.000Z",
      },
      now,
    ),
    null,
  );
});

test("every payment completion surface schedules the due HĐĐT job and cron is observable", () => {
  const worker = read("apps/web/lib/tax-invoice-issue-worker.ts");
  const payments = read(
    "apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const webhook = read("apps/web/app/api/webhooks/sepay/route.ts");
  const route = read("apps/web/app/api/cron/tax-invoice-issue/route.ts");
  const recovery = read(
    "supabase/migrations/20260826225104_requeue_unsent_date_blocked_invoices.sql",
  );

  assert.match(worker, /after\(async \(\) =>/);
  assert.match(worker, /runTaxInvoiceIssueWorker\(jobId\)/);
  assert.match(worker, /\.eq\("tenant_id", input\.tenantId\)/);
  assert.match(worker, /\.eq\("order_id", input\.orderId\)/);
  assert.equal(
    payments.match(/scheduleDueTaxInvoiceIssueForOrder\(/g)?.length,
    3,
  );
  assert.match(
    webhook,
    /reconciliation\.data\.status === "matched"[\s\S]*scheduleDueTaxInvoiceIssueForOrder/,
  );
  assert.match(route, /Tax invoice issue worker started/);
  assert.match(route, /Tax invoice issue worker completed/);
  assertSqlMatch(recovery, /job\.last_error = 'invoice_issue_date_not_today'/);
  assertSqlMatch(recovery, /invoice\.status = 'draft'/);
  assertSqlMatch(recovery, /invoice\.provider_ref IS NULL/);
  assertSqlMatch(recovery, /invoice\.provider_data IS NULL/);
  assertSqlNotMatch(recovery,
    /(?:job|invoice)\.status\s*=\s*'(?:signing|submitted|reconcile_required)'/,
  );
});
