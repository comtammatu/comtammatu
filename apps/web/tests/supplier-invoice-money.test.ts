import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSupplierInvoiceGrossLineTotal,
  calculateSupplierInvoiceNetLineTotal,
  calculateSupplierInvoiceVatFromGross,
  deriveSupplierInvoiceGrossUnitPrice,
  resolveSupplierInvoiceVatAmount,
  summarizeSupplierInvoiceMoney,
} from "../app/(protected)/finance/_lib/supplier-invoice-money";

test("supplier gross line total rounds quantity times VAT-inclusive unit price", () => {
  assert.equal(
    calculateSupplierInvoiceGrossLineTotal("1.500", "12345.67", "0.00"),
    "18518.51",
  );
});

test("supplier VAT reverses from a VAT-inclusive gross line", () => {
  assert.equal(
    calculateSupplierInvoiceVatFromGross("600000.00", 8),
    "44444.44",
  );
});

test("manual supplier VAT keeps gross fixed and changes the pre-VAT amount", () => {
  assert.equal(
    calculateSupplierInvoiceNetLineTotal("600000.00", "44444.00"),
    "555556.00",
  );
  assert.equal(
    resolveSupplierInvoiceVatAmount("600000.00", 8, "manual", "44444.00"),
    "44444.00",
  );
});

test("gross-total mode derives a unit price without changing the source total", () => {
  assert.equal(
    deriveSupplierInvoiceGrossUnitPrice("3.000", "100000.00", "0.00"),
    "33333.33",
  );
});

test("supplier header totals cannot drift across many small lines", () => {
  const lines = Array.from({ length: 200 }, () => ({
    grossLineTotal: "0.01",
    netLineTotal: "0.01",
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
      [
        {
          grossLineTotal: "20000.00",
          netLineTotal: "18518.51",
          vatAmount: "1481.49",
        },
      ],
      "0.01",
    ),
    {
      subtotal: "18518.51",
      vatAmount: "1481.49",
      totalAmount: "19999.99",
    },
  );
});

test("supplier header never adds VAT twice", () => {
  assert.deepEqual(
    summarizeSupplierInvoiceMoney(
      [
        {
          grossLineTotal: "600000.00",
          netLineTotal: "555556.00",
          vatAmount: "44444.00",
        },
      ],
      "0.00",
    ),
    {
      subtotal: "555556.00",
      vatAmount: "44444.00",
      totalAmount: "600000.00",
    },
  );
});
