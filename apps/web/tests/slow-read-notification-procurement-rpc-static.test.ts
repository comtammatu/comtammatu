import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);
const migration = read(
  "supabase/migrations/20260908012613_slow_read_notification_procurement_rpcs.sql",
);

test("badge by_target is DEFINER and matches total unread visibility", () => {
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.count_unread_notifications_by_target/,
  );
  assertSqlMatch(migration, /SECURITY DEFINER/);
  assertSqlMatch(
    migration,
    /notification\.target_roles @> ARRAY\[ctx\.user_role\]::text\[\]/,
  );
  assertSqlMatch(
    migration,
    /notification\.target_branch_id = ctx\.branch_id/,
  );
  assertSqlMatch(migration, /ctx\.user_role IN \('owner'\)/);
  assertSqlMatch(
    migration,
    /notification_read\.user_id = ctx\.user_id/,
  );
  assertSqlMatch(
    migration,
    /REVOKE ALL ON FUNCTION public\.count_unread_notifications_by_target\(\) FROM anon/,
  );
});

test("supplier list, GRN lines, allocations, and transfers use DEFINER RPCs", () => {
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.list_suppliers_with_item_counts/,
  );
  assertSqlMatch(migration, /has_permission_any\('procurement:read'\)/);
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.list_grn_receive_lines/,
  );
  assertSqlMatch(migration, /ORDER BY line\.grn_id ASC, line\.id ASC/);
  assertSqlMatch(migration, /LIMIT v_limit\s+OFFSET v_offset/);
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.list_receipt_allocations_for_grns/,
  );
  assertSqlMatch(
    migration,
    /can_read_inventory_monetary\('procurement:price_list_read'\)/,
  );
  assertSqlMatch(
    migration,
    /has_permission\(branch\.id, 'procurement:read'\)/,
  );
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.list_stock_transfers_for_branch/,
  );
  assertSqlMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.count_open_stock_transfers/,
  );
  assertSqlMatch(migration, /from_branch_id = p_branch_id/);
  assertSqlMatch(migration, /to_branch_id = p_branch_id/);
  assertSqlMatch(
    migration,
    /has_permission\(branch\.id, 'inventory:read'\)/,
  );
  assert.doesNotMatch(migration, /inventory:request_fulfill/);
  assertSqlMatch(
    migration,
    /from_branch_id IN \(SELECT readable\.id FROM readable\)/,
  );

  const suppliers = read(
    "apps/web/app/(protected)/inventory/supplier-actions.ts",
  );
  const workspace = read("apps/web/lib/inventory/load-purchase-workspace.ts");
  const grnActions = read(
    "apps/web/app/(protected)/inventory/grn-actions.ts",
  );
  const transfers = read("apps/web/lib/inventory/stock-fulfillment-data.ts");
  const counts = read(
    "apps/web/app/(protected)/inventory/_lib/receiving-counts.ts",
  );

  assert.match(suppliers, /list_suppliers_with_item_counts/);
  assert.doesNotMatch(suppliers, /supplier_items\(count\)/);
  assert.match(workspace, /list_grn_receive_lines/);
  assert.match(workspace, /PROCUREMENT_RPC_PAGE_SIZE/);
  assert.match(workspace, /fetchRpcTablePages/);
  assert.match(workspace, /p_offset: offset/);
  assert.match(workspace, /rpc_page_limit/);
  assert.doesNotMatch(workspace, /from\("grn_items"\)/);
  assert.match(grnActions, /list_receipt_allocations_for_grns/);
  assert.match(grnActions, /fetchRpcTablePages/);
  assert.match(grnActions, /p_offset: offset/);
  assert.match(grnActions, /monetary\.purchasePrice/);
  assert.doesNotMatch(
    grnActions,
    /from\("supplier_invoice_receipt_allocations"\)/,
  );
  assert.match(transfers, /list_stock_transfers_for_branch/);
  assert.doesNotMatch(transfers, /from\("stock_transfers"\)/);
  assert.match(counts, /count_open_stock_transfers/);
  assert.doesNotMatch(
    counts,
    /from\("stock_transfers"\)[\s\S]*from_branch_id\.eq/,
  );

  const sqlTest = read(
    "supabase/tests/slow_read_notification_procurement_rpcs_test.sql",
  );
  assert.match(sqlTest, /v_fulfill/);
  assert.match(sqlTest, /inventory:request_fulfill/);
  assert.match(sqlTest, /TEST fulfill-only transfer list accepted/);
  assert.match(sqlTest, /TEST fulfill-only RLS select leaked/);
  assert.match(sqlTest, /IS DISTINCT FROM 1/);
  assert.match(sqlTest, /TEST GRN paging lost received lines/);
});
