import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("inventory landing queue names Yêu cầu hàng, Điều chuyển, and Chờ đơn giá", () => {
  const hub = read("app/(protected)/inventory/page.tsx");
  const counts = read("app/(protected)/inventory/_lib/receiving-counts.ts");
  const copy = read("lib/messages/inventory.ts");

  assert.match(copy, /attentionGrnPrice: "Chờ đơn giá"/);
  assert.match(copy, /attentionStockRequests: "Yêu cầu hàng đang mở"/);
  assert.match(copy, /attentionTransfers: "Điều chuyển đang giao"/);
  assert.doesNotMatch(copy, /attentionTransfers: "YCH đang mở"/);

  assert.match(hub, /countGrnsAwaitingUnitPrice/);
  assert.match(hub, /countOpenStockRequests/);
  assert.match(hub, /countOpenStockTransfers/);
  assert.match(hub, /\/inventory\/transfers\?work=request/);
  assert.match(hub, /\/inventory\/transfers\?work=dispatch/);

  assert.match(counts, /export async function countGrnsAwaitingUnitPrice/);
  assert.match(counts, /export async function countOpenStockTransfers/);
  assert.match(counts, /unit_cost_unit_id/);
});

test("purchase workspace chrome leads with đơn mua, not nhu cầu", () => {
  const page = read("app/(protected)/inventory/purchase-orders/page.tsx");
  const copy = read("lib/messages/inventory.ts");

  assert.match(page, /messages\.inventory\.po\.needsTab/);
  assert.match(page, /messages\.inventory\.po\.ordersTab/);
  assert.match(page, /workspaceDescription/);
  assert.doesNotMatch(page, /label: "Nhu cầu mua"/);
  assert.match(copy, /needsTab: "Yêu cầu mua"/);
  assert.match(
    copy,
    /workspaceDescription:\s*\n\s*"Đơn mua theo từng nhà cung cấp/,
  );
});
