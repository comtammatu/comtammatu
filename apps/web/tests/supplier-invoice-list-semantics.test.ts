import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  filterSupplierInvoices,
  groupSupplierInvoices,
  hasSupplierInvoiceListFilters,
  isSupplierInvoiceMissingVatEvidence,
  parseSupplierInvoiceListFilters,
  type SupplierInvoiceListFilters,
} from "../app/(protected)/finance/supplier-invoices/supplier-invoice-list-model";
import {
  mapSupplierInvoiceRow,
  type SupplierInvoiceRow,
} from "../app/(protected)/finance/supplier-invoices/supplier-invoice-row";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const DEFAULT_FILTERS: SupplierInvoiceListFilters = {
  query: "",
  supplierId: null,
  matchStatus: null,
  paymentStatus: null,
  overdueOnly: false,
  vatEvidence: null,
  viewMode: "supplier",
};

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
    subtotal: 92_593,
    vatAmount: 7_407,
    vatBreakdown: [{ vatRate: 8, taxableAmount: 92_593, vatAmount: 7_407 }],
    amount: 100_000,
    paidAmount: 0,
    creditAppliedAmount: 0,
    variance: null,
    invoiceDate: `2026-07-${String((id % 28) + 1).padStart(2, "0")}`,
    dueDate: "2026-07-10",
    vatInvoiceAttachmentPath: `1/invoice-${id}.pdf`,
    paymentCount: 0,
    lastPayment: null,
    ...overrides,
  };
}

test("supplier invoice URL filters parse canonical values and ignore invalid state", () => {
  const parsed = parseSupplierInvoiceListFilters({
    q: ["  NCC  ", "ignored"],
    supplierId: "42",
    matchStatus: "discrepancy",
    paymentStatus: "partial",
    overdue: "1",
    vat: "missing",
    view: "po",
  });

  assert.deepEqual(parsed, {
    query: "NCC",
    supplierId: 42,
    matchStatus: "discrepancy",
    paymentStatus: "partial",
    overdueOnly: true,
    vatEvidence: "missing",
    viewMode: "po",
  });
  assert.equal(hasSupplierInvoiceListFilters(parsed), true);

  assert.deepEqual(
    parseSupplierInvoiceListFilters({
      supplierId: "-1",
      matchStatus: "unknown",
      paymentStatus: "unknown",
      overdue: "true",
      vat: "attached",
      view: "unknown",
    }),
    DEFAULT_FILTERS,
  );
  assert.equal(
    hasSupplierInvoiceListFilters({
      ...DEFAULT_FILTERS,
      vatEvidence: "missing",
    }),
    true,
  );
});

test("missing HĐ GTGT is a payable-only blocker surfaced on list and group", () => {
  const blocked = makeInvoice(1, {
    vatInvoiceAttachmentPath: null,
    amount: 200_000,
  });
  const settledWithoutFile = makeInvoice(2, {
    vatInvoiceAttachmentPath: null,
    amount: 100_000,
    creditAppliedAmount: 100_000,
    paymentStatus: "paid",
  });
  const ready = makeInvoice(3, { amount: 50_000 });

  assert.equal(isSupplierInvoiceMissingVatEvidence(blocked), true);
  assert.equal(isSupplierInvoiceMissingVatEvidence(settledWithoutFile), false);
  assert.equal(isSupplierInvoiceMissingVatEvidence(ready), false);

  assert.deepEqual(
    filterSupplierInvoices(
      [blocked, settledWithoutFile, ready],
      { ...DEFAULT_FILTERS, vatEvidence: "missing" },
      "2026-07-09",
    ).map((invoice) => invoice.id),
    [1],
  );

  const [group] = groupSupplierInvoices(
    [blocked, settledWithoutFile, ready],
    "supplier",
    "2026-07-09",
  );
  assert.equal(group?.invoiceCount, 3);
  assert.equal(group?.missingVatCount, 1);
  assert.equal(group?.missingVatAmount, 200_000);
});

test("server-owned supplier search finds an invoice beyond the first cursor page", () => {
  const invoices = Array.from({ length: 60 }, (_, index) =>
    makeInvoice(index + 1),
  );
  invoices[59] = makeInvoice(60, {
    supplierName: "NCC Cuối danh sách",
  });

  assert.deepEqual(
    filterSupplierInvoices(invoices, {
      ...DEFAULT_FILTERS,
      query: "unloaded",
    }),
    [],
  );

  const matches = filterSupplierInvoices(invoices, {
    ...DEFAULT_FILTERS,
    query: "cuối danh sách",
  });

  assert.deepEqual(
    matches.map((invoice) => invoice.id),
    [60],
  );
});

test("payment and overdue filters use effective payable truth", () => {
  const creditSettled = mapSupplierInvoiceRow({
    id: 1,
    supplier_id: 1,
    grn_id: 1,
    invoice_date: "2026-07-01",
    due_date: "2026-07-02",
    total_amount: 100_000,
    paid_amount: 0,
    credit_applied_amount: 100_000,
    matching_status: "matched",
    suppliers: { name: "NCC A" },
  });
  const overdue = makeInvoice(2, { dueDate: "2026-07-09" });
  const notYetDue = makeInvoice(3, { dueDate: "2026-07-11" });

  assert.equal(creditSettled.paymentStatus, "paid");
  assert.deepEqual(
    filterSupplierInvoices(
      [creditSettled, overdue, notYetDue],
      { ...DEFAULT_FILTERS, paymentStatus: "paid" },
      "2026-07-10",
    ).map((invoice) => invoice.id),
    [1],
  );
  assert.deepEqual(
    filterSupplierInvoices(
      [creditSettled, overdue, notYetDue],
      { ...DEFAULT_FILTERS, overdueOnly: true },
      "2026-07-10",
    ).map((invoice) => invoice.id),
    [2],
  );
});

test("full-result group totals remain independent from cursor presentation", () => {
  const invoices = Array.from({ length: 60 }, (_, index) =>
    makeInvoice(index + 1, {
      amount: 100_000,
      paidAmount: 20_000,
      creditAppliedAmount: 5_000,
    }),
  );
  const fullResultGroups = groupSupplierInvoices(
    invoices,
    "supplier",
    "2026-07-20",
  );
  const firstCursorPage = invoices.slice(0, 50);

  assert.equal(firstCursorPage.length, 50);
  assert.equal(fullResultGroups.length, 1);
  assert.equal(fullResultGroups[0]?.invoiceCount, 60);
  assert.equal(fullResultGroups[0]?.invoices.length, 60);
  assert.equal(fullResultGroups[0]?.totalAmount, 6_000_000);
  assert.equal(fullResultGroups[0]?.paidAmount, 1_200_000);
  assert.equal(fullResultGroups[0]?.creditAppliedAmount, 300_000);
  assert.equal(fullResultGroups[0]?.outstandingAmount, 4_500_000);

  const action = readWeb(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  assert.match(
    action,
    /groups: groupSupplierInvoices\(filtered, viewMode, today\)/,
  );
  assert.match(
    action,
    /const pageRows = afterCursor\.slice\(0, pageSize \+ 1\)/,
  );
  assert.doesNotMatch(action, /groupSupplierInvoices\(visibleRows/);
});

test("supplier invoice groups keep deterministic member ordering", () => {
  const unpaid = makeInvoice(1, {
    poId: 1,
    poCode: "PO-2026-0001",
    amount: 11_000,
  });
  const paid = makeInvoice(2, {
    poId: 1,
    poCode: "PO-2026-0001",
    amount: 165_000,
    paidAmount: 165_000,
    paymentStatus: "paid",
  });

  const [poGroup] = groupSupplierInvoices([paid, unpaid], "po", "2026-07-27");
  assert.equal(poGroup?.invoiceCount, 2);
  assert.deepEqual(
    poGroup?.invoices.map((invoice) => invoice.id),
    [1, 2],
  );
  assert.equal(poGroup?.primaryInvoice.id, 1);
});

test("Finance Supplier Invoice route owns filter state; Inventory redirects", () => {
  const financePage = readWeb(
    "app/(protected)/finance/supplier-invoices/page.tsx",
  );
  assert.match(financePage, /parseSupplierInvoiceListFilters\(params\)/);
  assert.match(financePage, /query: filters\.query/);
  assert.match(
    financePage,
    /supplierId: filters\.supplierId \?\? undefined/,
  );
  assert.match(financePage, /initialTotalCount=/);
  assert.match(financePage, /initialGroups=/);

  const inventoryPage = readWeb(
    "app/(protected)/inventory/supplier-invoices/page.tsx",
  );
  assert.match(inventoryPage, /redirect\(/);
  assert.match(inventoryPage, /\/finance\/supplier-invoices/);

  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  assert.match(client, /router\.replace\(/);
  assert.match(client, /replaceListParam\("q", normalized \|\| null\)/);
  assert.match(client, /allInvoiceGroups\.length,[\s\S]*totalCount/);
  assert.doesNotMatch(client, /const filteredInvoices/);
});

test("VAT-evidence blocker is filterable from the list, not only from the record", () => {
  const financePage = readWeb(
    "app/(protected)/finance/supplier-invoices/page.tsx",
  );
  const action = readWeb(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(financePage, /vatEvidence: filters\.vatEvidence \?\? undefined/);
  assert.match(
    action,
    /vatEvidence: z\.enum\(SUPPLIER_INVOICE_VAT_EVIDENCE_FILTERS\)/,
  );
  assert.match(action, /vatEvidence: vatEvidence \?\? null/);
  assert.match(
    client,
    /replaceListParam\("vat", showOnlyMissingVat \? null : "missing"\)/,
  );
  assert.match(client, /copy\.vatMissingGroupSummary\(group\.missingVatCount\)/);
  assert.match(client, /isSupplierInvoiceMissingVatEvidence\(invoice\)/);
});
