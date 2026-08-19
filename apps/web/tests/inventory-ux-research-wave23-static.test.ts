import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory UX Research Waves 2–3 — production/stocktake gold bar, hub
 * attention + Kiểm kê nav, stock page twin, GRN→AP primary CTA.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Wave 2 production document overlay uses StatusBadge title and KPI strip", () => {
  const client = read(
    "app/(protected)/inventory/production/[id]/production-detail-client.tsx",
  );

  assert.match(
    client,
    /StatusBadge[\s\S]*domain="inventory"[\s\S]*value=\{run\.status\}/,
    "production dialog: code + StatusBadge",
  );
  assert.match(
    client,
    /variant="outline"[\s\S]*detailCopy\.kpiLines/,
    "production detail: KPI Item strip",
  );
});

test("Wave 2 stocktake DETAIL uses StatusBadge title and KPI strip", () => {
  const client = read(
    "app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  );

  assert.match(
    client,
    /StatusBadge[\s\S]*domain="inventory"[\s\S]*value=\{session\.status\}/,
    "stocktake: code + StatusBadge",
  );
  assert.match(
    client,
    /variant="outline"[\s\S]*stocktakeDetailCopy\.kpiLines/,
    "stocktake: KPI Item strip",
  );
});

test("Wave 2 hub attention deep-links and nav includes stocktake", () => {
  const hub = read("app/(protected)/inventory/page.tsx");
  const nav = read("app/(protected)/inventory/_lib/inventory-nav.ts");
  const counts = read("app/(protected)/inventory/_lib/receiving-counts.ts");

  assert.match(hub, /attentionTitle/, "hub: attention section");
  assert.match(hub, /countOpenGrns/, "hub: GRN attention count");
  assert.match(
    hub,
    /countPendingWasteApprovals/,
    "hub: waste approval attention",
  );
  assert.match(hub, /countOpenStockRequests/, "hub: stock-request attention");
  assert.match(hub, /countOpenStockTransfers/, "hub: transfer attention");
  assert.match(hub, /countGrnsAwaitingUnitPrice/, "hub: unit-price attention");
  assert.match(
    hub,
    /\/inventory\/waste\/approvals/,
    "hub: waste approvals deep-link",
  );
  assert.match(
    nav,
    /href:\s*"\/inventory\/stocktake"/,
    "nav: Kiểm kê entry",
  );
  assert.match(
    counts,
    /export async function countPendingWasteApprovals/,
    "counts: waste helper",
  );
});

test("Wave 3 stock overlay mirrors KPI strip and StatusBadge", () => {
  const page = read(
    "app/(protected)/inventory/stock/stock-detail-dialog.tsx",
  );

  assert.match(
    page,
    /StatusBadge[\s\S]*domain="inventory"[\s\S]*value=\{status\}/,
    "stock overlay: StatusBadge in title",
  );
  assert.match(
    page,
    /variant="outline"[\s\S]*stockCopy\.table\.currentStock/,
    "stock overlay: KPI Item strip",
  );
  assert.match(page, /stockCopy\.table\.threshold/, "stock overlay: threshold KPI");
});

test("Wave 3 GRN invoice CTA is primary when pending invoice", () => {
  const client = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );

  assert.match(
    client,
    /valuationKind === "pending_invoice" \? "default" : "outline"/,
    "GRN footer: primary invoice CTA when pending",
  );
});

test("Wave 3 waste create stays DocumentFormFrame (no densify needed)", () => {
  const client = read(
    "app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );
  assert.match(client, /DocumentFormFrame/, "waste create already dense DOC");
});
