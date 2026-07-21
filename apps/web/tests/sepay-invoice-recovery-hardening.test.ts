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
});

test("provider-issued result is reconciled atomically and never written directly", () => {
  const issuer = read("apps/web/lib/hddt-per-order.ts");
  const migration = read(
    "supabase/migrations/20260721120000_hddt_payment_completion_worker.sql",
  );

  assert.match(issuer, /reconcile_tax_invoice_provider_issued/);
  assert.doesNotMatch(issuer, /\.update\(invoiceWrite\)/);
  assert.match(migration, /FOR UPDATE[\s\S]*tax_invoice_reconcile_status_invalid/);
  assert.match(migration, /tax_invoice_provider_ref_mismatch/);
  assert.match(migration, /INSERT INTO public\.tax_invoice_events/);
  assert.match(migration, /INSERT INTO public\.reconcile_run_log/);
});
