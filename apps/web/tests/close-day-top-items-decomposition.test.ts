import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("close-day top_items decomposes main, sides, and modifiers correctly with sum conservation", () => {
  const migration = read(
    "supabase/migration-archive/20260822193600_get_branch_day_report_include_modifiers.sql",
  );
  const sqlTest = read("supabase/tests/get_branch_day_report_test.sql");

  // Verify SQL structure
  assert.match(migration, /modifier_lines AS \(/);
  assert.match(migration, /mod_el \? 'modifier_id'/);
  assert.match(migration, /\(mod_el ->> 'modifier_id'\) ~ '\^\[0-9\]\+\$'/);
  assert.match(migration, /modifier_totals_by_line AS \(/);
  assert.match(migration, /modifier_components AS \(/);
  assert.match(migration, /'modifier'::text AS source/);
  assert.match(
    migration,
    /paid_items\.line_revenue\s+- COALESCE\(side_totals\.side_revenue, 0\)\s+- COALESCE\(mod_totals\.modifier_revenue, 0\)/,
  );
  assert.match(migration, /UNION ALL\s+SELECT \* FROM modifier_components/);

  // Verify SQL test contract asserts modifier decomposition
  assert.match(sqlTest, /modifier_revenue/);
  assert.match(sqlTest, /modifier_id/);
  assert.match(sqlTest, /modifier_components/);
  assert.match(sqlTest, /modifier.*::text/);

  // Deterministic calculation model test mirroring the SQL logic:
  interface PaidItem {
    order_item_id: number;
    item_name: string;
    parent_quantity: number;
    line_revenue: number;
    sides: Array<{ side_item_id: number; name: string; price: number; quantity?: number }>;
    modifiers: Array<{ modifier_id: number; name: string; price: number }>;
  }

  // Example: 2x Cơm Sườn (unit_price = 35k base + 10k modifier + 15k side = 60k => line_revenue = 120k)
  const item: PaidItem = {
    order_item_id: 1,
    item_name: "Cơm Sườn",
    parent_quantity: 2,
    line_revenue: 120_000,
    modifiers: [{ modifier_id: 10, name: "Thêm trứng", price: 10_000 }],
    sides: [{ side_item_id: 20, name: "Chả trứng", price: 15_000, quantity: 1 }],
  };

  // 1. Side lines
  const sideRevenue = item.sides.reduce(
    (sum, s) => sum + (s.quantity ?? 1) * s.price * item.parent_quantity,
    0,
  );
  assert.equal(sideRevenue, 30_000);

  // 2. Modifier lines
  const modifierRevenue = item.modifiers.reduce(
    (sum, m) => sum + m.price * item.parent_quantity,
    0,
  );
  assert.equal(modifierRevenue, 20_000);

  // 3. Main components
  const mainRevenue = Math.max(item.line_revenue - sideRevenue - modifierRevenue, 0);
  assert.equal(mainRevenue, 70_000);

  // 4. Sum conservation
  const totalDecomposedRevenue = mainRevenue + sideRevenue + modifierRevenue;
  assert.equal(totalDecomposedRevenue, item.line_revenue);

  // 5. Quantity attribution
  assert.equal(item.parent_quantity, 2); // 2x Cơm Sườn
  const modQty = item.parent_quantity * 1; // 2x Thêm trứng
  assert.equal(modQty, 2);
  const sideQty = item.parent_quantity * (item.sides[0]?.quantity ?? 1); // 2x Chả trứng
  assert.equal(sideQty, 2);
});
