import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const prodBaseline = read("supabase/migrations/00000000000000_baseline.sql");
const historicalLedgerLockMigration = read(
  "supabase/migration-archive/20260709074049_lock_inventory_adjustment_workflow.sql",
);
const warehouseStockExceptionMigration = read(
  "supabase/migrations/20260713173142_rewire_menu_limit_stock_exception_to_warehouse.sql",
);

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

function sliceBetween(source: string, startToken: string, endToken: string) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `missing start token: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `missing end token: ${endToken}`);
  return source.slice(start, end);
}

function readPgDumpObject(source: string, createPrefix: string): string {
  const start = source.indexOf(createPrefix);
  assert.notEqual(start, -1, `missing pg_dump object: ${createPrefix}`);
  const end = source.indexOf("\n\n--\n-- Name:", start + createPrefix.length);
  assert.notEqual(end, -1, `unterminated pg_dump object: ${createPrefix}`);
  return source.slice(start, end);
}

test("exception adjustment writes only through the guarded RPC and not direct ledger insert", () => {
  const adjustRpc = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.adjust_stock_exception(",
  );
  const action = read("apps/web/app/(protected)/inventory/stock-actions.ts");

  assert.match(
    adjustRpc,
    /CREATE FUNCTION public\.adjust_stock_exception/,
  );
  assert.match(adjustRpc, /SECURITY DEFINER/);
  assert.match(adjustRpc, /auth\.uid\(\)/);
  assert.match(adjustRpc, /auth_tenant_id\(\)/);
  assert.match(adjustRpc, /has_permission\(p_branch_id, 'inventory:write'\)/);
  assert.match(adjustRpc, /quantity_change_nonzero/);
  assert.match(adjustRpc, /reason_required/);
  assert.match(adjustRpc, /INSERT INTO public\.stock_movements/);
  assert.match(adjustRpc, /'adjustment'/);
  assert.doesNotMatch(adjustRpc, /p_type|p_movement_type|count_adjustment/);

  assert.match(action, /\.rpc\("adjust_stock_exception"/);
  assert.doesNotMatch(action, /\.from\("stock_movements"\)\s*\.insert/s);
  assert.doesNotMatch(action, /count_adjustment/);
});

test("stock_movements browser direct insert is closed while RPC writers remain callable", () => {
  assert.match(
    historicalLedgerLockMigration,
    /DROP POLICY IF EXISTS stock_movements_insert ON public\.stock_movements/,
  );
  assert.match(
    historicalLedgerLockMigration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.stock_movements FROM anon, authenticated/,
  );
  assert.doesNotMatch(
    prodBaseline,
    /CREATE POLICY stock_movements_(?:insert|update|delete)\b/,
  );
  assert.match(
    prodBaseline,
    /GRANT SELECT,MAINTAIN ON TABLE public\.stock_movements TO authenticated;/,
  );
  assert.doesNotMatch(
    prodBaseline,
    /GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]* ON TABLE public\.stock_movements TO authenticated;/,
  );
  assert.match(
    prodBaseline,
    /GRANT ALL ON FUNCTION public\.adjust_stock_exception\(p_branch_id bigint, p_ingredient_id bigint, p_quantity_change numeric, p_reason text\) TO authenticated;/,
  );
});

test("menu-limit warehouse replenishment writes recipe adjustments through one compatible RPC", () => {
  const rpc = sliceBetween(
    warehouseStockExceptionMigration,
    "CREATE OR REPLACE FUNCTION public.add_menu_item_kitchen_stock_exception",
    "REVOKE ALL ON FUNCTION public.add_menu_item_kitchen_stock_exception",
  );
  const actions = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/actions.ts",
  );

  assert.match(
    rpc,
    /CREATE OR REPLACE FUNCTION public\.add_menu_item_kitchen_stock_exception/,
  );
  assert.match(rpc, /p_extra_portions integer/);
  assert.match(
    rpc,
    /p_extra_portions IS NULL OR p_extra_portions NOT IN \(1, 2\)/,
  );
  assert.match(
    rpc,
    /public\.has_permission\(p_branch_id, 'inventory:write'\)/,
  );
  assert.match(rpc, /loc\.location_kind = 'warehouse'/);
  assert.doesNotMatch(rpc, /location_kind = 'kitchen'/);
  assert.match(rpc, /branch_warehouse_required/);
  assert.match(rpc, /default_warehouse_location_required/);
  assert.doesNotMatch(rpc, /branch_kitchen_required|default_kitchen_location_required/);
  assert.match(rpc, /public\.inv_to_base_for_tenant/);
  assert.match(rpc, /INSERT INTO public\.stock_movements/);
  assert.match(rpc, /'adjustment'/);
  assert.doesNotMatch(rpc, /UPDATE public\.stock_levels/);

  assert.match(actions, /\.rpc\(\s*"add_menu_item_kitchen_stock_exception"/);
  assert.match(actions, /export async function replenishMenuItemWarehouseStock/);
  assert.doesNotMatch(actions, /replenishMenuItemKitchenStock/);
  assert.doesNotMatch(actions, /\.from\("stock_movements"\)\s*\.insert/s);
  assert.match(
    warehouseStockExceptionMigration,
    /REVOKE ALL ON FUNCTION public\.add_menu_item_kitchen_stock_exception\(bigint, bigint, integer, text\)\s+FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    warehouseStockExceptionMigration,
    /GRANT EXECUTE ON FUNCTION public\.add_menu_item_kitchen_stock_exception\(bigint, bigint, integer, text\)\s+TO authenticated;/,
  );
});

test("stocktake remains the only UI path to count_adjustment completion", () => {
  const completeStocktakeRpc = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.complete_stocktake(",
  );
  const action = read("apps/web/app/(protected)/inventory/actions.ts");
  const dialog = read(
    "apps/web/app/(protected)/inventory/stock/adjust-stock-dialog.tsx",
  );
  const detail = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  );
  const copy = read("apps/web/lib/messages/inventory.ts");

  assert.match(
    completeStocktakeRpc,
    /CREATE FUNCTION public\.complete_stocktake/,
  );
  assert.match(completeStocktakeRpc, /counted_quantity IS NULL/);
  assert.match(completeStocktakeRpc, /needs_recount = TRUE/);
  assert.match(completeStocktakeRpc, /recount_lines_exist/);
  assert.match(completeStocktakeRpc, /'count_adjustment'/);

  assert.match(action, /\.rpc\("complete_stocktake"/);
  assert.doesNotMatch(action, /finalize_stocktake/);
  assert.match(action, /needs_recount/);
  assert.match(action, /Còn dòng cần đếm lại trước khi hoàn tất/);

  assert.doesNotMatch(dialog, /SelectField/);
  assert.doesNotMatch(dialog, /count_adjustment/);
  assert.match(dialog, /reason: z\.string\(\)\.trim\(\)\.min\(5/);
  assert.match(dialog, /name="reason"[\s\S]*?required/);

  assert.doesNotMatch(detail, /wasteHref/);
  assert.match(detail, /reviewHref/);
  assert.doesNotMatch(copy, /nextActionCta: "Báo hao hụt"/);
  assert.match(copy, /nextActionCta: "Xem biến động kho"/);
});

test("finance cockpit does not fold writeoff or adjustments into operating expense or food cost", () => {
  const finance = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const operatingExpense = sliceBetween(
    finance,
    "export async function fetchOperatingExpenseTotal",
    "async function fetchUnpaidSupplierInvoiceRisk",
  );
  const actualFoodCost = sliceBetween(
    finance,
    "async function fetchActualFoodCostSnapshot",
    "function buildTrends",
  );

  assert.match(operatingExpense, /\.from\("expenses"\)/);
  assert.match(operatingExpense, /isOperatingExpenseCategory/);
  assert.doesNotMatch(
    operatingExpense,
    /stock_movements|writeoff|adjustment|count_adjustment/,
  );

  assert.match(actualFoodCost, /\.from\("stock_movements"\)/);
  assert.match(actualFoodCost, /\.eq\("type", "consumption"\)/);
  assert.match(
    actualFoodCost,
    /\.eq\("movement_subtype", "sale_consumption"\)/,
  );
  assert.doesNotMatch(actualFoodCost, /writeoff|adjustment|count_adjustment/);
});
