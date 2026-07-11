import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/20260706085000_pos_stock_outcome_to_kitchen.sql",
  ),
  "utf8",
);

const archiveMigration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migration-archive/20260705160000_single_switch_hard_stock_gate.sql",
  ),
  "utf8",
);

function sqlFunction(name: string, markerEnd: RegExp | string): string {
  const startPattern = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`,
  );
  
  // 1. Try finding in the new migration first
  let startMatch = startPattern.exec(migration);
  let src = migration;
  
  // 2. Fallback to archive migration for unchanged functions
  if (!startMatch) {
    startMatch = startPattern.exec(archiveMigration);
    src = archiveMigration;
  }
  
  if (!startMatch) return "";
  
  const rest = src.slice(startMatch.index);
  const endMatch =
    typeof markerEnd === "string"
      ? rest.indexOf(markerEnd)
      : rest.search(markerEnd);
  if (endMatch < 0) return rest;
  return rest.slice(
    0,
    endMatch + (typeof markerEnd === "string" ? markerEnd.length : 0),
  );
}

test("get_branch_menu_daily_limits_for_pos: gate_eff collapses to the single posting flag", () => {
  const fn = sqlFunction("get_branch_menu_daily_limits_for_pos", "\n$$;");

  assert.match(
    fn,
    /public\.is_feature_enabled\(p_branch_id, 'pos_stock_outcome_posting'\) AS gate_eff/,
  );
  assert.doesNotMatch(fn, /pos_stock_availability_gate/);
  assert.doesNotMatch(fn, /AND public\.is_feature_enabled/);
});

test("list_branch_menu_daily_limits: gate_eff collapses to the single posting flag", () => {
  const fn = sqlFunction("list_branch_menu_daily_limits", "\nEND;\n$$;");

  assert.match(
    fn,
    /v_gate_eff := public\.is_feature_enabled\(p_branch_id, 'pos_stock_outcome_posting'\);/,
  );
  assert.doesNotMatch(fn, /pos_stock_availability_gate/);
  assert.doesNotMatch(fn, /AND public\.is_feature_enabled/);
});

test("enforce_branch_stock_availability trigger: created and fires after the daily-limit trigger (name-ordering safe)", () => {
  assert.match(
    migration,
    /CREATE (?:OR REPLACE )?FUNCTION public\.enforce_branch_stock_availability\(\) RETURNS trigger/,
  );
  // Trigger declaration is verified against the archive migration since it wasn't modified
  assert.match(
    archiveMigration,
    /CREATE TRIGGER trg_enforce_stock_availability AFTER INSERT ON public\.order_items FOR EACH ROW EXECUTE FUNCTION public\.enforce_branch_stock_availability\(\);/,
  );

  // "trg_enforce_branch_menu_daily_limit" < "trg_enforce_stock_availability"
  // alphabetically ("branch" < "stock"), so Postgres fires the quota trigger
  // first — this trigger's name must sort after it.
  assert.ok(
    "trg_enforce_branch_menu_daily_limit" < "trg_enforce_stock_availability",
    "trigger name must sort after trg_enforce_branch_menu_daily_limit",
  );
});

test("enforce_branch_stock_availability: GUC skip-hatch, warehouse pool, no-recipe contributes nothing, P0001 error", () => {
  const fn = sqlFunction("enforce_branch_stock_availability", "\n$$;");

  assert.match(
    fn,
    /IF COALESCE\(current_setting\('comtammatu\.skip_quota_enforcement', true\), 'false'\) = 'true' THEN\s*\n\s*RETURN NEW;/,
  );
  assert.match(
    fn,
    /IF NOT public\.is_feature_enabled\(v_branch_id, 'pos_stock_outcome_posting'\) THEN/,
  );
  assert.match(fn, /il\.location_kind = 'kitchen'/);
  assert.match(fn, /il\.is_active = TRUE/);

  // Demand explosion joins recipes — a menu item with zero recipe lines never
  // enters row_demand's JOIN output, so it contributes no demand (fail-open).
  assert.match(
    fn,
    /JOIN public\.recipes r\s*\n\s*ON r\.menu_item_id = d\.menu_item_id/,
  );

  assert.match(
    fn,
    /RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need\.ingredient_id\s*\n\s*USING ERRCODE = 'P0001'/,
  );
});

test("enforce_branch_stock_availability: measures the SAME single warehouse location the posting fn deducts from", () => {
  const fn = sqlFunction("enforce_branch_stock_availability", "\n$$;");

  // Location resolution identical to post_pos_sale_consumption_if_ready:
  // same predicate, same ORDER BY/LIMIT 1, no join across every location.
  assert.match(
    fn,
    /SELECT il\.id\s*\n\s*INTO v_location_id\s*\n\s*FROM public\.inventory_locations il\s*\n\s*WHERE il\.branch_id = v_branch_id\s*\n\s*AND il\.tenant_id = v_tenant_id\s*\n\s*AND il\.location_kind = 'kitchen'\s*\n\s*AND il\.is_active = TRUE\s*\n\s*ORDER BY il\.is_default_issue DESC, il\.sort_order NULLS LAST, il\.id\s*\n\s*LIMIT 1;/,
  );

  // Both the lock and the on_hand SUM are scoped to that single location_id —
  // no JOIN inventory_locations / all-warehouse-locations variant remains.
  assert.match(
    fn,
    /FROM public\.stock_levels sl\s*\n\s*WHERE sl\.tenant_id = v_tenant_id\s*\n\s*AND sl\.branch_id = v_branch_id\s*\n\s*AND sl\.ingredient_id = v_need\.ingredient_id\s*\n\s*AND sl\.location_id = v_location_id\s*\n\s*FOR UPDATE OF sl;/,
  );
  assert.match(
    fn,
    /SELECT COALESCE\(SUM\(sl\.current_quantity\), 0\)\s*\n\s*INTO v_on_hand\s*\n\s*FROM public\.stock_levels sl\s*\n\s*WHERE sl\.tenant_id = v_tenant_id\s*\n\s*AND sl\.branch_id = v_branch_id\s*\n\s*AND sl\.ingredient_id = v_need\.ingredient_id\s*\n\s*AND sl\.location_id = v_location_id;/,
  );

  assert.doesNotMatch(fn, /JOIN public\.inventory_locations il ON il\.id = sl\.location_id/);
  assert.doesNotMatch(fn, /FOR UPDATE;/);
});

test("enforce_branch_stock_availability: broken-unit-config items (D064 §2) contribute nothing, mirroring compute_menu_item_stock_capacity", () => {
  const fn = sqlFunction("enforce_branch_stock_availability", "\n$$;");

  const missingConfigExclusion =
    /NOT EXISTS \(\s*\n\s*SELECT 1\s*\n\s*FROM public\.recipes r2\s*\n\s*WHERE r2\.menu_item_id = d\.menu_item_id\s*\n\s*AND r2\.tenant_id = v_tenant_id\s*\n\s*AND r2\.entry_unit_id IS NOT NULL\s*\n\s*AND NOT EXISTS \(\s*\n\s*SELECT 1\s*\n\s*FROM public\.ingredient_units iu\s*\n\s*WHERE iu\.tenant_id = v_tenant_id\s*\n\s*AND iu\.ingredient_id = r2\.ingredient_id\s*\n\s*AND iu\.unit_id = r2\.entry_unit_id\s*\n\s*AND iu\.is_active = TRUE\s*\n\s*\)\s*\n\s*\)/;
  assert.match(fn, missingConfigExclusion);

  // The pending-demand subquery applies the identical exclusion (need and
  // pending must use the same filter, keyed on cl.menu_item_id there).
  const pendingMissingConfigExclusion =
    /NOT EXISTS \(\s*\n\s*SELECT 1\s*\n\s*FROM public\.recipes r2\s*\n\s*WHERE r2\.menu_item_id = cl\.menu_item_id\s*\n\s*AND r2\.tenant_id = v_tenant_id\s*\n\s*AND r2\.entry_unit_id IS NOT NULL/;
  assert.match(fn, pendingMissingConfigExclusion);
});

test("enforce_branch_stock_availability: need_qty and pending are rounded to 3dp, matching the posting fn", () => {
  const fn = sqlFunction("enforce_branch_stock_availability", "\n$$;");

  assert.match(
    fn,
    /ROUND\(SUM\(public\.inv_to_base_for_tenant\(\s*\n\s*v_tenant_id,\s*\n\s*r\.ingredient_id,\s*\n\s*r\.entry_unit_id,\s*\n\s*d\.quantity \* r\.quantity \/ r\.yield_factor\s*\n\s*\)\), 3\)::numeric\(15,3\) AS need_qty/,
  );
  assert.match(
    fn,
    /SELECT COALESCE\(ROUND\(SUM\(public\.inv_to_base_for_tenant\(\s*\n\s*v_tenant_id,\s*\n\s*r\.ingredient_id,\s*\n\s*r\.entry_unit_id,\s*\n\s*cl\.quantity \* r\.quantity \/ r\.yield_factor\s*\n\s*\)\), 3\), 0\)\s*\n\s*INTO v_pending/,
  );
});

test("enforce_branch_stock_availability: security-definer static gate (REVOKE from browser roles)", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.enforce_branch_stock_availability\(\) FROM PUBLIC;/,
  );
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.enforce_branch_stock_availability\(\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.enforce_branch_stock_availability\(\) TO service_role;/,
  );
});

test("post_pos_sale_consumption_if_ready: shortage at posting no longer RAISEs — returns insufficient_stock_at_posting instead", () => {
  const fn = sqlFunction("post_pos_sale_consumption_if_ready", "\n$_$;");

  assert.doesNotMatch(
    fn,
    /RAISE EXCEPTION 'insufficient_stock_ingredient/,
  );
  assert.match(
    fn,
    /RAISE WARNING 'insufficient_stock_at_posting: order %, ingredient %', p_order_id, v_need\.ingredient_id;/,
  );
  assert.match(
    fn,
    /RETURN jsonb_build_object\('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'insufficient_stock_at_posting'\);/,
  );
});

test("post_pos_sale_consumption_if_ready: broken-unit-config items excluded from BOTH consumption loops — never raises recipe_unit_conversion_missing on the payment path", () => {
  const fn = sqlFunction("post_pos_sale_consumption_if_ready", "\n$_$;");

  const missingConfigExclusion =
    /WHERE NOT EXISTS \(\s*\n\s*SELECT 1\s*\n\s*FROM public\.recipes r2\s*\n\s*WHERE r2\.menu_item_id = cl\.menu_item_id\s*\n\s*AND r2\.tenant_id = v_order\.tenant_id\s*\n\s*AND r2\.entry_unit_id IS NOT NULL\s*\n\s*AND NOT EXISTS \(\s*\n\s*SELECT 1\s*\n\s*FROM public\.ingredient_units iu\s*\n\s*WHERE iu\.tenant_id = v_order\.tenant_id\s*\n\s*AND iu\.ingredient_id = r2\.ingredient_id\s*\n\s*AND iu\.unit_id = r2\.entry_unit_id\s*\n\s*AND iu\.is_active = TRUE\s*\n\s*\)\s*\n\s*\)\s*\n\s*GROUP BY r\.ingredient_id/g;

  const occurrences = fn.match(missingConfigExclusion) ?? [];
  assert.equal(
    occurrences.length,
    2,
    "expected the missing-config exclusion in both the pre-check loop and the insert loop",
  );
});

test("flag row cleanup: pos_stock_availability_gate rows are deleted", () => {
  assert.match(
    archiveMigration,
    /DELETE FROM public\.branch_feature_flags WHERE flag_key = 'pos_stock_availability_gate';/,
  );
});
