import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlIndexOf, looksLikeDump, extractSqlFunction, readActiveMigrationSql } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

const MIGRATION =
  "supabase/migrations/20260817122500_grn_receive_base_qty_and_excess.sql";

function latestPoLineImmutabilityDefinition(): {
  definition: string;
  migration: string;
} {
  const migration = readActiveMigrationSql(repoRoot);
  return {
    definition: extractSqlFunction(
      migration,
      "private.enforce_retrospective_purchase_order_line_immutability",
    ),
    migration,
  };
}

test("GRN confirm compares remaining in base and stocks excess without blocking", () => {
  const sql = read(MIGRATION);

  assertSqlNotMatch(sql, /grn_over_receipt_not_allowed/);
  assertSqlMatch(sql, /v_applied_base := least\(v_accepted_base, v_remaining_base\)/);
  assertSqlMatch(sql, /po_applied_quantity = v_applied/);
  assertSqlMatch(sql, /INSERT INTO public\.stock_movements \(/);
  assert.ok(looksLikeDump(sql) || ((sql.match(/INSERT INTO public\.stock_movements \(/g) ?? []).length === 1));
  assertSqlMatch(sql, /quantity_change,\s+reason,/);
  assertSqlMatch(sql, /v_accepted_base,/);
  assertSqlMatch(sql, /v_item\.unit_cost \/ v_po_factor/);
  assertSqlMatch(sql,
    /Draft PO-linked lines may persist in any active unit of the same ingredient/,
  );
});

test("draft linked GRN lines may change persist unit to another active unit", () => {
  const sql = read(MIGRATION);
  if (looksLikeDump(sql)) return;
  const immutability = sql.slice(
    sqlIndexOf(sql, "CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()"),
    sqlIndexOf(sql, "CREATE OR REPLACE FUNCTION public.save_goods_receipt_note("),
  );

  assertSqlNotMatch(immutability,
    /NEW\.entry_unit_id IS DISTINCT FROM OLD\.entry_unit_id/,
  );
  assertSqlMatch(immutability, /ingredient_unit\.unit_id = NEW\.entry_unit_id/);
  assertSqlMatch(immutability, /ingredient_unit\.is_active/);
  assertSqlMatch(sql, /COALESCE\(line\.entry_unit_id, item\.entry_unit_id\)/);
  assertSqlMatch(sql,
    /EXECUTE FUNCTION private\.enforce_inventory_entry_unit_active\(\)/,
  );
});

test("Owner and branch GRN save persist the loose unit with received quantity", () => {
  const actions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const saveHook = read("apps/web/lib/inventory/use-grn-detail-actions.ts");
  const lineRow = read(
    "apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx",
  );
  const branchSheet = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
  );

  assert.match(actions, /entry_unit_id: line\.entryUnitId \?\? null/);
  assert.match(actions, /unit_cost_unit_id: line\.unitCostUnitId \?\? null/);
  assert.match(saveHook, /entryUnitId: line\.entryUnitId/);
  assert.match(saveHook, /unitCostUnitId: line\.unitCostUnitId/);
  assert.match(lineRow, /commitPackLoose\(/);
  assert.match(branchSheet, /numericField === "pack"/);
  assert.match(lineRow, /excessShortText\(/);
  assert.match(lineRow, /formatGrnPersistQty\(excessQuantity, line\)/);
});

test("SQL proof covers partial pack+loose, excess amends PO qty, and same-unit over-receipt", () => {
  const sql = read("supabase/tests/grn_receive_base_qty_and_excess_test.sql");
  assertSqlMatch(sql, /received_quantity', 222/);
  assertSqlMatch(sql, /received_quantity', 246/);
  assertSqlMatch(sql, /received_quantity', 6/);
  assertSqlMatch(sql, /'unit_cost', 1000/);
  assertSqlMatch(sql, /'unit_cost_unit_id', v_base_unit/);
  assertSqlMatch(sql, /'unit_cost_unit_id', v_pack_unit/);
  assertSqlMatch(sql, /carton-quoted total expected 246000/);
  assertSqlMatch(sql, /partially_received/);
  assertSqlMatch(sql, /close_purchase_order/);
  assertSqlMatch(sql, /excess po_applied expected 10\.250/);
  assertSqlMatch(sql, /excess PO qty expected 10\.250/);
  assertSqlMatch(sql, /same-unit po_applied expected 6/);
  assertSqlMatch(sql, /po_status.*received|status = 'received'/);
  assertSqlMatch(sql, /direct linked PO quantity increase must fail/);
  assertSqlNotMatch(sql, /grn_over_receipt_not_allowed/);
});

test("linked PO immutability permits only trusted GRN-confirm quantity increases", () => {
  const { definition: immutability, migration } = latestPoLineImmutabilityDefinition();

  assertSqlMatch(immutability, /current_setting\('comtammatu\.grn_confirm', TRUE\)/);
  assertSqlMatch(immutability, /NEW\.quantity > OLD\.quantity/);
  assertSqlMatch(immutability,
    /to_jsonb\(NEW\) - 'quantity'[\s\S]*?to_jsonb\(OLD\) - 'quantity'/,
  );
  assertSqlMatch(immutability, /v_trusted_rpc IS TRUE/);
  assertSqlNotMatch(immutability, /pg_catalog\.coalesce/i);
  assertSqlMatch(migration,
    /pg_get_functiondef\([\s\S]*?enforce_retrospective_purchase_order_line_immutability/,
  );
  assertSqlNotMatch(immutability, /IF v_confirming THEN\s+RETURN NEW/);
});
