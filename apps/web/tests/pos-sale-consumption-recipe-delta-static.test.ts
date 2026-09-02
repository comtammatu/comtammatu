import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

const migration = read(
  "supabase/migrations/20260817200004_post_missing_sale_consumption_after_recipe_change.sql",
);
const acceptance = read(
  "supabase/tests/pos_stock_outcome_multiunit_acceptance_test.sql",
);

test("sale consumption re-entry posts only missing recipe ingredients", () => {
  assertSqlMatch(migration, /posted\.ingredient_id = r\.ingredient_id/);
  assertSqlMatch(migration, /whole-order already_posted skip missing/);
  assertSqlMatch(migration,
    /PERFORM public\.post_pos_sale_consumption_if_ready\(\s*v_order\.id,/,
  );
  assertSqlMatch(migration, /b\.branch_kind = 'branch'/);
  assertSqlMatch(migration,
    /Re-entry after a recipe add posts only ingredients with no sale_consumption/,
  );
  assertSqlNotMatch(migration,
    /AND NOT EXISTS \(\s*SELECT 1\s*FROM public\.stock_movements sm\s*WHERE sm\.order_id = o\.id/,
  );
});

test("acceptance covers recipe-delta post after already_posted", () => {
  assert.match(acceptance, /TEST 5C FAILED: recipe-delta post failed/);
  assert.match(acceptance, /TEST 5C FAILED: delta idempotency failed/);
});
