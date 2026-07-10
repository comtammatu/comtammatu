import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getSupplierInvoiceOutstandingAmount,
  mapSupplierInvoiceRow,
  type SupplierInvoiceRow,
} from "../app/(protected)/inventory/supplier-invoices/supplier-invoice-row";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

test("supplier invoice outstanding amount is total minus paid and never negative", () => {
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
    variance: null,
    invoiceDate: "2026-07-09",
    dueDate: "2026-07-16",
    paymentCount: 0,
    lastPayment: null,
  } satisfies SupplierInvoiceRow;

  assert.equal(getSupplierInvoiceOutstandingAmount(invoice), 60_000);
  assert.equal(
    getSupplierInvoiceOutstandingAmount({ ...invoice, paidAmount: 120_000 }),
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
  assert.equal(row.lastPayment?.id, 11);
  assert.equal(row.lastPayment?.paymentMethod, "bank_transfer");
  assert.equal(row.lastPayment?.referenceNote, "SEPAY-001");
});

test("supplier invoice payment action uses the canonical AP RPC", () => {
  const source = readWeb(
    "app/(protected)/inventory/supplier-invoice-actions.ts",
  );

  assert.match(source, /recordSupplierPayment/);
  assert.match(source, /PERMISSION_KEYS\.FINANCE_AP_PAY/);
  assert.match(source, /\.rpc\(\s*"create_supplier_payment"/);
});

test("supplier invoice client exposes payment only behind server permission", () => {
  const source = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(source, /canPaySupplier/);
  assert.match(source, /recordSupplierPayment/);
  assert.match(source, /setPaymentOpen\(true\)/);
  assert.match(source, /formatVNDate/);
  assert.doesNotMatch(source, /formatVNBusinessDate/);
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
    /supplier_payments \( id, amount, payment_method, payment_date, reference_note \)/,
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
    "supabase/migrations/20260708130500_inventory_supplier_integrity_gates.sql",
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
});

test("supplier returns are unique per active GRN", () => {
  const migration = readRoot(
    "supabase/migrations/20260708130500_inventory_supplier_integrity_gates.sql",
  );

  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_returns_active_grn/);
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
