import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory UX Research Wave 1 — density parity for Giao nhận, demand dialogs,
 * and issue DETAIL (KPI strip + code/status chrome).
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Giao nhận hub exposes list meta KPIs and document status chrome", () => {
  const page = read("app/(protected)/inventory/transfers/page.tsx");
  const hub = read(
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );
  const transfer = read(
    "app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );
  const request = read("app/components/stock-request-detail-view.tsx");

  assert.match(page, /listMetaActive/, "transfers page: active meta KPI");
  assert.match(page, /listMetaCompleted/, "transfers page: completed meta KPI");
  assert.match(page, /listMetaTotal/, "transfers page: total meta KPI");
  assert.match(
    hub,
    /StatusBadge[\s\S]*domain="inventory"/,
    "hub dialog: transfer StatusBadge in title",
  );
  assert.match(
    transfer,
    /variant="outline"[\s\S]*copy\.kpiLines/,
    "transfer detail: KPI Item strip",
  );
  assert.match(
    transfer,
    /StatusBadge[\s\S]*domain="inventory"[\s\S]*value=\{transfer\.status\}/,
    "transfer page title: code + StatusBadge",
  );
  assert.match(
    request,
    /variant="outline"[\s\S]*copy\.kpiLines/,
    "YCH detail: KPI Item strip",
  );
});

test("Demand view/allocate dialogs lead with KPI strip and status badge title", () => {
  const view = read(
    "app/(protected)/inventory/purchase-requests/purchase-request-view-dialog.tsx",
  );
  const allocate = read(
    "app/(protected)/inventory/purchase-requests/purchase-request-allocate-dialog.tsx",
  );

  assert.match(
    view,
    /purchaseRequestStatusVariant\(selected\.status\)/,
    "view dialog: status badge in title",
  );
  assert.match(
    view,
    /variant="outline"[\s\S]*detailCopy\.kpiLines/,
    "view dialog: KPI Item strip",
  );
  assert.match(
    view,
    /detailCopy\.sectionLineCount/,
    "view dialog: section line count",
  );
  assert.match(
    allocate,
    /purchaseRequestStatusVariant\(selected\.status\)/,
    "allocate dialog: status badge in title",
  );
  assert.match(
    allocate,
    /variant="outline"[\s\S]*detailCopy\.kpiLines/,
    "allocate dialog: KPI Item strip",
  );
  assert.match(
    allocate,
    /copy\.addAllocationLine/,
    "allocate dialog: add allocation row",
  );
  assert.match(
    allocate,
    /onAddAllocationRow/,
    "allocate dialog: add allocation handler",
  );
});

test("Issue DETAIL leads with KPI strip and StatusBadge title", () => {
  const client = read(
    "app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );

  assert.match(
    client,
    /variant="outline"[\s\S]*ISSUES_VI\.kpiLines/,
    "issue detail: KPI Item strip",
  );
  assert.match(
    client,
    /StatusBadge[\s\S]*domain="inventory"[\s\S]*value=\{statusValue\}/,
    "issue detail: code + StatusBadge title",
  );
  assert.match(
    client,
    /ISSUES_VI\.sectionLineCount\(lines\.length\)/,
    "issue detail: section line count",
  );
});
