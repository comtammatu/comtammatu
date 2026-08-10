import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  readSupplierInvoiceFormModules,
  readSupplierInvoiceModules,
  readSupplierInvoiceShell,
} from "./helpers/supplier-invoice-module-sources";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

test("supplier invoice lines expose a fixed NET-price entry set with additive VAT", () => {
  const modules = readSupplierInvoiceModules();
  const copy = readWeb("lib/messages/inventory.ts");

  assert.doesNotMatch(
    modules,
    /pricingMode: z\.enum\(\["gross_total", "unit_price"\]\)/,
  );
  assert.match(modules, /unitPrice: optionalMoneySchema/);
  assert.match(modules, /grossLineTotal: optionalMoneySchema/);
  assert.match(modules, /resolveSupplierInvoiceVatAmount/);
  assert.match(modules, /calculateSupplierInvoiceNetLineTotal/);
  assert.match(modules, /calculateSupplierInvoiceGrossLineTotal/);
  assert.doesNotMatch(modules, /deriveSupplierInvoiceGrossUnitPrice/);
  assert.doesNotMatch(copy, /pricingModes:/);
  assert.doesNotMatch(copy, /pricingModeLabel/);
  assert.match(copy, /unitPriceLabel/);
  assert.match(copy, /grossLineTotalLabel: "Tổng cộng \(đã gồm GTGT\)"/);
});

test("supplier invoice create payload derives additive VAT from the net line total", () => {
  const client = readSupplierInvoiceShell();

  assert.match(client, /netLineTotal,/);
  assert.match(client, /grossLineTotal,/);
  assert.match(client, /lineTotal: netLineTotal/);
  assert.doesNotMatch(client, /pricingMode: line\.pricingMode/);
  assert.doesNotMatch(client, /calculateVatAmount\(/);
  assert.doesNotMatch(client, /deriveSupplierInvoiceGrossUnitPrice/);
});

test("supplier invoice editor uses the document dialog without compressing line fields", () => {
  const formModules = readSupplierInvoiceFormModules();
  const formDialog = readWeb("app/components/form/form-dialog.tsx");

  assert.match(
    formModules,
    /<FormDialog[\s\S]*?variant="document"[\s\S]*?schema=\{supplierInvoiceSchema\}/,
  );
  assert.doesNotMatch(formModules, /contentClassName="sm:max-w-2xl"/);
  assert.match(formModules, /grid gap-3 md:grid-cols-2 xl:grid-cols-/);
  assert.match(formDialog, /variant\?: "default" \| "document"/);
  assert.match(
    formDialog,
    /<AppDialog[\s\S]*?variant=\{variant\}[\s\S]*?disablePointerDismissal=\{isPending\}/,
  );
});

test("supplier invoice line renders a fixed column set without a pricing-mode selector", () => {
  const createFields = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-create-fields.tsx",
  );
  const lineEditor = createFields.slice(
    createFields.indexOf("invoiceLines.map"),
    createFields.indexOf("function SupplierPaymentFields"),
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
