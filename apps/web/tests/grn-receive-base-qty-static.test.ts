import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const MIGRATION =
  "supabase/migrations/20260817122500_grn_receive_base_qty_and_excess.sql";

test("GRN confirm compares remaining in base and stocks excess without blocking", () => {
  const sql = read(MIGRATION);

  assert.doesNotMatch(sql, /grn_over_receipt_not_allowed/);
  assert.match(sql, /v_applied_base := least\(v_accepted_base, v_remaining_base\)/);
  assert.match(sql, /po_applied_quantity = v_applied/);
  assert.match(sql, /INSERT INTO public\.stock_movements \(/);
  assert.equal((sql.match(/INSERT INTO public\.stock_movements \(/g) ?? []).length, 1);
  assert.match(sql, /quantity_change,\s+reason,/);
  assert.match(sql, /v_accepted_base,/);
  assert.match(sql, /v_item\.unit_cost \/ v_po_factor/);
  assert.match(
    sql,
    /Draft PO-linked lines may persist in any active unit of the same ingredient/,
  );
});

test("draft linked GRN lines may change persist unit to another active unit", () => {
  const sql = read(MIGRATION);
  const immutability = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.save_goods_receipt_note("),
  );

  assert.doesNotMatch(
    immutability,
    /NEW\.entry_unit_id IS DISTINCT FROM OLD\.entry_unit_id/,
  );
  assert.match(immutability, /ingredient_unit\.unit_id = NEW\.entry_unit_id/);
  assert.match(immutability, /ingredient_unit\.is_active/);
  assert.match(sql, /COALESCE\(line\.entry_unit_id, item\.entry_unit_id\)/);
  assert.match(
    sql,
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
  assert.match(saveHook, /entryUnitId: line\.entryUnitId/);
  assert.match(lineRow, /commitPackLoose\(/);
  assert.match(branchSheet, /numericField === "pack"/);
  assert.match(lineRow, /Dư ngoài đơn \$\{formatGrnPersistQty\(excessQuantity, line\)\}/);
});

test("SQL proof covers partial pack+loose, excess at 0, and same-unit over-receipt", () => {
  const sql = read("supabase/tests/grn_receive_base_qty_and_excess_test.sql");
  assert.match(sql, /received_quantity', 222/);
  assert.match(sql, /received_quantity', 246/);
  assert.match(sql, /received_quantity', 6/);
  assert.match(sql, /partially_received/);
  assert.match(sql, /po_status.*received|status = 'received'/);
  assert.doesNotMatch(sql, /grn_over_receipt_not_allowed/);
});
