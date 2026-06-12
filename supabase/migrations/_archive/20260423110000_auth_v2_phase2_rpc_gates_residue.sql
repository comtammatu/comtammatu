-- =============================================================
-- Auth v2 — Phase 2-RPC α4a residue cleanup.
--
-- Migration 20260423090000_auth_v2_phase2_rpc_gates.sql covered the main gate
-- swaps but left three Inventory/Production RPCs still calling auth_role() in
-- the body:
--
--   1) confirm_production_order — branch-scope check for branch_manager
--   2) cancel_production_order  — branch-scope check for branch/production mgr
--   3) stock_transfer_list_branches — role whitelist on SELECT
--
-- Fix:
--   • Replace the legacy branch_manager/production_manager branch guards with
--     has_permission(<order branch>, 'inventory:production_confirm'). Branch
--     grants are per-branch, so this is strictly stronger than the old check
--     (tenant-wide roles still pass via the branch-scoped owner/super_manager
--     bypass inside has_permission()).
--   • Replace stock_transfer_list_branches role whitelist with
--     has_permission_any('inventory:read'). The picker is a list surface;
--     per-branch authz on create_stock_transfer_draft remains the real gate.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- cancel_production_order
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_order  RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.production_orders
  WHERE id = p_order_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Per-branch authz: owner/super_manager bypass inside has_permission().
  IF NOT public.has_permission(v_order.branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;

  UPDATE public.production_orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'cancelled');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- confirm_production_order
-- Body preserved; only the two gate checks are rewritten in terms of
-- has_permission(branch, 'inventory:production_confirm').
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_order RECORD; v_item RECORD; v_recipe RECORD;
  v_raw_need NUMERIC(15,3); v_output_cost NUMERIC(15,2);
  v_old_q NUMERIC(15,3); v_old_wac NUMERIC(15,2); v_new_q NUMERIC(15,3); v_new_wac NUMERIC(15,2);
  v_need_map JSONB := '{}'::JSONB; v_cost_map JSONB := '{}'::JSONB;
  v_key TEXT; v_need_qty NUMERIC(15,3); v_cost_total NUMERIC(15,2); v_has_recipe BOOLEAN;
  v_total_consumption NUMERIC(15,2) := 0; v_total_output NUMERIC(15,2) := 0;
  v_journal_id BIGINT; v_lines JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT po.*, b.branch_kind INTO v_order
  FROM public.production_orders po JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = p_order_id AND po.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_order.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;

  -- Per-branch authz: owner/super_manager bypass inside has_permission().
  IF NOT public.has_permission(v_order.branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_order_items poi
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'production_order_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    IF v_item.item_kind <> 'finished_good' THEN
      RAISE EXCEPTION 'production_item_must_be_finished_good' USING ERRCODE = '23514';
    END IF;
    v_output_cost := 0; v_has_recipe := FALSE;
    FOR v_recipe IN
      SELECT pr.ingredient_id, pr.quantity, pr.yield_factor,
             COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
      FROM public.production_recipes pr
      JOIN public.ingredients ing ON ing.id = pr.ingredient_id
      LEFT JOIN public.stock_levels sl
        ON sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = pr.ingredient_id
      WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = v_item.finished_good_id
    LOOP
      v_has_recipe := TRUE;
      v_raw_need := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      v_key := v_recipe.ingredient_id::text;
      v_need_map := jsonb_set(v_need_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need), TRUE);
      v_cost_map := jsonb_set(v_cost_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_cost_map ->> v_key)::numeric, 0) + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0))), TRUE);
      v_output_cost := v_output_cost + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;
    IF NOT v_has_recipe THEN
      RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
    END IF;
    IF v_output_cost < 0 THEN
      RAISE EXCEPTION 'production_cost_invalid' USING ERRCODE = '22023';
    END IF;
    v_cost_total := v_output_cost;
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2) ELSE 0 END
    WHERE id = v_item.id;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    LEFT JOIN public.stock_levels sl ON sl.tenant_id = v_tenant
       AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = need.ingredient_id::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < need.need_qty::NUMERIC
  ) THEN
    RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key, v_need_qty IN SELECT key, value::NUMERIC(15,3) FROM jsonb_each_text(v_need_map) LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = v_key::BIGINT;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;
    INSERT INTO public.stock_movements (tenant_id, branch_id, ingredient_id, type, quantity_change,
                                        reason, created_by, production_order_id, unit_cost)
    VALUES (v_tenant, v_order.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
            'Production ' || v_order.production_number, v_uid, p_order_id, COALESCE(v_old_wac, 0));
    v_total_consumption := v_total_consumption + (v_need_qty * COALESCE(v_old_wac, 0));
  END LOOP;

  FOR v_item IN
    SELECT poi.*, fg.item_kind FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    v_cost_total := COALESCE(v_item.unit_cost_at_production, 0);
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = v_item.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;
    INSERT INTO public.stock_movements (tenant_id, branch_id, ingredient_id, type, quantity_change,
                                        reason, created_by, production_order_id, unit_cost)
    VALUES (v_tenant, v_order.branch_id, v_item.finished_good_id, 'production_output', v_item.quantity,
            'Production ' || v_order.production_number, v_uid, p_order_id, v_cost_total);
    v_new_q := COALESCE(v_old_q, 0) + v_item.quantity;
    IF v_new_q > 0 THEN
      v_new_wac := (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_item.quantity * v_cost_total) / v_new_q;
    ELSE
      v_new_wac := v_cost_total;
    END IF;
    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_order.branch_id AND sl.ingredient_id = v_item.finished_good_id;
    UPDATE public.ingredients SET unit_cost = v_cost_total, updated_at = now()
    WHERE id = v_item.finished_good_id AND tenant_id = v_tenant;
    v_total_output := v_total_output + (v_item.quantity * v_cost_total);
  END LOOP;

  UPDATE public.production_orders SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  v_lines := '[]'::JSONB;
  IF v_total_consumption > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_CONSUME', 'amount', v_total_consumption,
      'line_description', 'NVL sản xuất ' || v_order.production_number));
  END IF;
  IF v_total_output > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_OUTPUT', 'amount', v_total_output,
      'line_description', 'Thành phẩm ' || v_order.production_number));
  END IF;
  IF jsonb_array_length(v_lines) > 0 THEN
    v_journal_id := public.auto_post_journal(v_tenant, v_order.branch_id, 'production', p_order_id,
      'Sản xuất ' || v_order.production_number, v_lines, now(), v_uid);
    IF v_journal_id IS NOT NULL THEN
      UPDATE public.production_orders SET journal_entry_id = v_journal_id WHERE id = p_order_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed', 'journal_entry_id', v_journal_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- stock_transfer_list_branches — has_permission_any('inventory:read')
--
-- The previous role whitelist gated the SELECT surface wholesale. The list is
-- only a branch picker for building transfers; the real authz lives on
-- create_stock_transfer_draft (per-branch has_permission('inventory:transfer_create')).
-- Owner/super_manager bypass is preserved by has_permission_any().
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.stock_transfer_list_branches();

CREATE FUNCTION public.stock_transfer_list_branches()
RETURNS TABLE (
  id          BIGINT,
  name        TEXT,
  branch_kind TEXT,
  is_active   BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT b.id, b.name, b.branch_kind, b.is_active
  FROM public.branches b
  WHERE b.tenant_id = public.auth_tenant_id()
    AND b.is_active = TRUE
    AND public.has_permission_any('inventory:read')
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION public.stock_transfer_list_branches() TO authenticated;
