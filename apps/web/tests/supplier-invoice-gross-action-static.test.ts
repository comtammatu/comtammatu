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

test("supplier invoice action validates additive-VAT line evidence", () => {
  assert.doesNotMatch(
    action,
    /pricingMode: z\.enum\(\["gross_total", "unit_price"\]\)/,
  );
  assert.match(action, /unitPrice: invoiceMoneySchema/);
  assert.match(action, /grossLineTotal: invoiceMoneySchema/);
  assert.match(action, /calculateSupplierInvoiceNetLineTotal/);
  assert.match(action, /calculateSupplierInvoiceGrossLineTotal/);
  assert.doesNotMatch(action, /deriveSupplierInvoiceGrossUnitPrice/);
  assert.match(action, /vatAmount[\s\S]*grossLineTotal/);
});

test("supplier invoice RPC payload persists net unit price and additive gross line total", () => {
  assert.doesNotMatch(action, /pricing_mode: line\.pricingMode/);
  assert.doesNotMatch(action, /gross_unit_price: line\.unitPrice/);
  assert.match(action, /unit_price: line\.unitPrice/);
  assert.match(action, /gross_line_total: line\.grossLineTotal/);
  assert.match(action, /line_total: line\.lineTotal/);
  assert.match(
    action,
    /supplier_invoice_lines \( id,[\s\S]*unit_price,[\s\S]*gross_line_total/,
  );
  assert.match(
    action,
    /calculateSupplierInvoiceNetLineTotal\(\s*line\.quantity,\s*line\.unitPrice,\s*"0\.00",?\s*\)/,
  );
  assert.doesNotMatch(
    action,
    /calculateSupplierInvoiceGrossLineTotal\(line\.lineTotal, "0\.00"\)/,
  );
  assert.doesNotMatch(action, /pricing_mode,/);
  assert.doesNotMatch(action, /gross_unit_price,/);
});

test("supplier invoice maps allocation overbill exceptions to remaining-received copy", () => {
  assert.match(
    action,
    /supplier_invoice_over_allocation[\s\S]*supplier_invoice_allocation_overbilled[\s\S]*Số lượng lập hóa đơn vượt số lượng thực nhận còn lại/,
  );
  assert.match(action, /supplier_invoice_allocation_grn_item_missing/);
  assert.match(action, /supplier_invoice_allocation_ingredient_mismatch/);
  assert.match(action, /supplier_invoice_allocations_invalid/);
  assert.match(action, /Không thể tạo hóa đơn NCC\./);
});
