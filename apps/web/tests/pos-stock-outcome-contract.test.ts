import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/20260630082000_pos_kds_inventory_truth_g3_outcomes.sql",
  ),
  "utf8",
);

function sqlFunction(name: string): string {
  return (
    migration.match(
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
    )?.[0] ?? ""
  );
}

test("KDS first_ready_at is the immutable kitchen-made boundary", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS first_ready_at timestamptz/);
  assert.match(
    migration,
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
  assert.match(migration, /'sale_consumption'::text/);
  assert.match(migration, /'cancelled_after_kds_ready'::text/);
  assert.match(
    migration,
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
