import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSupplierInvoiceLineTotal,
  resolveSupplierInvoiceVatAmount,
  summarizeSupplierInvoiceMoney,
} from "../app/(protected)/finance/_lib/supplier-invoice-money";

test("supplier line total rounds quantity times unit price at the line boundary", () => {
  assert.equal(
    calculateSupplierInvoiceLineTotal("1.500", "12345.67", "0.00"),
    "18518.51",
  );
});

test("supplier VAT preserves manual document evidence until explicitly reset", () => {
  assert.equal(
    resolveSupplierInvoiceVatAmount("18518.51", 8, "auto", ""),
    "1481.48",
  );
  assert.equal(
    resolveSupplierInvoiceVatAmount("18518.51", 8, "manual", "1481.49"),
    "1481.49",
  );
});

test("supplier header totals cannot drift across many small lines", () => {
  const lines = Array.from({ length: 200 }, () => ({
    lineTotal: "0.01",
    vatAmount: "0.00",
  }));

  assert.deepEqual(summarizeSupplierInvoiceMoney(lines, "0.00"), {
    subtotal: "2.00",
    vatAmount: "0.00",
    totalAmount: "2.00",
  });
});

test("document discount is subtracted from canonical line totals", () => {
  assert.deepEqual(
    summarizeSupplierInvoiceMoney(
      [{ lineTotal: "18518.51", vatAmount: "1481.49" }],
      "0.01",
    ),
    {
      subtotal: "18518.51",
      vatAmount: "1481.49",
      totalAmount: "19999.99",
    },
  );
});
