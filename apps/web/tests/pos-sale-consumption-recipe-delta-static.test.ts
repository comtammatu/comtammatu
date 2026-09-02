import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const migration = read(
  "supabase/migration-archive/20260817200004_post_missing_sale_consumption_after_recipe_change.sql",
);
const acceptance = read(
  "supabase/tests/pos_stock_outcome_multiunit_acceptance_test.sql",
);

test("sale consumption re-entry posts only missing recipe ingredients", () => {
  assert.match(migration, /posted\.ingredient_id = r\.ingredient_id/);
  assert.match(migration, /whole-order already_posted skip missing/);
  assert.match(
    migration,
    /PERFORM public\.post_pos_sale_consumption_if_ready\(\s*v_order\.id,/,
  );
  assert.match(migration, /b\.branch_kind = 'branch'/);
  assert.match(
    migration,
    /Re-entry after a recipe add posts only ingredients with no sale_consumption/,
  );
  assert.doesNotMatch(
    migration,
    /AND NOT EXISTS \(\s*SELECT 1\s*FROM public\.stock_movements sm\s*WHERE sm\.order_id = o\.id/,
  );
});

test("acceptance covers recipe-delta post after already_posted", () => {
  assert.match(acceptance, /TEST 5C FAILED: recipe-delta post failed/);
  assert.match(acceptance, /TEST 5C FAILED: delta idempotency failed/);
});
