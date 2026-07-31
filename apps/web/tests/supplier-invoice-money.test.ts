import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSupplierInvoiceGrossLineTotal,
  calculateSupplierInvoiceNetLineTotal,
  calculateSupplierInvoiceVatFromNet,
  resolveSupplierInvoiceVatAmount,
  summarizeSupplierInvoiceMoney,
} from "../app/(protected)/finance/_lib/supplier-invoice-money";

test("supplier net line total rounds quantity times NET unit price minus discount", () => {
  assert.equal(
    calculateSupplierInvoiceNetLineTotal("2.000", "25000.00", "0.00"),
    "50000.00",
  );
  assert.equal(
    calculateSupplierInvoiceNetLineTotal("1.500", "12345.67", "0.00"),
    "18518.51",
  );
  assert.equal(
    calculateSupplierInvoiceNetLineTotal("2.000", "25000.00", "500.00"),
    "49500.00",
  );
});

test("supplier VAT adds forward from the net line total", () => {
  assert.equal(calculateSupplierInvoiceVatFromNet("50000.00", 8), "4000.00");
  assert.equal(calculateSupplierInvoiceVatFromNet("18518.51", 8), "1481.48");
  assert.equal(calculateSupplierInvoiceVatFromNet("600000.00", 0), "0.00");
});

test("supplier gross line total equals net plus VAT", () => {
  assert.equal(
    calculateSupplierInvoiceGrossLineTotal("50000.00", "4000.00"),
    "54000.00",
  );
});

test("manual supplier VAT keeps the net total fixed and changes only the gross", () => {
  assert.equal(
    resolveSupplierInvoiceVatAmount("600000.00", 8, "manual", "44444.00"),
    "44444.00",
  );
  assert.equal(
    calculateSupplierInvoiceGrossLineTotal("600000.00", "44444.00"),
    "644444.00",
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

test("document discount is subtracted from canonical gross line totals", () => {
  assert.deepEqual(
    summarizeSupplierInvoiceMoney(
      [
        {
          grossLineTotal: "21600.00",
          netLineTotal: "20000.00",
          vatAmount: "1600.00",
        },
      ],
      "0.01",
    ),
    {
      subtotal: "20000.00",
      vatAmount: "1600.00",
      totalAmount: "21599.99",
    },
  );
});

test("supplier header never adds VAT twice when summarizing additive lines", () => {
  assert.deepEqual(
    summarizeSupplierInvoiceMoney(
      [
        {
          grossLineTotal: "540000.00",
          netLineTotal: "500000.00",
          vatAmount: "40000.00",
        },
      ],
      "0.00",
    ),
    {
      subtotal: "500000.00",
      vatAmount: "40000.00",
      totalAmount: "540000.00",
    },
  );
});
