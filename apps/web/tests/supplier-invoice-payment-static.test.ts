import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getSupplierInvoiceEffectivePaymentStatus,
  getSupplierInvoiceOutstandingAmount,
  mapSupplierInvoiceRow,
  resolveSupplierPaymentIntentKey,
  type SupplierInvoiceRow,
} from "../app/(protected)/inventory/supplier-invoices/supplier-invoice-row";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

test("supplier invoice outstanding amount subtracts paid and credited value", () => {
  const invoice = {
    id: 1,
    supplierId: 1,
    grnId: 1,
    poId: null,
    code: "NCC-001",
    supplierName: "NCC",
    grnCode: "GRN-001",
    poCode: null,
    matchStatus: "matched",
    paymentStatus: "partial",
    amount: 100_000,
    paidAmount: 40_000,
    creditAppliedAmount: 0,
    variance: null,
    invoiceDate: "2026-07-09",
    dueDate: "2026-07-16",
    paymentCount: 0,
    lastPayment: null,
  } satisfies SupplierInvoiceRow;

  assert.equal(getSupplierInvoiceOutstandingAmount(invoice), 60_000);
  assert.equal(
    getSupplierInvoiceOutstandingAmount({
      ...invoice,
      creditAppliedAmount: 10_000,
    }),
    50_000,
  );
  assert.equal(
    getSupplierInvoiceOutstandingAmount({
      ...invoice,
      paidAmount: 90_000,
      creditAppliedAmount: 20_000,
    }),
    0,
  );
});

test("supplier invoice mapper keeps latest supplier payment for AP drilldown", () => {
  const row = mapSupplierInvoiceRow({
    id: 1,
    supplier_id: 2,
    invoice_number: "NCC-001",
    total_amount: 100_000,
    paid_amount: 50_000,
    credit_applied_amount: 10_000,
    payment_status: "partial",
    matching_status: "matched",
    invoice_date: "2026-07-09",
    due_date: "2026-07-16",
    suppliers: { name: "NCC A" },
    supplier_payments: [
      {
        id: 10,
        amount: 20_000,
        payment_method: "cash",
        payment_date: "2026-07-09T02:00:00Z",
        reference_note: null,
      },
      {
        id: 11,
        amount: 30_000,
        payment_method: "bank_transfer",
        payment_date: "2026-07-10T02:00:00Z",
        reference_note: "SEPAY-001",
      },
    ],
  });

  assert.equal(row.paymentCount, 2);
  assert.equal(row.creditAppliedAmount, 10_000);
  assert.equal(getSupplierInvoiceOutstandingAmount(row), 40_000);
  assert.equal(row.lastPayment?.id, 11);
  assert.equal(row.lastPayment?.paymentMethod, "bank_transfer");
  assert.equal(row.lastPayment?.referenceNote, "SEPAY-001");
});

test("supplier invoice settlement status follows effective payable truth", () => {
  assert.equal(
    getSupplierInvoiceEffectivePaymentStatus({
      amount: 100_000,
      paidAmount: 50_000,
      creditAppliedAmount: 50_000,
    }),
    "paid",
  );
  assert.equal(
    getSupplierInvoiceEffectivePaymentStatus({
      amount: 100_000,
      paidAmount: 0,
      creditAppliedAmount: 20_000,
    }),
    "partial",
  );
});

test("supplier payment retry keeps one intent key after an ambiguous failure", () => {
  let storedKey: string | null = null;
  let created = 0;
  const createKey = () => {
    created += 1;
    return "019f5c6d-45d0-7f9f-aabc-7c25b7d03111";
  };

  storedKey = resolveSupplierPaymentIntentKey(storedKey, createKey);
  const retryKey = resolveSupplierPaymentIntentKey(storedKey, createKey);

  assert.equal(retryKey, storedKey);
  assert.equal(created, 1);
});

test("supplier invoice payment action uses Owner-only idempotent AP RPC", () => {
  const source = readWeb(
    "app/(protected)/inventory/supplier-invoice-actions.ts",
  );

  assert.match(source, /recordSupplierPayment/);
  assert.match(source, /roles: MODULE_ACL\.finance\.allowedRoles/);
  assert.match(source, /PERMISSION_KEYS\.FINANCE_AP_PAY/);
  assert.match(source, /idempotencyKey: z\.string\(\)\.uuid\(\)/);
  assert.match(source, /\.rpc\(\s*"record_supplier_payment"/);
  assert.match(source, /p_idempotency_key: data\.idempotencyKey/);
});

test("supplier invoice client exposes payment only behind server permission", () => {
  const source = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /canPaySupplier/);
  assert.match(source, /recordSupplierPayment/);
  assert.match(source, /paymentIntentKeyRef/);
  assert.match(source, /resolveSupplierPaymentIntentKey/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /openSupplierPaymentDialog/);
  assert.match(
    source,
    /try\s*\{[\s\S]*recordSupplierPayment[\s\S]*catch\s*\{[\s\S]*paymentRetrySameIntent/,
  );
  assert.match(source, /formatVNDate/);
  assert.doesNotMatch(source, /formatVNBusinessDate/);
});

test("supplier invoice payment visibility is explicitly Owner-only", () => {
  const financePage = readWeb(
    "app/(protected)/finance/supplier-invoices/page.tsx",
  );
  const inventoryPage = readWeb(
    "app/(protected)/inventory/supplier-invoices/page.tsx",
  );

  for (const source of [financePage, inventoryPage]) {
    assert.match(source, /loadAuthState\(\)/);
    assert.match(source, /authState\.claims\.user_role === "owner"/);
    assert.match(source, /hasPayPermission/);
  }
});

test("supplier invoice client groups payable review by supplier and PO", () => {
  const actionSource = readWeb(
    "app/(protected)/inventory/supplier-invoice-actions.ts",
  );
  const mapper = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoice-row.ts",
  );
  const client = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(actionSource, /purchase_orders \( id, po_number \)/);
  assert.match(
    actionSource,
    /credit_applied_amount[\s\S]*supplier_payments \( id, amount, payment_method, payment_date, reference_note \)/,
  );
  assert.match(mapper, /poId/);
  assert.match(mapper, /poCode/);
  assert.match(mapper, /lastPayment/);
  assert.match(client, /SupplierInvoiceViewMode/);
  assert.match(client, /viewBySupplier/);
  assert.match(client, /viewByPo/);
  assert.match(client, /invoiceGroups/);
  assert.match(client, /outstandingAmount/);
  assert.match(client, /overdueAmount/);
  assert.match(client, /lastPaymentSummary/);
});

test("supplier invoice desktop layout does not squeeze the detail pane", () => {
  const source = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /contentScroll/);
  assert.doesNotMatch(source, /key:\s*"supplier"/);
  assert.doesNotMatch(source, /key:\s*"remaining"/);
  assert.doesNotMatch(source, /sm:grid-cols-3/);
  assert.match(source, /md:grid-cols-2/);
});

test("baseline keeps supplier payment ledger and invoice status together", () => {
  const source = readRoot("supabase/migrations/00000000000000_baseline.sql");

  assert.match(source, /CREATE FUNCTION public\.create_supplier_payment/);
  assert.match(source, /INSERT INTO public\.supplier_payments/);
  assert.match(source, /UPDATE public\.supplier_invoices/);
});

test("supplier payment RPC requires matched GRN evidence", () => {
  const migration = readRoot(
    "supabase/migrations/20260715073331_harden_supplier_payment_idempotency.sql",
  );
  const acceptance = readRoot(
    "supabase/tests/supplier_payment_idempotency_test.sql",
  );
  const actionSource = readWeb(
    "app/(protected)/inventory/supplier-invoice-actions.ts",
  );

  assert.match(migration, /v_invoice\.grn_id IS NULL/);
  assert.match(migration, /invoice_missing_grn_for_payment/);
  assert.match(migration, /v_invoice\.matching_status <> 'matched'/);
  assert.match(migration, /invoice_not_matched_for_payment/);
  assert.match(actionSource, /invoice_missing_grn_for_payment/);
  assert.match(actionSource, /invoice_not_matched_for_payment/);
  assert.match(acceptance, /missing-GRN payment unexpectedly succeeded/);
  assert.match(acceptance, /unmatched invoice payment unexpectedly succeeded/);
});

test("supplier payment migration enforces exact replay, credit-aware cap, and Owner boundary", () => {
  const migration = readRoot(
    "supabase/migrations/20260715073331_harden_supplier_payment_idempotency.sql",
  );

  assert.match(migration, /ADD COLUMN idempotency_key uuid/);
  assert.match(migration, /ADD COLUMN idempotency_result_status text/);
  assert.match(migration, /idempotency_result_status IS NOT NULL/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX supplier_payments_tenant_id_idempotency_key_uidx/,
  );
  assert.match(migration, /CREATE FUNCTION public\.record_supplier_payment/);
  assert.match(migration, /SET search_path TO ''/);
  assert.match(migration, /public\.auth_is_owner\(v_uid\)/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /supplier_payment_idempotency_conflict/);
  assert.match(
    migration,
    /v_new_paid \+ v_credit_applied > v_invoice\.total_amount/,
  );
  assert.match(
    migration,
    /v_new_paid \+ v_credit_applied >= v_invoice\.total_amount/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_supplier_payment[\s\S]*SECURITY INVOKER[\s\S]*RETURN public\.record_supplier_payment/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.apply_credit_note_to_invoice[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
});

test("AP aging uses effective balance after supplier credit", () => {
  const migration = readRoot(
    "supabase/migrations/20260715073331_harden_supplier_payment_idempotency.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_ap_aging/);
  assert.match(
    migration,
    /si\.total_amount[\s\S]*COALESCE\(si\.paid_amount, 0\)[\s\S]*COALESCE\(si\.credit_applied_amount, 0\)/,
  );
  assert.match(migration, /public\.auth_is_owner\(auth\.uid\(\)\)/);

  const reportAction = readWeb(
    "app/(protected)/inventory/report-actions.ts",
  );
  const reportPage = readWeb("app/(protected)/inventory/reports/page.tsx");
  assert.match(reportAction, /MODULE_ACL\.finance\.allowedRoles/);
  assert.match(reportAction, /PERMISSION_KEYS\.FINANCE_VIEW/);
  assert.match(reportPage, /showSupplierPayables = claims\.user_role === "owner"/);
});

test("supplier returns are unique per active GRN", () => {
  const migration = readRoot(
    "supabase/migrations/20260708130500_inventory_supplier_integrity_gates.sql",
  );

  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_returns_active_grn/,
  );
  assert.match(migration, /ON public\.supplier_returns \(tenant_id, grn_id\)/);
  assert.match(migration, /status <> 'cancelled'/);
  assert.match(migration, /supplier_return_duplicate_grn/);
});

test("supplier invoice matching requires linked GRN evidence", () => {
  const baseline = readRoot("supabase/migrations/00000000000000_baseline.sql");
  const migration = readRoot(
    "supabase/migrations/20260708062218_supplier_invoice_missing_grn_pending.sql",
  );
  const mapper = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoice-row.ts",
  );
  const client = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(baseline, /IF v_inv\.grn_id IS NULL THEN/);
  assert.match(
    migration,
    /WHERE grn_id IS NULL\s+AND matching_status = 'matched'/,
  );
  assert.match(mapper, /rawMatchStatus === "matched" && grnId == null/);
  assert.match(client, /missingGrnTitle/);
  assert.match(client, /getDisplayMatchStatus/);
});
