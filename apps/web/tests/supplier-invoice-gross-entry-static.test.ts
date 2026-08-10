import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

test("supplier invoice lines expose a fixed NET-price entry set with additive VAT", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const copy = readWeb("lib/messages/inventory.ts");

  assert.doesNotMatch(
    client,
    /pricingMode: z\.enum\(\["gross_total", "unit_price"\]\)/,
  );
  assert.match(client, /unitPrice: optionalMoneySchema/);
  assert.match(client, /grossLineTotal: optionalMoneySchema/);
  assert.match(client, /resolveSupplierInvoiceVatAmount/);
  assert.match(client, /calculateSupplierInvoiceNetLineTotal/);
  assert.match(client, /calculateSupplierInvoiceGrossLineTotal/);
  assert.doesNotMatch(client, /deriveSupplierInvoiceGrossUnitPrice/);
  assert.doesNotMatch(copy, /pricingModes:/);
  assert.doesNotMatch(copy, /pricingModeLabel/);
  assert.match(copy, /unitPriceLabel/);
  assert.match(copy, /grossLineTotalLabel: "Tổng cộng \(đã gồm GTGT\)"/);
});

test("supplier invoice create payload derives additive VAT from the net line total", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(client, /netLineTotal,/);
  assert.match(client, /grossLineTotal,/);
  assert.match(client, /lineTotal: netLineTotal/);
  assert.doesNotMatch(client, /pricingMode: line\.pricingMode/);
  assert.doesNotMatch(client, /calculateVatAmount\(/);
  assert.doesNotMatch(client, /deriveSupplierInvoiceGrossUnitPrice/);
});

test("supplier invoice editor uses the document dialog without compressing line fields", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const formDialog = readWeb("app/components/form/form-dialog.tsx");

  assert.match(
    client,
    /<FormDialog[\s\S]*?variant="document"[\s\S]*?schema=\{supplierInvoiceSchema\}/,
  );
  assert.doesNotMatch(client, /contentClassName="sm:max-w-2xl"/);
  assert.match(client, /grid gap-3 md:grid-cols-2 xl:grid-cols-/);
  assert.match(formDialog, /variant\?: "default" \| "document"/);
  assert.match(
    formDialog,
    /<AppDialog[\s\S]*?variant=\{variant\}[\s\S]*?disablePointerDismissal=\{isPending\}/,
  );
});

test("supplier invoice line renders a fixed column set without a pricing-mode selector", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const lineEditor = client.slice(
    client.indexOf("invoiceLines.map"),
    client.indexOf("function SupplierPaymentFields"),
  );

  assert.doesNotMatch(lineEditor, /<Select\s+value=\{line\.pricingMode\}/);
  assert.doesNotMatch(lineEditor, /copy\.pricingModeLabel/);
  assert.match(
    lineEditor,
    /xl:grid-cols-\[minmax\(9rem,1fr\)_minmax\(7rem,1fr\)_7rem_minmax\(9rem,1fr\)_minmax\(9rem,1fr\)\]/,
  );
  assert.match(
    lineEditor,
    /netLineTotal = calculateSupplierInvoiceNetLineTotal/,
  );
  assert.match(
    lineEditor,
    /grossLineTotal: calculateSupplierInvoiceGrossLineTotal/,
  );
});
