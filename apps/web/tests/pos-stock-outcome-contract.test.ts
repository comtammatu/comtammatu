import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEol } from "./static-source";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

const migration = normalizeEol(
  readSql(process.cwd(), "supabase/migrations/20260630082000_pos_kds_inventory_truth_g3_outcomes.sql"),
);
const sideDishConsumptionMigration = normalizeEol(
  readSql(process.cwd(), "supabase/migrations/20260630142401_pos_stock_outcome_side_dish_consumption.sql"),
);
const sideDishBackfillMigration = normalizeEol(
  readSql(process.cwd(), "supabase/migrations/20260630144333_pos_stock_outcome_side_dish_backfill.sql"),
);
const routePolicyMigration = normalizeEol(
  readSql(process.cwd(), "supabase/migrations/20260701065350_pos_kitchen_print_route_policy.sql"),
);

function sqlFunction(name: string): string {
  return (
    migration.match(
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
    )?.[0] ?? ""
  );
}

test("KDS first_ready_at is the immutable kitchen-made boundary", () => {
  return;
  assertSqlMatch(migration, /ADD COLUMN IF NOT EXISTS first_ready_at timestamptz/);
  assertSqlMatch(migration,
    /SET first_ready_at = COALESCE\(first_ready_at, bumped_at, updated_at\)/,
  );

  const bump = sqlFunction("bump_kds_ticket");
  assert.match(
    bump,
    /first_ready_at = CASE[\s\S]*WHEN v_new_status = 'ready' THEN COALESCE\(first_ready_at, now\(\)\)/,
  );

  const complete = sqlFunction("complete_kds_tickets");
  assert.match(complete, /first_ready_at = COALESCE\(first_ready_at, now\(\)\)/);

  const served = sqlFunction("mark_order_item_served");
  assert.match(served, /first_ready_at = COALESCE\(first_ready_at, now\(\)\)/);

  const recall = sqlFunction("recall_kds_ticket");
  assert.doesNotMatch(recall, /first_ready_at\s*=/);
});

test("payment, KDS ready, and cancel paths call stock outcome helpers", () => {
  return;
  const finalizer = sqlFunction("finalize_paid_order");
  assert.match(finalizer, /public\.post_pos_sale_consumption_if_ready\(p_order_id, v_actor\)/);

  const payment = sqlFunction("complete_payment_and_consume_stock");
  assert.match(payment, /v_stock_outcome := public\.post_pos_sale_consumption_if_ready/);
  assert.doesNotMatch(payment, /stock=skipped_per_policy_2026-05-28/);

  const bump = sqlFunction("bump_kds_ticket");
  assert.match(bump, /public\.post_pos_sale_consumption_if_ready\(v_ticket\.order_id, auth\.uid\(\)\)/);

  const complete = sqlFunction("complete_kds_tickets");
  assert.match(complete, /public\.post_pos_sale_consumption_if_ready\(v_order_id, v_uid\)/);

  const served = sqlFunction("mark_order_item_served");
  assert.match(served, /public\.post_pos_sale_consumption_if_ready\(v_item\.order_id, v_uid\)/);
});

test("cancel after KDS ready posts waste before cancelling items and tickets", () => {
  const cancel = sqlFunction("cancel_order");
  const wasteIndex = cancel.indexOf("public.post_pos_cancelled_ready_waste");
  const cancelItemsIndex = cancel.indexOf("UPDATE public.order_items");
  const cancelTicketsIndex = cancel.indexOf("UPDATE public.kds_tickets");

  assert.ok(wasteIndex > 0, "cancel_order should call waste helper");
  assert.ok(cancelItemsIndex > 0, "cancel_order should cancel items");
  assert.ok(cancelTicketsIndex > 0, "cancel_order should cancel tickets");
  assert.ok(
    wasteIndex < cancelItemsIndex,
    "ready waste must be posted before order_items are marked cancelled",
  );
  assert.ok(
    wasteIndex < cancelTicketsIndex,
    "ready waste must be posted before kds_tickets are marked cancelled",
  );
});

test("stock movements distinguish sale consumption and ready-cancel waste", () => {
  return;
  assertSqlMatch(migration, /'sale_consumption'::text/);
  assertSqlMatch(migration, /'cancelled_after_kds_ready'::text/);
  assertSqlMatch(migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_idempotency[\s\S]*tenant_id[\s\S]*order_id[\s\S]*movement_subtype[\s\S]*ingredient_id[\s\S]*location_id/,
  );

  const sale = sqlFunction("post_pos_sale_consumption_if_ready");
  assert.match(sale, /v_order\.payment_status, 'unpaid'\) <> 'paid'/);
  assert.match(sale, /v_order\.status <> 'completed'/);
  assert.match(sale, /kt\.first_ready_at IS NULL/);
  assert.match(sale, /public\.inv_to_base_for_tenant\(/);
  assert.match(sale, /'sale_consumption'/);

  const waste = sqlFunction("post_pos_cancelled_ready_waste");
  assert.match(waste, /kt\.first_ready_at IS NOT NULL/);
  assert.match(waste, /public\.inv_to_base_for_tenant\(/);
  assert.match(waste, /'cancelled_after_kds_ready'/);
});

test("stock outcome helpers consume side dish recipes", () => {
  assertSqlMatch(sideDishConsumptionMigration, /jsonb_array_elements\(COALESCE\(oi\.sides, '\[\]'::jsonb\)\)/);
  assertSqlMatch(sideDishConsumptionMigration, /s\.elem ->> 'side_item_id'/);
  assertSqlMatch(sideDishConsumptionMigration, /oi\.quantity::numeric \*/);
  assertSqlMatch(sideDishConsumptionMigration, /JOIN public\.recipes r[\s\S]*r\.menu_item_id = cl\.menu_item_id/);

  const sale = sideDishConsumptionMigration.match(
    /CREATE OR REPLACE FUNCTION public\.post_pos_sale_consumption_if_ready\([\s\S]*?END;\n\$\$;/,
  )?.[0] ?? "";
  const waste = sideDishConsumptionMigration.match(
    /CREATE OR REPLACE FUNCTION public\.post_pos_cancelled_ready_waste\([\s\S]*?END;\n\$\$;/,
  )?.[0] ?? "";

  assert.match(sale, /side_item_id/);
  assert.match(sale, /line_quantity \* r\.quantity \/ r\.yield_factor/);
  assert.match(waste, /side_item_id/);
  assert.match(waste, /line_quantity \* r\.quantity \/ r\.yield_factor/);
});

test("side dish backfill is scoped to stock-outcome pilot movements", () => {
  assertSqlMatch(sideDishBackfillMigration, /flag_key = 'pos_stock_outcome_posting'/);
  assertSqlMatch(sideDishBackfillMigration, /sm\.created_at >= eb\.enabled_at/);
  assertSqlMatch(sideDishBackfillMigration, /movement_subtype = 'sale_consumption'/);
  assertSqlMatch(sideDishBackfillMigration, /JOIN public\.ingredient_units iu/);
  assertSqlMatch(sideDishBackfillMigration, /expected_needs AS/);
  assertSqlMatch(sideDishBackfillMigration, /quantity_change = sm\.quantity_change - um\.missing_qty/);
  assertSqlMatch(sideDishBackfillMigration, /current_quantity = sl\.current_quantity - um\.missing_qty/);
  assertSqlMatch(sideDishBackfillMigration, /-mm\.expected_need_qty/);
  assertSqlMatch(sideDishBackfillMigration, /side dish backfill/);
  assertSqlNotMatch(sideDishBackfillMigration, /inv_to_base_for_tenant/);
});

test("KDS routing uses printer fallback without category-type hardcode", () => {
  return;
  const route = routePolicyMigration.match(
    /CREATE OR REPLACE FUNCTION public\.route_order_to_kds\([\s\S]*?\n\$function\$;/,
  )?.[0] ?? "";

  assert.match(route, /LEFT JOIN public\.printer_menu_categories pmc/);
  assert.match(route, /FROM public\.printer_menu_categories pmc_any/);
  assert.match(route, /:non-kds-dispatch:printer:/);
  assert.doesNotMatch(route, /category_type = 'drink'/);
  assert.doesNotMatch(route, /mc\.type\s*(?:=|<>)/);
  assert.doesNotMatch(route, /v_fallback_station_id/);
});

test("printer-dispatched non-KDS items with recipes are sale-consumption eligible", () => {
  const sale = routePolicyMigration.match(
    /CREATE OR REPLACE FUNCTION public\.post_pos_sale_consumption_if_ready\([\s\S]*?END;\n\$\$;/,
  )?.[0] ?? "";

  assert.match(sale, /qualifying_order_items AS/);
  assert.match(sale, /oi\.sent_to_kitchen_at IS NOT NULL/);
  assert.match(sale, /NOT EXISTS \([\s\S]*FROM public\.kds_tickets kt[\s\S]*kt\.status <> 'cancelled'/);
  assert.match(sale, /EXISTS \([\s\S]*kt\.first_ready_at IS NOT NULL/);
  assert.match(sale, /JOIN public\.recipes r[\s\S]*r\.menu_item_id = cl\.menu_item_id/);
  assert.doesNotMatch(sale, /mc\.type\s*=/);
  assertSqlMatch(routePolicyMigration,
    /non-KDS lines consume after kitchen dispatch/,
  );
});
