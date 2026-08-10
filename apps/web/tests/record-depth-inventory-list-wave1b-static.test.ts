import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const FINANCE_INVOICE_LIST =
  "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx";
const FINANCE_INVOICE_LIST_UI =
  "app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx";

function readFinanceInvoiceListModule(): string {
  return `${read(FINANCE_INVOICE_LIST)}\n${read(FINANCE_INVOICE_LIST_UI)}`;
}

test("Wave 1 batch B ingredients wires three doors from getIngredientRowActions", () => {
  const source = read(
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );

  assert.match(source, /const getIngredientRowActions\s*=/);
  assert.match(source, /<RowActionsMenu/);
  assert.match(source, /renderRowContextMenu=\{/);
  assert.match(source, /RowActionsContextMenuItems\s+items=\{/);
  assert.match(source, /onRowClick=\{canManage \? openEdit : undefined\}/);
  assert.match(source, /key:\s*"edit"/);
  assert.match(source, /key:\s*"toggle-active"/);

  assert.doesNotMatch(
    source,
    /from "@comtammatu\/ui\/components\/dropdown-menu"/,
  );
  assert.doesNotMatch(source, /IconDots/);
  assert.doesNotMatch(source, /<DropdownMenu[\s>]/);
  assert.doesNotMatch(source, /DropdownMenuTrigger/);
});

test("Wave 1 batch B transfers hub is C4 zero-action with onRowClick detail path", () => {
  const source = read(
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );

  assert.match(source, /onRowClick=\{/);
  assert.doesNotMatch(source, /key:\s*"open"/);
  assert.doesNotMatch(source, /key:\s*"actions"/);
  assert.doesNotMatch(source, /<RowActionsMenu/);
  assert.doesNotMatch(source, /renderRowContextMenu/);
});

test("Wave 1 batch B production is C4 zero-action with onRowClick detail path", () => {
  const source = read(
    "app/(protected)/inventory/production/production-runs-client.tsx",
  );

  assert.match(source, /onRowClick=\{openProductionDetail\}/);
  assert.match(source, /router\.push\(detailHref\(row\)\)/);
  assert.match(
    source,
    /ProductionRunCard[\s\S]*render=\{<Link href=\{href\}/,
  );

  assert.doesNotMatch(source, /IconChevronRight/);
  assert.doesNotMatch(source, /<RowActionsMenu/);
  assert.doesNotMatch(source, /renderRowContextMenu/);
  assert.doesNotMatch(
    source,
    /key:\s*"production_number"[\s\S]{0,200}render=\{<Link/,
  );
});

test("Wave 1 batch B supplier invoices adds renderRowContextMenu from shared RowActionItem[]", () => {
  const source = readFinanceInvoiceListModule();

  assert.match(source, /const getSupplierInvoiceGroupRowActions\s*=/);
  assert.match(source, /<RowActionsMenu/);
  assert.match(source, /renderRowContextMenu=\{/);
  assert.match(
    source,
    /RowActionsContextMenuItems[\s\S]{0,120}getSupplierInvoiceGroupRowActions/,
  );
  assert.match(read(FINANCE_INVOICE_LIST), /onRowClick=\{/);
  assert.match(source, /key:\s*"view"/);
});
