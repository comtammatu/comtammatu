import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  filterSupplierInvoices,
  groupSupplierInvoices,
  hasSupplierInvoiceListFilters,
  parseSupplierInvoiceListFilters,
  type SupplierInvoiceListFilters,
} from "../app/(protected)/inventory/supplier-invoices/supplier-invoice-list-model";
import {
  mapSupplierInvoiceRow,
  type SupplierInvoiceRow,
} from "../app/(protected)/inventory/supplier-invoices/supplier-invoice-row";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const DEFAULT_FILTERS: SupplierInvoiceListFilters = {
  query: "",
  supplierId: null,
  matchStatus: null,
  paymentStatus: null,
  overdueOnly: false,
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
    code: `INV-${String(id).padStart(3, "0")}`,
    supplierName: "NCC A",
    grnCode: `GRN-${String(id).padStart(3, "0")}`,
    poCode: null,
    matchStatus: "matched",
    paymentStatus: "unpaid",
    amount: 100_000,
    paidAmount: 0,
    creditAppliedAmount: 0,
    variance: null,
    invoiceDate: `2026-07-${String((id % 28) + 1).padStart(2, "0")}`,
    dueDate: "2026-07-10",
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
    view: "po",
  });

  assert.deepEqual(parsed, {
    query: "NCC",
    supplierId: 42,
    matchStatus: "discrepancy",
    paymentStatus: "partial",
    overdueOnly: true,
    viewMode: "po",
  });
  assert.equal(hasSupplierInvoiceListFilters(parsed), true);

  assert.deepEqual(
    parseSupplierInvoiceListFilters({
      supplierId: "-1",
      matchStatus: "unknown",
      paymentStatus: "unknown",
      overdue: "true",
      view: "unknown",
    }),
    DEFAULT_FILTERS,
  );
});

test("server-owned search finds an invoice beyond the first cursor page", () => {
  const invoices = Array.from({ length: 60 }, (_, index) =>
    makeInvoice(index + 1),
  );
  invoices[59] = makeInvoice(60, {
    code: "UNLOADED-MATCH",
    supplierName: "NCC Cuối danh sách",
  });

  const matches = filterSupplierInvoices(invoices, {
    ...DEFAULT_FILTERS,
    query: "unloaded",
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
    invoice_number: "CREDIT-PAID",
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
  assert.equal(fullResultGroups[0]?.totalAmount, 6_000_000);
  assert.equal(fullResultGroups[0]?.paidAmount, 1_200_000);
  assert.equal(fullResultGroups[0]?.creditAppliedAmount, 300_000);
  assert.equal(fullResultGroups[0]?.outstandingAmount, 4_500_000);

  const action = readWeb(
    "app/(protected)/inventory/supplier-invoice-actions.ts",
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

test("both Supplier Invoice route pages own filter state from searchParams", () => {
  for (const path of [
    "app/(protected)/inventory/supplier-invoices/page.tsx",
    "app/(protected)/finance/supplier-invoices/page.tsx",
  ]) {
    const source = readWeb(path);
    assert.match(source, /parseSupplierInvoiceListFilters\(params\)/, path);
    assert.match(source, /query: filters\.query/, path);
    assert.match(
      source,
      /supplierId: filters\.supplierId \?\? undefined/,
      path,
    );
    assert.match(source, /initialTotalCount=/, path);
    assert.match(source, /initialGroups=/, path);
  }

  const client = readWeb(
    "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );
  assert.match(client, /router\.replace\(/);
  assert.match(client, /replaceListParam\("q", normalized \|\| null\)/);
  assert.match(client, /allInvoiceGroups\.length,[\s\S]*totalCount/);
  assert.doesNotMatch(client, /const filteredInvoices/);
});
