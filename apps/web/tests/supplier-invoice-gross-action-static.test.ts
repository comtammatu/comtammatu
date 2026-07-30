import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const action = readFileSync(
  resolve(
    import.meta.dirname,
    "../app/(protected)/finance/supplier-invoice-actions.ts",
  ),
  "utf8",
);

test("supplier invoice action validates gross-inclusive line evidence", () => {
  assert.match(
    action,
    /pricingMode: z\.enum\(\["gross_total", "unit_price"\]\)/,
  );
  assert.match(action, /grossLineTotal: invoiceMoneySchema/);
  assert.match(action, /calculateSupplierInvoiceGrossLineTotal/);
  assert.match(action, /deriveSupplierInvoiceGrossUnitPrice/);
  assert.match(action, /calculateSupplierInvoiceNetLineTotal/);
  assert.match(action, /vatAmount[\s\S]*grossLineTotal/);
});

test("supplier invoice RPC payload persists gross source and net line total", () => {
  assert.match(action, /pricing_mode: line\.pricingMode/);
  assert.match(action, /gross_unit_price: line\.unitPrice/);
  assert.match(action, /gross_line_total: line\.grossLineTotal/);
  assert.match(action, /line_total: line\.lineTotal/);
  assert.match(
    action,
    /supplier_invoice_lines \( id,[\s\S]*pricing_mode,[\s\S]*gross_line_total/,
  );
});
