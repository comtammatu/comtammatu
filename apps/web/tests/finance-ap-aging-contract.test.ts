import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUPPLIER_INVOICE_AGING_BUCKETS,
  getSupplierInvoiceAgingBucket,
  computeSupplierInvoiceAgingSummary,
  isSupplierInvoiceOverdue,
  filterSupplierInvoices,
  parseSupplierInvoiceListFilters,
  type SupplierInvoiceListFilters,
} from "../app/(protected)/finance/supplier-invoices/supplier-invoice-list-model";
import type { SupplierInvoiceRow } from "../app/(protected)/finance/supplier-invoices/supplier-invoice-row";

const TODAY = "2026-09-07";

function makeInvoice(
  id: number,
  overrides: Partial<SupplierInvoiceRow> = {},
): SupplierInvoiceRow {
  return {
    id,
    supplierId: 1,
    grnId: id,
    poId: null,
    supplierName: "NCC A",
    grnCode: `GRN-${String(id).padStart(3, "0")}`,
    poCode: null,
    matchStatus: "matched",
    paymentStatus: "unpaid",
    subtotal: 90_000,
    vatAmount: 10_000,
    vatBreakdown: [{ vatRate: 10, taxableAmount: 90_000, vatAmount: 10_000 }],
    amount: 100_000,
    paidAmount: 0,
    creditAppliedAmount: 0,
    variance: null,
    invoiceDate: "2026-08-01",
    dueDate: "2026-09-07",
    vatInvoiceAttachmentPath: `1/invoice-${id}.pdf`,
    paymentCount: 0,
    lastPayment: null,
    ...overrides,
  };
}

test("SUPPLIER_INVOICE_AGING_BUCKETS contains 5 standard buckets", () => {
  assert.deepEqual(SUPPLIER_INVOICE_AGING_BUCKETS, [
    "due_soon",
    "current_later",
    "overdue_1_15",
    "overdue_16_30",
    "overdue_30_plus",
  ]);
});

test("Aging bucket classification: unexpired payables", () => {
  // Due today (0 days) => due_soon
  const invToday = makeInvoice(1, { dueDate: "2026-09-07" });
  assert.equal(getSupplierInvoiceAgingBucket(invToday, TODAY), "due_soon");

  // Due in 3 days => due_soon
  const inv3d = makeInvoice(2, { dueDate: "2026-09-10" });
  assert.equal(getSupplierInvoiceAgingBucket(inv3d, TODAY), "due_soon");

  // Due in 7 days (boundary) => due_soon
  const inv7d = makeInvoice(3, { dueDate: "2026-09-14" });
  assert.equal(getSupplierInvoiceAgingBucket(inv7d, TODAY), "due_soon");

  // Due in 8 days => current_later
  const inv8d = makeInvoice(4, { dueDate: "2026-09-15" });
  assert.equal(getSupplierInvoiceAgingBucket(inv8d, TODAY), "current_later");

  // Due in 30 days => current_later
  const inv30d = makeInvoice(5, { dueDate: "2026-10-07" });
  assert.equal(getSupplierInvoiceAgingBucket(inv30d, TODAY), "current_later");
});

test("Aging bucket classification: overdue payables", () => {
  // Overdue by 1 day => overdue_1_15
  const inv1d = makeInvoice(10, { dueDate: "2026-09-06" });
  assert.equal(getSupplierInvoiceAgingBucket(inv1d, TODAY), "overdue_1_15");

  // Overdue by 15 days (boundary) => overdue_1_15
  const inv15d = makeInvoice(11, { dueDate: "2026-08-23" });
  assert.equal(getSupplierInvoiceAgingBucket(inv15d, TODAY), "overdue_1_15");

  // Overdue by 16 days (boundary) => overdue_16_30
  const inv16d = makeInvoice(12, { dueDate: "2026-08-22" });
  assert.equal(getSupplierInvoiceAgingBucket(inv16d, TODAY), "overdue_16_30");

  // Overdue by 30 days (boundary) => overdue_16_30
  const inv30d = makeInvoice(13, { dueDate: "2026-08-08" });
  assert.equal(getSupplierInvoiceAgingBucket(inv30d, TODAY), "overdue_16_30");

  // Overdue by 31 days => overdue_30_plus
  const inv31d = makeInvoice(14, { dueDate: "2026-08-07" });
  assert.equal(getSupplierInvoiceAgingBucket(inv31d, TODAY), "overdue_30_plus");

  // Overdue by 90 days => overdue_30_plus
  const inv90d = makeInvoice(15, { dueDate: "2026-06-09" });
  assert.equal(getSupplierInvoiceAgingBucket(inv90d, TODAY), "overdue_30_plus");
});

test("Aging bucket returns null for paid invoices, settled balance, or missing due date", () => {
  // Fully paid
  const paid = makeInvoice(20, {
    amount: 100_000,
    paidAmount: 100_000,
    dueDate: "2026-08-01",
  });
  assert.equal(getSupplierInvoiceAgingBucket(paid, TODAY), null);

  // Fully covered by credit note
  const credited = makeInvoice(21, {
    amount: 100_000,
    paidAmount: 0,
    creditAppliedAmount: 100_000,
    dueDate: "2026-08-01",
  });
  assert.equal(getSupplierInvoiceAgingBucket(credited, TODAY), null);

  // Missing due date
  const noDueDate = makeInvoice(22, { dueDate: null });
  assert.equal(getSupplierInvoiceAgingBucket(noDueDate, TODAY), null);
});

test("isSupplierInvoiceOverdue contract: true only when dueDate < today and outstanding > 0", () => {
  const overdue = makeInvoice(30, {
    dueDate: "2026-09-06",
    amount: 100_000,
    paidAmount: 0,
  });
  assert.equal(isSupplierInvoiceOverdue(overdue, TODAY), true);

  const dueToday = makeInvoice(31, {
    dueDate: "2026-09-07",
    amount: 100_000,
    paidAmount: 0,
  });
  assert.equal(isSupplierInvoiceOverdue(dueToday, TODAY), false);

  const future = makeInvoice(32, {
    dueDate: "2026-09-08",
    amount: 100_000,
    paidAmount: 0,
  });
  assert.equal(isSupplierInvoiceOverdue(future, TODAY), false);

  // Past due date but fully paid => not overdue
  const paidPast = makeInvoice(33, {
    dueDate: "2026-08-01",
    amount: 100_000,
    paidAmount: 100_000,
  });
  assert.equal(isSupplierInvoiceOverdue(paidPast, TODAY), false);

  // No due date => not overdue
  const noDueDate = makeInvoice(34, {
    dueDate: null,
    amount: 100_000,
    paidAmount: 0,
  });
  assert.equal(isSupplierInvoiceOverdue(noDueDate, TODAY), false);
});

test("computeSupplierInvoiceAgingSummary computes accurate buckets and amounts", () => {
  const invoices = [
    makeInvoice(1, { amount: 10_000_000, dueDate: "2026-09-10" }), // due_soon 10M
    makeInvoice(2, { amount: 20_000_000, dueDate: "2026-09-25" }), // current_later 20M
    makeInvoice(3, { amount: 5_000_000, dueDate: "2026-09-02" }), // overdue_1_15 (5 days) 5M
    makeInvoice(4, { amount: 8_000_000, dueDate: "2026-08-20" }), // overdue_16_30 (18 days) 8M
    makeInvoice(5, { amount: 12_000_000, dueDate: "2026-07-01" }), // overdue_30_plus 12M
    makeInvoice(6, {
      amount: 50_000_000,
      paidAmount: 50_000_000,
      dueDate: "2026-08-01",
    }), // fully paid => ignored
    makeInvoice(7, { amount: 3_000_000, dueDate: null }), // no due date => outstanding only
  ];

  const summary = computeSupplierInvoiceAgingSummary(invoices, TODAY);

  assert.equal(summary.totalOutstandingCount, 6);
  assert.equal(summary.totalOutstandingAmount, 58_000_000);

  // Overdue total = 5M + 8M + 12M = 25M (3 invoices)
  assert.equal(summary.overdueCount, 3);
  assert.equal(summary.overdueAmount, 25_000_000);

  // Due soon = 10M (1 invoice)
  assert.equal(summary.dueSoonCount, 1);
  assert.equal(summary.dueSoonAmount, 10_000_000);

  // Current later = 20M (1 invoice)
  assert.equal(summary.currentLaterCount, 1);
  assert.equal(summary.currentLaterAmount, 20_000_000);

  // Detail buckets
  assert.deepEqual(summary.buckets.due_soon, { count: 1, amount: 10_000_000 });
  assert.deepEqual(summary.buckets.current_later, { count: 1, amount: 20_000_000 });
  assert.deepEqual(summary.buckets.overdue_1_15, { count: 1, amount: 5_000_000 });
  assert.deepEqual(summary.buckets.overdue_16_30, { count: 1, amount: 8_000_000 });
  assert.deepEqual(summary.buckets.overdue_30_plus, { count: 1, amount: 12_000_000 });
});

test("filterSupplierInvoices filters by agingBucket correctly", () => {
  const invoices = [
    makeInvoice(1, { amount: 10_000_000, dueDate: "2026-09-10" }), // due_soon
    makeInvoice(2, { amount: 20_000_000, dueDate: "2026-09-25" }), // current_later
    makeInvoice(3, { amount: 5_000_000, dueDate: "2026-09-02" }), // overdue_1_15
  ];

  const defaultFilters: SupplierInvoiceListFilters = {
    query: "",
    supplierId: null,
    matchStatus: null,
    paymentStatus: null,
    overdueOnly: false,
    agingBucket: "overdue_1_15",
    vatEvidence: null,
    viewMode: "supplier",
  };

  const filtered = filterSupplierInvoices(invoices, defaultFilters, TODAY);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, 3);
});

test("parseSupplierInvoiceListFilters parses overdue boolean and agingBucket parameter", () => {
  const parsed1 = parseSupplierInvoiceListFilters({ overdue: "1", agingBucket: "due_soon" });
  assert.equal(parsed1.overdueOnly, true);
  assert.equal(parsed1.agingBucket, "due_soon");

  const parsed2 = parseSupplierInvoiceListFilters({ overdue: "1", agingBucket: "overdue_30_plus" });
  assert.equal(parsed2.overdueOnly, true);
  assert.equal(parsed2.agingBucket, "overdue_30_plus");

  const parsedInvalid = parseSupplierInvoiceListFilters({ overdue: "0", agingBucket: "invalid_bucket" });
  assert.equal(parsedInvalid.overdueOnly, false);
  assert.equal(parsedInvalid.agingBucket, null);
});
