import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("stock adjustments preserve the selected issue or receipt unit through the RPC", () => {
  const dialog = readFileSync(
    `${root}apps/web/app/(protected)/inventory/stock/adjust-stock-dialog.tsx`,
    "utf8",
  );
  const action = readFileSync(
    `${root}apps/web/app/(protected)/inventory/stock-actions.ts`,
    "utf8",
  );
  const stockClient = readFileSync(
    `${root}apps/web/app/(protected)/inventory/stock/stock-client.tsx`,
    "utf8",
  );
  const migrationName = readdirSync(`${root}supabase/migrations`).find((name) =>
    name.endsWith("_fix_inventory_movement_entry_boundaries.sql"),
  );
  assert.ok(migrationName, "missing inventory movement boundary migration");
  const migration = readFileSync(
    `${root}supabase/migrations/${migrationName}`,
    "utf8",
  );

  assert.match(dialog, /entryUnitId/);
  assert.match(dialog, /getIssueUnitOptions/);
  assert.match(dialog, /getDefaultIssueUnit/);
  assert.doesNotMatch(dialog, /getIngredientUnitOptions/);
  assert.match(dialog, /<Select/);
  assert.match(dialog, /entryQuantity: parsedQuantityChange/);
  assert.match(action, /entryUnitId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(action, /entryQuantity: z\.coerce/);
  assert.match(action, /p_entry_unit_id: data\.entryUnitId/);
  assert.match(action, /p_entry_quantity: data\.entryQuantity/);
  assert.doesNotMatch(action, /p_quantity_change: data\.quantityChange/);
  assert.match(
    migration,
    /public\.adjust_stock_exception\(\s*p_branch_id bigint,\s*p_ingredient_id bigint,\s*p_entry_quantity numeric,\s*p_entry_unit_id bigint,\s*p_reason text/s,
  );
  assert.match(migration, /ingredient\.issue_unit_id/);
  assert.match(migration, /ingredient\.receipt_unit_id/);
  assert.match(migration, /entry_to_base_factor/);
  assert.match(migration, /entry_unit_code/);
  assert.match(migration, /IF v_need_qty = 0 THEN\s+CONTINUE;/);
  assert.match(migration, /ingredient\.production_unit_id/);
  assert.match(migration, /v_need_qty \/ v_raw_entry_to_base_factor/);
  assert.match(
    stockClient,
    /<AdjustStockDialog[\s\S]*?ingredient=\{adjustTarget\}/,
  );
});
