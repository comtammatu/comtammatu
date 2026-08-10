import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const financeClient =
  "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx";
const financeListUi =
  "app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx";
const financeModel =
  "app/(protected)/finance/supplier-invoices/supplier-invoice-list-model.ts";
const financeRow =
  "app/(protected)/finance/supplier-invoices/supplier-invoice-row.ts";
const inventoryRedirect =
  "app/(protected)/inventory/supplier-invoices/page.tsx";

function readFinanceInvoiceListModule(): string {
  return `${read(financeClient)}\n${read(financeListUi)}`;
}

test("Wave 2 supplier invoice client lives under Finance, not Inventory", () => {
  assert.equal(existsSync(join(process.cwd(), financeClient)), true);
  assert.equal(existsSync(join(process.cwd(), financeModel)), true);
  assert.equal(existsSync(join(process.cwd(), financeRow)), true);
  assert.equal(
    existsSync(
      join(
        process.cwd(),
        "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
      ),
    ),
    false,
  );

  const financePage = read(
    "app/(protected)/finance/supplier-invoices/page.tsx",
  );
  assert.match(financePage, /from "\.\/supplier-invoices-client"/);
  assert.doesNotMatch(financePage, /inventory\/supplier-invoices\/supplier-/);

  const redirectPage = read(inventoryRedirect);
  assert.match(redirectPage, /redirect\(/);
  assert.match(redirectPage, /\/finance\/supplier-invoices/);
});

test("Wave 2 stocktake list has no Drawer dual-path (completed in Wave 1A)", () => {
  const source = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  assert.doesNotMatch(source, /from "@comtammatu\/ui\/components\/drawer"/);
  assert.doesNotMatch(source, /<Drawer/);
  assert.doesNotMatch(source, /useLongPress/);
});

test("Wave 2 Inventory LIST clients do not import Popover as a record view", () => {
  const inventoryClients = [
    "app/(protected)/inventory/grn/grn-list-client.tsx",
    "app/(protected)/inventory/issues/issues-client.tsx",
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
    "app/(protected)/inventory/production/production-runs-client.tsx",
    "app/(protected)/inventory/suppliers/suppliers-client.tsx",
    "app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
  ];

  for (const path of inventoryClients) {
    const source = read(path);
    assert.doesNotMatch(
      source,
      /from "@comtammatu\/ui\/components\/popover"/,
      path,
    );
    assert.doesNotMatch(source, /<Popover[\s>]/, path);
  }

  const financeSource = readFinanceInvoiceListModule();
  assert.match(financeSource, /const filterPopover = \(\s*<Popover>/);
  assert.match(financeSource, /filters=\{[\s\S]*\{filterPopover\}[\s\S]*\}/);
});
