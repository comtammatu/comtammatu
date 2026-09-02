import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const MIGRATION =
  "supabase/migration-archive/20260817122500_grn_receive_base_qty_and_excess.sql";

function latestPoLineImmutabilityDefinition(): {
  definition: string;
  migration: string;
} {
  const migrationDir = resolve(repoRoot, "supabase/migration-archive");
  const migrations = readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql") && !file.includes("baseline"))
    .sort()
    .map((file) => ({ file, sql: read(`supabase/migration-archive/${file}`) }))
    .filter(({ sql }) =>
      /CREATE(?: OR REPLACE)? FUNCTION private\.enforce_retrospective_purchase_order_line_immutability\(\)/.test(
        sql,
      ),
    );
  const latest = migrations.at(-1);
  assert.ok(latest, "latest PO-line immutability definition not found");
  const start = latest.sql.search(
    /CREATE(?: OR REPLACE)? FUNCTION private\.enforce_retrospective_purchase_order_line_immutability\(\)/,
  );
  const terminator = "$function$;";
  const end = latest.sql.indexOf(terminator, start);
  assert.ok(end >= 0, `PO-line immutability terminator not found in ${latest.file}`);
  return {
    definition: latest.sql.slice(start, end + terminator.length),
    migration: latest.sql,
  };
}

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
  assert.match(sql, /received_quantity', 222/);
  assert.match(sql, /received_quantity', 246/);
  assert.match(sql, /received_quantity', 6/);
  assert.match(sql, /'unit_cost', 1000/);
  assert.match(sql, /'unit_cost_unit_id', v_base_unit/);
  assert.match(sql, /'unit_cost_unit_id', v_pack_unit/);
  assert.match(sql, /carton-quoted total expected 246000/);
  assert.match(sql, /partially_received/);
  assert.match(sql, /close_purchase_order/);
  assert.match(sql, /excess po_applied expected 10\.250/);
  assert.match(sql, /excess PO qty expected 10\.250/);
  assert.match(sql, /same-unit po_applied expected 6/);
  assert.match(sql, /po_status.*received|status = 'received'/);
  assert.match(sql, /direct linked PO quantity increase must fail/);
  assert.doesNotMatch(sql, /grn_over_receipt_not_allowed/);
});

test("linked PO immutability permits only trusted GRN-confirm quantity increases", () => {
  const { definition: immutability, migration } = latestPoLineImmutabilityDefinition();

  assert.match(immutability, /current_setting\('comtammatu\.grn_confirm', TRUE\)/);
  assert.match(immutability, /NEW\.quantity > OLD\.quantity/);
  assert.match(
    immutability,
    /to_jsonb\(NEW\) - 'quantity'[\s\S]*?to_jsonb\(OLD\) - 'quantity'/,
  );
  assert.match(immutability, /v_trusted_rpc IS TRUE/);
  assert.doesNotMatch(immutability, /pg_catalog\.coalesce/i);
  assert.match(
    migration,
    /pg_get_functiondef\([\s\S]*?enforce_retrospective_purchase_order_line_immutability/,
  );
  assert.doesNotMatch(immutability, /IF v_confirming THEN\s+RETURN NEW/);
});
