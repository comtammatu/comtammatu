import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function activeMigrationNamed(suffix: string): { name: string; sql: string } {
  const names = readdirSync(migrationsDir).filter((name) =>
    name.endsWith(suffix),
  );
  assert.equal(names.length, 1, `expected one active ${suffix} migration`);
  return {
    name: names[0]!,
    sql: read(`supabase/migrations/${names[0]!}`),
  };
}

function walkTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walkTsFiles(path);
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function appQueryOffenders(table: string): string[] {
  const pattern = new RegExp(
    String.raw`\.from\(\s*["']${table}["']|\.rpc\(\s*["']${table}["']|purchase_requests!`,
  );
  const roots = [
    join(repoRoot, "apps/web/app"),
    join(repoRoot, "apps/web/lib"),
    join(repoRoot, "apps/print-agent"),
  ];
  return roots.flatMap((root) =>
    walkTsFiles(root)
      .filter((path) => pattern.test(readFileSync(path, "utf8")))
      .map((path) => relative(repoRoot, path).replaceAll("\\", "/")),
  );
}

test("Wave 5 drops YCM/YCH request tables after soak and rewrites live PO/GRN RPCs", () => {
  const { name, sql } = activeMigrationNamed(
    "_drop_ycm_ych_request_tables.sql",
  );
  assert.match(name, /^20260903\d{6}_drop_ycm_ych_request_tables\.sql$/);
  assert.ok(
    name > "20260903014353_include_branch_kitchen_in_inventory_value_period.sql",
    "Wave 5 forward must sort after the latest local forward",
  );

  for (const fn of [
    "public.cancel_purchase_request(bigint, text)",
    "public.close_purchase_request(bigint, text)",
    "public.cancel_stock_request(bigint, text)",
    "public.close_stock_request(bigint, text)",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION ${fn.replace(/[()]/g, "\\$&")}[\\s\\S]*?FROM PUBLIC, anon, authenticated`,
      ),
      `must revoke authenticated EXECUTE on ${fn}`,
    );
    assert.match(
      sql,
      new RegExp(`DROP FUNCTION IF EXISTS ${fn.replace(/[()]/g, "\\$&")}`),
      `must drop ${fn}`,
    );
  }

  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.save_purchase_demand\(bigint, bigint, date, text, jsonb, boolean, uuid\)/,
  );
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.save_stock_request\(bigint, bigint, timestamp with time zone, text, jsonb, boolean, uuid\)/,
  );
  assert.match(
    sql,
    /ALTER TABLE ONLY public\.purchase_orders[\s\S]*DROP CONSTRAINT IF EXISTS purchase_orders_purchase_request_tenant_fkey/,
  );
  assert.match(
    sql,
    /ALTER TABLE ONLY public\.purchase_order_items[\s\S]*DROP CONSTRAINT IF EXISTS purchase_order_items_request_item_tenant_fkey/,
  );
  assert.match(
    sql,
    /ALTER TABLE ONLY public\.stock_transfers[\s\S]*DROP CONSTRAINT IF EXISTS stock_transfers_request_tenant_fkey/,
  );

  const dropOrder = [
    "public.purchase_request_allocations",
    "public.purchase_request_items",
    "public.purchase_requests",
    "public.stock_request_items",
    "public.stock_requests",
  ];
  let lastIndex = -1;
  for (const table of dropOrder) {
    const index = sql.indexOf(`DROP TABLE IF EXISTS ${table}`);
    assert.ok(index >= 0, `must drop ${table}`);
    assert.ok(index > lastIndex, `${table} must drop after its children`);
    lastIndex = index;
  }

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.cancel_purchase_order/,
  );
  const cancelBody =
    sql.split(/CREATE OR REPLACE FUNCTION public\.cancel_purchase_order/)[1]
      ?.split(/CREATE OR REPLACE FUNCTION public\./)[0] ?? "";
  assert.doesNotMatch(
    cancelBody,
    /purchase_request_allocations|recompute_purchase_request_status/,
  );
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.list_goods_receipt_notes/,
  );
  assert.doesNotMatch(
    sql.split(/CREATE OR REPLACE FUNCTION public\.list_goods_receipt_notes/)[1] ??
      "",
    /JOIN public\.purchase_requests/,
  );
  assert.doesNotMatch(sql, /pos:close_shift_variance_override/);
});

test("Wave 5 app no longer queries dropped request tables", () => {
  assert.deepEqual(appQueryOffenders("purchase_requests"), []);
  assert.deepEqual(appQueryOffenders("purchase_request_items"), []);
  assert.deepEqual(appQueryOffenders("purchase_request_allocations"), []);
  assert.deepEqual(appQueryOffenders("stock_requests"), []);
  assert.deepEqual(appQueryOffenders("stock_request_items"), []);

  const runtime = read("apps/web/app/_hooks/branch-ops-runtime.ts");
  assert.doesNotMatch(runtime, /"purchase_requests"/);
  assert.doesNotMatch(runtime, /"stock_requests"/);

  const ordersPage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  assert.doesNotMatch(ordersPage, /loadPurchaseDemandRows/);
  assert.doesNotMatch(ordersPage, /PurchaseRequestsClient/);
  assert.doesNotMatch(ordersPage, /needsTab/);
  assert.match(ordersPage, /loadPurchaseOrderRows/);

  const demandShim = read(
    "apps/web/app/(protected)/inventory/purchase-requests/page.tsx",
  );
  assert.match(demandShim, /redirect\(PURCHASE_ORDER_CREATE_HREF\)/);
  assert.match(demandShim, /redirect\(["'`]\/inventory\/purchase-orders/);
  assert.doesNotMatch(demandShim, /tab", "needs"/);

  const branchDemand = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/page.tsx",
  );
  assert.match(branchDemand, /redirect\(/);
  assert.doesNotMatch(branchDemand, /loadPurchaseDemandRows/);

  const ychDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/[id]/page.tsx",
  );
  assert.match(ychDetail, /redirect\(/);
  assert.doesNotMatch(ychDetail, /loadStockRequestDetail/);

  const fulfillment = read("apps/web/lib/inventory/stock-fulfillment-data.ts");
  assert.doesNotMatch(fulfillment, /from\("stock_requests"\)/);
  assert.doesNotMatch(fulfillment, /from\("stock_request_items"\)/);
  assert.match(fulfillment, /from\("stock_transfers"\)/);

  const counts = read(
    "apps/web/app/(protected)/inventory/_lib/receiving-counts.ts",
  );
  assert.doesNotMatch(counts, /from\("purchase_requests"\)/);
  assert.doesNotMatch(counts, /from\("stock_requests"\)/);

  const home = read("apps/web/app/(protected)/inventory/page.tsx");
  assert.doesNotMatch(home, /countOpenStockRequests/);
  assert.match(home, /countOpenStockTransfers/);

  const attention = read("apps/web/app/_lib/control-home-attention.ts");
  assert.doesNotMatch(attention, /countOpenPurchaseRequests/);

  const grnActions = read(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );
  assert.doesNotMatch(
    grnActions,
    /purchase_orders_purchase_request_tenant_fkey/,
  );
  assert.doesNotMatch(grnActions, /purchase_requests!/);
});
