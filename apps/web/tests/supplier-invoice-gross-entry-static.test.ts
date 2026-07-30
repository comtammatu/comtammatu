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
