import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);
const migration = read(
  "supabase/migrations/20260907202220_slow_read_list_rpcs.sql",
);

test("DEFINER list RPCs authorize once and keep PostgREST policies", () => {
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.list_stock_on_hand/);
  assertSqlMatch(migration, /has_permission\(p_branch_id, 'inventory:read'\)/);
  assertSqlMatch(
    migration,
    /stock\.tenant_id = v_tenant[\s\S]*stock\.branch_id = p_branch_id/,
  );
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.list_stock_transfer_items/,
  );
  assertSqlMatch(migration, /inventory:transfer_create/);
  assertSqlMatch(migration, /inventory:transfer_ship/);
  assertSqlMatch(migration, /inventory:transfer_receive/);
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.list_inventory_count_slip_lines/,
  );
  assertSqlMatch(migration, /inventory:count_approve/);
  assertSqlMatch(
    migration,
    /idx_stock_levels_tenant_branch_location/,
  );

  const stockOnHand = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const transferActions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );
  const branchSlips = read("apps/web/lib/inventory/branch-count-slip-data.ts");
  const managementSlips = read(
    "apps/web/app/(protected)/inventory/count-slips/page.tsx",
  );

  assert.match(stockOnHand, /list_stock_on_hand/);
  assert.doesNotMatch(stockOnHand, /from\("stock_levels"\)[\s\S]*inventory_locations/);
  assert.match(transferActions, /list_stock_transfer_items/);
  assert.doesNotMatch(transferActions, /from\("stock_transfer_items"\)/);
  assert.match(branchSlips, /list_inventory_count_slip_lines/);
  assert.doesNotMatch(branchSlips, /from\("inventory_count_slip_lines"\)/);
  assert.match(managementSlips, /list_inventory_count_slip_lines/);
  assert.doesNotMatch(managementSlips, /from\("inventory_count_slip_lines"\)/);
});

test("finance home attention uses first-paint RPC; hub keeps full cockpit", () => {
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_finance_operating_first_paint/,
  );
  assertSqlMatch(migration, /get_revenue_kpis/);
  assertSqlNotMatch(migration, /get_finance_food_cost_recorded/);
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  assert.match(cockpit, /fetchOperatingFirstPaintRpc/);
  assert.match(cockpit, /get_finance_operating_first_paint/);
  assert.match(cockpit, /get_finance_operating_cockpit/);
  const attentionFn = cockpit.slice(
    cockpit.indexOf("export async function fetchFinanceAttentionExceptions"),
    cockpit.indexOf("export async function fetchFinanceCockpit"),
  );
  assert.match(attentionFn, /fetchOperatingFirstPaintRpc/);
  assert.doesNotMatch(attentionFn, /fetchOperatingCockpitRpc/);
});

test("close-day first paint is totals; detail RPC stays separate", () => {
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_branch_day_report_totals/,
  );
  const data = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/data.ts",
  );
  const detail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/close-day-report-detail.ts",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/close-day-client.tsx",
  );
  assert.match(data, /get_branch_day_report_totals/);
  assert.doesNotMatch(data, /rpc\("get_branch_day_report"/);
  assert.match(detail, /rpc\("get_branch_day_report"/);
  assert.match(client, /loadCloseDayReportDetail/);
});

test("Grab and Shopee item-status cache menu-limit availability at least 15s", () => {
  const cache = read("apps/web/lib/menu-limit-availability-cache.ts");
  const grab = read("apps/web/app/api/webhooks/grabfood/item-status/route.ts");
  const shopee = read(
    "apps/web/app/api/webhooks/shopeefood/item-status/route.ts",
  );
  const tax = read("apps/web/lib/tax-invoice-issue-worker.ts");
  assert.match(cache, /MENU_LIMIT_AVAILABILITY_CACHE_MS = 15_000/);
  assert.match(cache, /branch_menu_limit_availability/);
  assert.match(grab, /loadCachedBranchMenuLimitAvailability/);
  assert.match(shopee, /loadCachedBranchMenuLimitAvailability/);
  assert.match(tax, /claim_tax_invoice_issue_jobs/);
  assert.doesNotMatch(tax, /no queued|empty.queue|skip.*claim/i);
});
