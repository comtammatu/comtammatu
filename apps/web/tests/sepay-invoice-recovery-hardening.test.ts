import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInvoiceSchema } from "../lib/hddt-per-order";
import { normalizePgDumpSql } from "./sql-test-utils";

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

  const emptyBuyer = createInvoiceSchema.safeParse({
    orderId: 91,
    buyerNotGetInvoice: false,
  });
  assert.equal(emptyBuyer.success, false);
});

test("SePay recovery is keyset-paginated and preserves stored buyer payload", () => {
  const source = read("apps/web/app/(protected)/finance/actions.ts");

  assert.match(source, /\.limit\(SEPAY_MISSING_SCAN_CAP \+ 1\)/);
  assert.match(source, /webhookQuery = webhookQuery\.gt\("id", afterEventId\)/);
  assert.match(source, /const hasMoreEvents =[^;]+> SEPAY_MISSING_SCAN_CAP/s);
  assert.match(
    source,
    /\.from\("self_order_payment_requests"\)[\s\S]*\.eq\("method", "vietqr"\)[\s\S]*\.eq\("status", "completed"\)[\s\S]*\.in\("order_id", orderIds\)/,
  );
  assert.match(
    source,
    /createInvoiceSchema\.safeParse\(\{\s*\.\.\.invoiceRequest\.invoice_payload,\s*orderId: payment\.order_id/s,
  );
  assert.match(source, /invoiceRequest\.payment_id !== payment\.id/);
  assert.doesNotMatch(source, /invoiceRequest\.payment_id != null/);
  assert.match(source, /input: invoiceInput/);
  assert.doesNotMatch(
    source,
    /input:\s*\{\s*orderId,\s*buyerNotGetInvoice:\s*true\s*\}/,
  );
});

test("SePay recovery and shared issuer fail closed before provider submission", () => {
  const recovery = read("apps/web/app/(protected)/finance/actions.ts");
  const issuer = read("apps/web/lib/hddt-per-order.ts");
  const baseline = normalizePgDumpSql(
    read("supabase/migrations/20260720035548_baseline.sql"),
  );

  assert.match(
    recovery,
    /activeInvoiceResult\.error \|\|\s*historicalAggregateLinkResult\.error \|\|\s*invoiceRequestResult\.error/,
  );
  assert.match(issuer, /if \(existingErr\)/);
  assert.match(issuer, /if \(aggregateLinksErr\)/);
  assert.match(
    issuer,
    /\.update\(\{[\s\S]*status: "signing"[\s\S]*\.eq\("status", "draft"\)/,
  );
  assert.match(issuer, /buildSinvoiceTransactionUuid\(parsed\.data\.orderId\)/);
  assert.doesNotMatch(issuer, /Release invoice claim/);
  assert.match(
    issuer,
    /providerErrorCode === "exception"[\s\S]*providerErrorCode === "TRANSACTION_IS_BEING_PROCESSED"/,
  );
  assert.match(
    baseline,
    /CREATE UNIQUE INDEX uq_tax_invoices_active_per_order[\s\S]*\(order_id\)[\s\S]*WHERE/,
  );

  const reservationIndex = issuer.indexOf("reservationMutation.select");
  const providerIndex = issuer.indexOf("invoiceProvider.createInvoice");
  const finalWriteIndex = issuer.indexOf(".update(invoiceWrite)");
  assert.ok(reservationIndex >= 0);
  assert.ok(providerIndex > reservationIndex);
  assert.ok(finalWriteIndex > providerIndex);
});

test("shared invoice recovery preserves the canonical no-buyer flag", () => {
  const source = read("apps/web/lib/hddt-per-order.ts");

  assert.match(
    source,
    /id, status, invoice_number, buyer_name, buyer_tax_code, buyer_address, buyer_email/,
  );
  assert.match(
    source,
    /retryDraftInvoiceId[\s\S]*existing\?\.buyer_tax_code[\s\S]*existing\?\.buyer_address[\s\S]*existing\?\.buyer_email[\s\S]*existing\?\.buyer_name[\s\S]*buyerNotGetInvoiceInput = retryDraftInvoiceId[\s\S]*buyerNameInput === BUYER_NOT_GET_INVOICE_NAME/,
  );
});

test("historical aggregate guard excludes saved buyer requests and shares the order lock", () => {
  const migration = read(
    "supabase/migration-archive/20260714031034_20260714103000_harden_sepay_invoice_recovery.sql",
  );

  assert.match(
    migration,
    /FROM public\.self_order_payment_requests sopr[\s\S]*sopr\.status = 'completed'[\s\S]*sopr\.invoice_payload @> '\{"buyerNotGetInvoice": false\}'::jsonb/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.hddt_assert_per_order_invoice_slot\(\)[\s\S]*pg_advisory_xact_lock[\s\S]*active daily summary/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.tio_assert_one_active_summary_per_order\(\)[\s\S]*pg_advisory_xact_lock[\s\S]*active per-order invoice/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_tax_invoices_assert_per_order_slot[\s\S]*BEFORE INSERT ON public\.tax_invoices/,
  );
});
