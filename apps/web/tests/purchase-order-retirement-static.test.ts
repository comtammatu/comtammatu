import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("purchase orders have no Branch or Office daily-use surface", () => {
  const operations = read(
    "apps/web/app/(protected)/inventory/operations/page.tsx",
  );
  const nav = read("packages/shared/src/auth/nav-config.ts");
  const inventoryNav = read(
    "apps/web/app/(protected)/inventory/_lib/inventory-nav.ts",
  );

  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/new/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/[id]/page.tsx",
  ]) {
    assert.equal(existsSync(resolve(repoRoot, path)), false);
  }
  assert.doesNotMatch(operations, /purchase-orders|PurchaseOrdersPageContent/);
  assert.doesNotMatch(nav, /stock\/purchase-orders|Đơn đặt hàng/);
  assert.doesNotMatch(inventoryNav, /inventory\/purchase-orders/);

  for (const path of [
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
    "apps/web/app/(protected)/inventory/purchase-orders/new/page.tsx",
    "apps/web/app/(protected)/inventory/purchase-orders/[id]/page.tsx",
  ]) {
    assert.match(read(path), /redirect\("\/inventory\/grn/);
  }
});

test("GRN source and actions are supplier-first without PO creation", () => {
  const sourceData = read("apps/web/lib/inventory/grn-source-data.ts");
  const branchSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/branch-grn-source-picker-client.tsx",
  );
  const officeSource = read(
    "apps/web/app/(protected)/inventory/grn/new/page.tsx",
  );
  const grnActions = read(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );
  const procurement = read(
    "apps/web/app/(protected)/inventory/procurement-actions.ts",
  );

  for (const source of [sourceData, branchSource, officeSource]) {
    assert.doesNotMatch(
      source,
      /openPurchaseOrders|fetchOpenPurchaseOrdersForReceiving|createGrnFromPo/,
    );
  }
  assert.doesNotMatch(grnActions, /createGrnFromPo|create_grn_from_po/);
  assert.doesNotMatch(procurement, /purchase-order-actions|PurchaseOrder/);
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
      ),
    ),
    false,
  );
});

test("historical PO references render as text and never reopen a retired route", () => {
  const grnList = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const grnDetail = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const supplierInvoices = read(
    "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );
  const dashboard = read(
    "apps/web/app/(protected)/inventory/dashboard-client.tsx",
  );

  assert.match(grnList, /<span className="font-mono">\{grn\.poCode\}<\/span>/);
  assert.match(grnDetail, /<span className="font-mono">\{grn\.poCode\}<\/span>/);
  assert.match(
    supplierInvoices,
    /<span className="font-mono">\s*\{selectedInvoice\.poCode\}\s*<\/span>/,
  );
  for (const source of [grnList, grnDetail, supplierInvoices, dashboard]) {
    assert.doesNotMatch(source, /\/inventory\/purchase-orders|stock\/purchase-orders/);
  }
});
