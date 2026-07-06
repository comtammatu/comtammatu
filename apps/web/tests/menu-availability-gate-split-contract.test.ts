import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const gateSplitMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260705090000_menu_availability_gate_split.sql",
  ),
  "utf8",
);

const path2LockdownMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260705091000_path2_lockdown_posting_idempotency.sql",
  ),
  "utf8",
);

const refundQuotaMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260705092000_refund_quota_first_ready_boundary.sql",
  ),
  "utf8",
);

test("branch_menu_limit_availability: capacity NULL maps to NULL (unlimited), never 0", () => {
  assert.match(
    gateSplitMigration,
    /DROP FUNCTION public\.branch_menu_limit_availability\(bigint, bigint, date, boolean\);/,
  );
  assert.match(
    gateSplitMigration,
    /CREATE FUNCTION public\.branch_menu_limit_availability\(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean DEFAULT false, p_exclude_hold_tokens uuid\[\] DEFAULT NULL\)/,
  );

  const stockRemaining =
    gateSplitMigration.match(
      /CASE\s+WHEN NOT p_stock_gate_enabled THEN NULL::integer[\s\S]*?END AS stock_remaining,/,
    )?.[0] ?? "";

  assert.match(stockRemaining, /WHEN NOT p_stock_gate_enabled THEN NULL::integer/);
  assert.match(stockRemaining, /WHEN r\.stock_capacity_live IS NULL THEN NULL::integer/);
  assert.match(
    stockRemaining,
    /ELSE r\.stock_capacity_live - r\.pending_unfinalized_demand - r\.active_hold_demand/,
  );
  // No path in the CASE maps a NULL/no-recipe capacity to 0 — D064 §2.
  assert.doesNotMatch(stockRemaining, /stock_capacity_live IS NULL THEN 0/);
});

test("branch_menu_limit_availability: own hold tokens excluded from active_hold_demand", () => {
  assert.match(
    gateSplitMigration,
    /AND \(p_exclude_hold_tokens IS NULL OR h\.hold_token <> ALL\(p_exclude_hold_tokens\)\)/,
  );
});

test("branch_menu_limit_availability: service-role only (REVOKE from browser roles)", () => {
  assert.match(
    gateSplitMigration,
    /REVOKE ALL ON FUNCTION public\.branch_menu_limit_availability\(p_tenant_id bigint, p_branch_id bigint, p_limit_date date, p_stock_gate_enabled boolean, p_exclude_hold_tokens uuid\[\]\) FROM PUBLIC;/,
  );
  assert.match(
    gateSplitMigration,
    /REVOKE EXECUTE ON FUNCTION public\.branch_menu_limit_availability\([^)]*\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    gateSplitMigration,
    /GRANT ALL ON FUNCTION public\.branch_menu_limit_availability\([^)]*\) TO service_role;/,
  );
});

test("get_branch_menu_daily_limits_for_pos: gate_eff = availability gate AND outcome posting", () => {
  assert.match(
    gateSplitMigration,
    /DROP FUNCTION public\.get_branch_menu_daily_limits_for_pos\(bigint\);/,
  );
  assert.match(
    gateSplitMigration,
    /CREATE FUNCTION public\.get_branch_menu_daily_limits_for_pos\(p_branch_id bigint, p_exclude_hold_tokens uuid\[\] DEFAULT NULL\)/,
  );

  const forPos =
    gateSplitMigration.match(
      /CREATE FUNCTION public\.get_branch_menu_daily_limits_for_pos[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";

  assert.match(
    forPos,
    /public\.is_feature_enabled\(p_branch_id, 'pos_stock_availability_gate'\)\s*\n\s*AND public\.is_feature_enabled\(p_branch_id, 'pos_stock_outcome_posting'\)/,
  );
  assert.match(forPos, /a\.limit_id IS NOT NULL\s*\n\s*OR ctx\.gate_eff/);
  assert.match(
    forPos,
    /public\.branch_menu_limit_availability\(\s*ctx\.tenant_id,\s*p_branch_id,\s*ctx\.limit_date,\s*ctx\.gate_eff,\s*p_exclude_hold_tokens\s*\)/,
  );
});

test("list_branch_menu_daily_limits: gate_eff computed from the same two flags", () => {
  const listFn =
    gateSplitMigration.match(
      /CREATE OR REPLACE FUNCTION public\.list_branch_menu_daily_limits[\s\S]*?\nEND;\n\$\$;/,
    )?.[0] ?? "";

  assert.match(
    listFn,
    /v_gate_eff := public\.is_feature_enabled\(p_branch_id, 'pos_stock_availability_gate'\)\s*\n\s*AND public\.is_feature_enabled\(p_branch_id, 'pos_stock_outcome_posting'\);/,
  );
  assert.match(
    listFn,
    /public\.branch_menu_limit_availability\(\s*v_tenant_id,\s*p_branch_id,\s*v_date,\s*v_gate_eff\s*\)/,
  );
  // Unchanged signature — callers (menu-limits actions.ts) need no edit.
  assert.match(
    gateSplitMigration,
    /CREATE OR REPLACE FUNCTION public\.list_branch_menu_daily_limits\(p_branch_id bigint, p_limit_date date DEFAULT NULL::date\)/,
  );
});

test("transition_order_status: Path 2 lockdown revokes browser-role execute", () => {
  assert.match(
    path2LockdownMigration,
    /REVOKE EXECUTE ON FUNCTION public\.transition_order_status\(p_order_id bigint, p_new_status text, p_expected_status text, p_note text\) FROM PUBLIC, anon, authenticated;/,
  );
});

test("post_pos_sale_consumption_if_ready: idempotency matches sale-shaped consumption only", () => {
  const sale =
    path2LockdownMigration.match(
      /CREATE OR REPLACE FUNCTION public\.post_pos_sale_consumption_if_ready[\s\S]*?\n\$_\$;/,
    )?.[0] ?? "";

  // Path 2's consume_stock_for_order rows (movement_subtype NULL) must
  // short-circuit re-posting, but cancelled_after_kds_ready waste is ALSO
  // type='consumption' and must NOT suppress the sale posting.
  assert.match(
    sale,
    /WHERE sm\.tenant_id = v_order\.tenant_id\s*\n\s*AND sm\.order_id = p_order_id\s*\n\s*AND sm\.type = 'consumption'\s*\n\s*AND \(sm\.movement_subtype IS NULL OR sm\.movement_subtype = 'sale_consumption'\)\s*\n\s*\) THEN\s*\n\s*RETURN jsonb_build_object\('order_id', p_order_id, 'consumed', true, 'skipped', true, 'reason', 'already_posted'\)/,
  );
});

test("decrement_branch_menu_daily_limit: first-ready boundary keeps quota consumed", () => {
  const trigger =
    refundQuotaMigration.match(
      /CREATE OR REPLACE FUNCTION public\.decrement_branch_menu_daily_limit[\s\S]*?\n\$_\$;/,
    )?.[0] ?? "";

  // Guard sits right after the cancelled-transition check, before quota is touched.
  const cancelledCheckIndex = trigger.indexOf(
    "IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN",
  );
  const firstReadyGuardIndex = trigger.indexOf(
    "kt.first_ready_at IS NOT NULL",
  );
  const decrementLoopIndex = trigger.indexOf("FOR v_target IN");

  assert.ok(cancelledCheckIndex >= 0, "missing cancelled-transition check");
  assert.ok(firstReadyGuardIndex >= 0, "missing first-ready guard");
  assert.ok(decrementLoopIndex >= 0, "missing decrement loop");
  assert.ok(
    cancelledCheckIndex < firstReadyGuardIndex &&
      firstReadyGuardIndex < decrementLoopIndex,
    "first-ready guard must sit between the cancelled-transition check and the decrement loop",
  );

  assert.match(
    trigger,
    /FROM public\.kds_tickets kt\s*\n\s*WHERE kt\.tenant_id = NEW\.tenant_id\s*\n\s*AND kt\.order_item_id = NEW\.id\s*\n\s*AND kt\.first_ready_at IS NOT NULL/,
  );

  assert.match(
    refundQuotaMigration,
    /D064 §5.*first-ready boundary|first-ready boundary.*D064 §5/i,
  );
});
