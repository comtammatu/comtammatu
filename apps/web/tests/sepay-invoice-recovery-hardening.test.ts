import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInvoiceSchema } from "../lib/hddt-per-order";

const root = new URL("../../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
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
  assert.match(migration, /CREATE TABLE public\.tax_invoice_issue_jobs/);
  assert.match(migration, /UNIQUE \(tenant_id, order_id\)/);
  assert.match(migration, /pending_payment', 'queued', 'processing', 'completed', 'blocked', 'reconcile_required/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
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
  assert.match(migration, /FOR UPDATE[\s\S]*tax_invoice_reconcile_status_invalid/);
  assert.match(migration, /tax_invoice_provider_ref_mismatch/);
  assert.match(migration, /INSERT INTO public\.tax_invoice_events/);
  assert.match(migration, /INSERT INTO public\.reconcile_run_log/);
  assert.match(
    bindingFix,
    /tax_invoice_id = COALESCE\(tax_invoice_id, v_invoice\.id\)/,
  );
  assert.match(bindingFix, /job\.status = 'completed'[\s\S]*job\.tax_invoice_id IS NULL/);
});

test("internal payment helper and two-argument cash overload are not callable directly", () => {
  const migration = read(
    "supabase/migrations/20260721211000_bind_tax_invoice_job_on_reconcile.sql",
  );

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\.upsert_tax_invoice_issue_job\(bigint, bigint, bigint, bigint, jsonb, text\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
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
    assert.match(
      migration,
      new RegExp(
        "REVOKE ALL ON FUNCTION " +
          signature.replace(/[().]/g, "\\$&") +
          " FROM PUBLIC, anon, authenticated;",
      ),
    );
    assert.match(
      migration,
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
  const route = read("apps/web/app/api/cron/tax-invoice-issue/route.ts");
  const migration = read(
    "supabase/migrations/20260721210937_add_scoped_tax_invoice_job_claim.sql",
  );

  assert.match(worker, /jobId === undefined[\s\S]*claim_tax_invoice_issue_job/);
  assert.match(route, /searchParams\.get\("jobId"\)/);
  assert.match(route, /runTaxInvoiceIssueWorker\(jobId\)/);
  assert.match(migration, /WHERE job\.id = p_job_id/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.claim_tax_invoice_issue_job\(bigint, integer\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.claim_tax_invoice_issue_job\(bigint, integer\)[\s\S]*TO service_role;/,
  );
  assert.match(
    worker,
    /if \(finalStatus === "issued"\) \{\s*return "completed";\s*\}/,
  );
});
