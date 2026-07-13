import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const baseline = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);

function sqlFunction(name: string): string {
  const marker = "CREATE FUNCTION public." + name + "(";
  const start = baseline.indexOf(marker);
  assert.ok(start >= 0, name + " must exist in the current baseline");
  const end = baseline.indexOf("\n--\n-- Name:", start + marker.length);
  assert.ok(end > start, name + " must have a bounded body");
  return baseline.slice(start, end);
}

const posLimits = sqlFunction("get_branch_menu_daily_limits_for_pos");
const managerLimits = sqlFunction("list_branch_menu_daily_limits");
const hardGate = sqlFunction("enforce_branch_stock_availability");
const outcomePosting = sqlFunction("post_pos_sale_consumption_if_ready");

test("menu availability and stock posting share one owner-facing switch", () => {
  assert.match(
    posLimits,
    /public\.is_feature_enabled\(p_branch_id, 'pos_stock_outcome_posting'\) AS gate_eff/,
  );
  assert.match(
    managerLimits,
    /v_gate_eff := public\.is_feature_enabled\(p_branch_id, 'pos_stock_outcome_posting'\);/,
  );
  assert.doesNotMatch(baseline, /pos_stock_availability_gate/);
});

test("hard stock gate is attached after the daily-limit trigger by deterministic name order", () => {
  assert.match(
    baseline,
    /CREATE TRIGGER trg_enforce_stock_availability AFTER INSERT ON public\.order_items FOR EACH ROW EXECUTE FUNCTION public\.enforce_branch_stock_availability\(\);/,
  );
  assert.ok(
    "trg_enforce_branch_menu_daily_limit" < "trg_enforce_stock_availability",
    "stock gate must sort after the daily-limit trigger",
  );
});

test("hard stock gate uses the same active warehouse pool as outcome posting", () => {
  for (const fn of [hardGate, outcomePosting]) {
    assert.match(fn, /il\.location_kind = 'warehouse'/);
    assert.match(fn, /il\.is_active = TRUE/);
    assert.match(
      fn,
      /ORDER BY il\.is_default_consumption DESC, il\.sort_order NULLS LAST, il\.id/,
    );
    assert.match(fn, /LIMIT 1;/);
    assert.doesNotMatch(fn, /il\.location_kind = 'kitchen'/);
    assert.doesNotMatch(fn, /il\.is_default_issue/);
  }

  assert.match(
    hardGate,
    /AND sl\.location_id = v_location_id\s*\n\s*FOR UPDATE OF sl;/,
  );
  assert.match(
    hardGate,
    /SELECT COALESCE\(SUM\(sl\.current_quantity\), 0\)[\s\S]*AND sl\.location_id = v_location_id;/,
  );
  assert.match(
    outcomePosting,
    /AND sl\.location_id = v_location_id\s*\n\s*AND sl\.ingredient_id = v_need\.ingredient_id\s*\n\s*FOR UPDATE;/,
  );
});

test("hard gate honors the single switch, skip hatch, and P0001 shortage contract", () => {
  assert.match(
    hardGate,
    /current_setting\('comtammatu\.skip_quota_enforcement', true\)/,
  );
  assert.match(
    hardGate,
    /IF NOT public\.is_feature_enabled\(v_branch_id, 'pos_stock_outcome_posting'\) THEN/,
  );
  assert.match(
    hardGate,
    /RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need\.ingredient_id[\s\S]*ERRCODE = 'P0001'/,
  );
  assert.match(hardGate, /'reason', 'insufficient_stock_ingredient'/);
});

test("hard gate counts main and side demand but fails open for missing recipes or unit mappings", () => {
  assert.match(
    hardGate,
    /jsonb_array_elements\(COALESCE\(NEW\.sides, '\[\]'::jsonb\)\)/,
  );
  assert.match(
    hardGate,
    /JOIN public\.recipes r\s*\n\s*ON r\.menu_item_id = d\.menu_item_id/,
  );
  assert.match(
    hardGate,
    /WHERE r2\.menu_item_id = d\.menu_item_id[\s\S]*AND iu\.is_active = TRUE/,
  );
  assert.match(
    hardGate,
    /WHERE r2\.menu_item_id = cl\.menu_item_id[\s\S]*AND iu\.is_active = TRUE/,
  );
  assert.match(
    hardGate,
    /ROUND\(SUM\(public\.inv_to_base_for_tenant\([\s\S]*\)\), 3\)::numeric\(15,3\) AS need_qty/,
  );
  assert.match(
    hardGate,
    /SELECT COALESCE\(ROUND\(SUM\(public\.inv_to_base_for_tenant\([\s\S]*\)\), 3\), 0\)\s*\n\s*INTO v_pending/,
  );
});

test("outcome posting fails soft on a race shortage and never partially posts", () => {
  const shortage = outcomePosting.indexOf(
    "RAISE WARNING 'insufficient_stock_at_posting:",
  );
  const movementInsert = outcomePosting.indexOf(
    "INSERT INTO public.stock_movements",
  );

  assert.ok(shortage >= 0 && movementInsert > shortage);
  assert.doesNotMatch(
    outcomePosting,
    /RAISE EXCEPTION 'insufficient_stock_ingredient/,
  );
  assert.match(
    outcomePosting,
    /RETURN jsonb_build_object\('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'insufficient_stock_at_posting'\);/,
  );
  assert.equal(
    outcomePosting.match(/WHERE r2\.menu_item_id = cl\.menu_item_id/g)?.length,
    2,
    "both the pre-check and insert loops must exclude incomplete unit mappings",
  );
  assert.match(
    outcomePosting,
    /ON CONFLICT \([\s\S]*tenant_id,[\s\S]*order_id,[\s\S]*movement_subtype,[\s\S]*ingredient_id,[\s\S]*location_id[\s\S]*DO NOTHING;/,
  );
});

test("hard gate helper is executable only by the database service path", () => {
  assert.match(
    baseline,
    /REVOKE ALL ON FUNCTION public\.enforce_branch_stock_availability\(\) FROM PUBLIC;/,
  );
  assert.match(
    baseline,
    /GRANT ALL ON FUNCTION public\.enforce_branch_stock_availability\(\) TO service_role;/,
  );
  assert.doesNotMatch(
    baseline,
    /GRANT EXECUTE ON FUNCTION public\.enforce_branch_stock_availability\(\) TO (?:anon|authenticated)/,
  );
});
