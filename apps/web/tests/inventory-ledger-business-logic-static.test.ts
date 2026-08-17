import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const lockMigration =
  "supabase/migration-archive/20260709074049_lock_inventory_adjustment_workflow.sql";
const documentCorrectionMigration =
  "supabase/migration-archive/20260801120606_route_document_stock_corrections_through_ledger.sql";

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

test("exception adjustment writes only through the guarded RPC and not direct ledger insert", () => {
  const migration = read(lockMigration);
  const adjustRpc = sliceBetween(
    migration,
    "CREATE OR REPLACE FUNCTION public.adjust_stock_exception",
    "DROP POLICY IF EXISTS stock_movements_insert",
  );
  const action = read("apps/web/app/(protected)/inventory/stock-actions.ts");

  assert.match(
    adjustRpc,
    /CREATE OR REPLACE FUNCTION public\.adjust_stock_exception/,
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

  assert.match(action, /supabase\.rpc[\s\S]*?"adjust_stock_exception"/);
  assert.doesNotMatch(action, /\.from\("stock_movements"\)\s*\.insert/s);
  assert.doesNotMatch(action, /count_adjustment/);
});

test("stock_movements browser direct insert is closed while RPC writers remain callable", () => {
  const migration = read(lockMigration);

  assert.match(
    migration,
    /DROP POLICY IF EXISTS stock_movements_insert ON public\.stock_movements/,
  );
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.stock_movements FROM anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.adjust_stock_exception\(bigint, bigint, numeric, text\) TO authenticated/,
  );
});

test("document corrections use one authenticated idempotent ledger RPC", () => {
  const migration = read(documentCorrectionMigration);
  const action = read(
    "apps/web/app/(protected)/inventory/document-correction-actions.ts",
  );
  const dialog = read(
    "apps/web/app/(protected)/inventory/_components/document-stock-correction-dialog.tsx",
  );

  assert.match(
    migration,
    /CREATE FUNCTION public\.create_inventory_document_correction\(/,
  );
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /v_tenant bigint := public\.auth_tenant_id\(\)/);
  assert.match(migration, /p_document_type = 'grn'[\s\S]*FOR UPDATE/);
  assert.match(migration, /p_document_type = 'issue'[\s\S]*FOR UPDATE/);
  assert.match(migration, /p_document_type = 'transfer'[\s\S]*FOR UPDATE/);
  assert.match(
    migration,
    /p_document_type = 'production_run'[\s\S]*FOR UPDATE/,
  );
  assert.match(migration, /public\.has_permission\(p_branch_id, 'inventory:write'\)/);
  assert.match(migration, /correction_idempotency_key/);
  assert.match(migration, /ingredient_unit\.unit_id = ingredient\.issue_unit_id/);
  assert.match(migration, /ON CONFLICT[\s\S]*DO NOTHING/);
  assert.match(migration, /FROM public\.stock_levels[\s\S]*FOR UPDATE/);
  assert.match(migration, /insufficient_stock/);
  assert.match(migration, /INSERT INTO public\.stock_movements/);
  assert.doesNotMatch(migration, /supplier_invoices|payments|vat_amount/);

  assert.match(action, /\.rpc\(\s*"create_inventory_document_correction"/);
  assert.doesNotMatch(action, /\.from\("stock_movements"\)\s*\.insert/s);
  assert.doesNotMatch(
    action,
    /loadGrnSource|loadIssueSource|loadTransferSource|loadProductionSource/,
  );
  assert.match(dialog, /crypto\.randomUUID\(\)/);
  assert.match(dialog, /idempotencyKey/);
});

test("stocktake remains the only UI path to count_adjustment completion", () => {
  const migration = read(lockMigration);
  const action = read("apps/web/app/(protected)/inventory/actions.ts");
  const dialog = read(
    "apps/web/app/(protected)/inventory/stock/adjust-stock-dialog.tsx",
  );
  const detail = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  );
  const copy = read("apps/web/lib/messages/inventory.ts");

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.complete_stocktake/,
  );
  assert.match(migration, /counted_quantity IS NULL/);
  assert.match(migration, /needs_recount = TRUE/);
  assert.match(migration, /recount_lines_exist/);
  assert.match(migration, /'count_adjustment'/);

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
    "function summarizeOperatingExpenses",
    "async function fetchUnpaidSupplierInvoiceRisk",
  );
  const actualFoodCost = sliceBetween(
    finance,
    "async function fetchActualFoodCostSnapshot",
    "function buildExceptions",
  );

  assert.match(operatingExpense, /\.from\("expenses"\)/);
  assert.match(operatingExpense, /isOperatingExpenseCategory/);
  assert.doesNotMatch(
    operatingExpense,
    /stock_movements|writeoff|adjustment|count_adjustment/,
  );

  assert.match(actualFoodCost, /\.from\("inventory_value_allocations"\)/);
  assert.match(actualFoodCost, /\.eq\("allocation_bucket", "food_cost"\)/);
  assert.match(actualFoodCost, /isFoodCostRepriceEvent/);
  assert.doesNotMatch(actualFoodCost, /writeoff|adjustment|count_adjustment/);
});
