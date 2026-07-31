import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

test("supplier invoice lines expose gross-total and unit-price entry modes", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const copy = readWeb("lib/messages/inventory.ts");

  assert.match(
    client,
    /pricingMode: z\.enum\(\["gross_total", "unit_price"\]\)/,
  );
  assert.match(client, /grossLineTotal: optionalMoneySchema/);
  assert.match(client, /resolveSupplierInvoiceVatAmount/);
  assert.match(client, /calculateSupplierInvoiceNetLineTotal/);
  assert.match(client, /deriveSupplierInvoiceGrossUnitPrice/);
  assert.match(copy, /pricingModes:/);
  assert.match(copy, /grossTotal: "Nhập theo tổng giá"/);
  assert.match(copy, /unitPrice: "Nhập theo đơn giá"/);
});

test("supplier invoice create payload preserves gross and net line evidence", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(client, /pricingMode: line\.pricingMode/);
  assert.match(client, /grossLineTotal,/);
  assert.match(client, /lineTotal: netLineTotal/);
  assert.doesNotMatch(client, /calculateVatAmount\(/);
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
  assert.doesNotMatch(client, /lg:grid-cols-5/);
  assert.match(client, /grid gap-3 md:grid-cols-2 xl:grid-cols-/);
  assert.match(formDialog, /variant\?: "default" \| "document"/);
  assert.match(
    formDialog,
    /<AppDialog[\s\S]*?variant=\{variant\}[\s\S]*?disablePointerDismissal=\{isPending\}/,
  );
});

test("supplier invoice line uses an explicit pricing mode and derives the other value", () => {
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
  const lineEditor = client.slice(
    client.indexOf("invoiceLines.map"),
    client.indexOf("function SupplierPaymentFields"),
  );

  assert.match(lineEditor, /<Select\s+value=\{line\.pricingMode\}/);
  assert.doesNotMatch(
    lineEditor,
    /readOnly=\{line\.pricingMode === "(?:gross_total|unit_price)"\}/,
  );
  assert.match(
    lineEditor,
    /unitPrice: value,\s+pricingMode: "unit_price",\s+grossLineTotal,/,
  );
  assert.match(
    lineEditor,
    /grossLineTotal: value,\s+unitPrice: deriveSupplierInvoiceGrossUnitPrice/,
  );
  assert.match(
    lineEditor,
    /xl:grid-cols-\[minmax\(9rem,1fr\)_minmax\(9rem,1fr\)_7rem_minmax\(9rem,1fr\)\]/,
  );
});
