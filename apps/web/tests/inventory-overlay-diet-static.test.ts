import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("stock overlay first viewport is qty, not WAC, with one primary CTA", () => {
  const source = read(
    "app/(protected)/inventory/stock/stock-detail-dialog.tsx",
  );
  const kpiStart = source.indexOf('className="grid grid-cols-3 gap-4 p-4 text-xs"');
  assert.ok(kpiStart >= 0, "qty KPI strip");
  const kpi = source.slice(kpiStart, source.indexOf("</Item>", kpiStart));
  assert.match(kpi, /stockCopy\.table\.currentStock/);
  assert.match(kpi, /stockCopy\.table\.threshold/);
  assert.match(kpi, /stockCopy\.table\.lastCount/);
  assert.doesNotMatch(kpi, /stockCopy\.table\.wac/);
  assert.doesNotMatch(kpi, /stockCopy\.table\.stockValue/);
  assert.doesNotMatch(kpi, /formatVND/);
  assert.doesNotMatch(source, /lg:grid-cols-5/);
  assert.match(source, /detailCopy\.tabValuation/);
  assert.match(source, /detailCopy\.tabMovements/);
  assert.match(source, /<Tabs/);
  assert.match(source, /RowActionsMenu/);
  assert.match(source, /onQuickIssue \?/);
});

test("stock overlay hides the valuation pane when monetary access is absent", () => {
  const source = read(
    "app/(protected)/inventory/stock/stock-detail-dialog.tsx",
  );
  assert.match(source, /showValuation = detailData\?\.valuation != null/);
  assert.match(source, /showValuation \?/);
  assert.match(source, /<Collapsible>/);
});

test("GRN overlay document tab drops valuation KPI and uses one dialog primary", () => {
  const source = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  assert.doesNotMatch(
    source,
    /grnMessages\.kpiValuation/,
    "valuation KPI stays off the first strip",
  );
  assert.match(source, /presentation === "dialog"/);
  assert.match(source, /dialogFooter/);
  assert.match(source, /invoiceIsPrimary/);
  assert.match(source, /RowActionsMenu items=\{dialogOverflowItems\}/);
  assert.match(source, /footer=\{dialogFooter\}/);
  assert.match(
    source,
    /valuationKind === "pending_invoice" \? "default" : "outline"/,
    "page footer keeps pending-invoice primary pin",
  );
});

test("PO overlay keeps lines first and linked GRNs behind a tab", () => {
  const source = read(
    "app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  assert.match(source, /<Tabs defaultValue="lines">/);
  assert.match(source, /TabsTrigger value="receipts"/);
  assert.match(source, /copy\.detail\.linkedGrnsTitle/);
  assert.match(source, /documentOverflowActions/);
  assert.doesNotMatch(source, /lg:grid-cols-5/);
  assert.doesNotMatch(
    source,
    /copy\.detail\.kpiReceipts/,
    "receipt count is not on the first KPI strip",
  );
});

test("inventory hub attention is a queue of Items, not Badge chips", () => {
  const hub = read("app/(protected)/inventory/page.tsx");
  assert.match(hub, /attentionTitle/);
  assert.match(hub, /ItemGroup/);
  assert.match(hub, /formatCount\(item\.count\)/);
  assert.doesNotMatch(
    hub,
    /variant="warning"[\s\S]*render=\{<Link href=\{item\.href\}/,
  );
  assert.match(hub, /group\.title\.includes\("Danh mục"\)/);
  assert.match(hub, /resolveInventoryNav/);
});
