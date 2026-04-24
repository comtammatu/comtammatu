-- =============================================================
-- S9-b Patch — grn_is_auto_approvable: array_append fix
--
-- PostgreSQL operator resolution for `TEXT[] || 'literal'` is
-- ambiguous when the array is empty (ARRAY[]::TEXT[]):
-- the planner picks array_cat(anyarray, anyarray) and then
-- fails to parse the string literal as an array literal.
--
-- Fix: use array_append(v_reasons, 'literal') which binds
-- unambiguously to (anyarray, anyelement).
--
-- Caught during Phase B pilot walkthrough 2026-04-24 when
-- evaluator was invoked on GRN-PILOT-001 with 0 prior supplier
-- history → first failing condition tried to append 'no_po' /
-- 'variance_tier_gt1' and raised 22P02.
-- =============================================================

CREATE OR REPLACE FUNCTION public.grn_is_auto_approvable(p_grn_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id(); v_grn RECORD; v_tz TEXT; v_local_time TIMESTAMP; v_win RECORD;
  v_in_base BOOLEAN := false; v_in_ext BOOLEAN := false; v_in_window BOOLEAN;
  v_total_grn NUMERIC; v_total_po NUMERIC; v_line_qty_max NUMERIC; v_line_prc_max NUMERIC;
  v_bad_qc INT; v_bad_review INT; v_bad_var INT; v_sup_hist INT; v_trust NUMERIC;
  v_cap NUMERIC := 10000000;
  v_c1 BOOLEAN; v_c2 BOOLEAN; v_c3 BOOLEAN; v_c4 BOOLEAN;
  v_c5 BOOLEAN; v_c6 BOOLEAN; v_c7 BOOLEAN; v_c8 BOOLEAN;
  v_hard_ok BOOLEAN; v_soft_ok BOOLEAN; v_approved BOOLEAN;
  v_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_grn FROM public.goods_received_notes WHERE id = p_grn_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'grn not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'inventory:read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT timezone INTO v_tz FROM public.branches WHERE id = v_grn.branch_id;
  IF v_tz IS NULL THEN v_tz := 'Asia/Ho_Chi_Minh'; END IF;
  v_local_time := now() AT TIME ZONE v_tz;
  SELECT enabled, start_time, end_time INTO v_win FROM public.branch_express_window WHERE branch_id = v_grn.branch_id;
  IF FOUND AND v_win.enabled THEN
    v_in_base := (v_local_time::TIME >= v_win.start_time AND v_local_time::TIME < v_win.end_time);
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.grn_express_extend_audit WHERE branch_id = v_grn.branch_id AND extended_until > now() AND created_at > now() - INTERVAL '1 day') INTO v_in_ext;
  v_in_window := v_in_base OR v_in_ext;

  v_c1 := v_grn.po_id IS NOT NULL;
  IF NOT v_c1 THEN v_reasons := array_append(v_reasons, 'no_po'); END IF;

  SELECT COUNT(*) INTO v_bad_var FROM public.grn_items WHERE grn_id = p_grn_id AND (variance_tier IS NULL OR variance_tier > 1);
  v_c2 := v_bad_var = 0;
  IF NOT v_c2 THEN v_reasons := array_append(v_reasons, 'variance_tier_gt1'); END IF;

  IF v_c1 THEN
    SELECT COALESCE(SUM(received_quantity * unit_cost), 0) INTO v_total_grn FROM public.grn_items WHERE grn_id = p_grn_id;
    SELECT COALESCE(SUM(line_total), 0) INTO v_total_po FROM public.purchase_order_items WHERE po_id = v_grn.po_id;
    SELECT COALESCE(MAX(ABS(gi.received_quantity - gi.po_quantity) / NULLIF(gi.po_quantity, 0)), 0) INTO v_line_qty_max FROM public.grn_items gi WHERE gi.grn_id = p_grn_id;
    SELECT COALESCE(MAX(ABS(gi.unit_cost - gi.po_unit_price) / NULLIF(gi.po_unit_price, 0)), 0) INTO v_line_prc_max FROM public.grn_items gi WHERE gi.grn_id = p_grn_id;
    v_c3 := (v_total_po > 0 AND ABS(v_total_grn - v_total_po) / v_total_po <= 0.03) AND v_line_qty_max <= 0.10 AND v_line_prc_max <= 0.15;
  ELSE
    v_c3 := false;
  END IF;
  IF NOT v_c3 THEN v_reasons := array_append(v_reasons, 'line_totals_diff'); END IF;

  SELECT COUNT(*) INTO v_bad_qc FROM public.grn_items WHERE grn_id = p_grn_id
    AND (quality_status IN ('rejected','partial') OR rejected_quantity > 0 OR short_delivery_action IS NOT NULL);
  v_c4 := v_bad_qc = 0;
  IF NOT v_c4 THEN v_reasons := array_append(v_reasons, 'quality_issue'); END IF;

  IF v_total_grn IS NULL THEN
    SELECT COALESCE(SUM(received_quantity * unit_cost), 0) INTO v_total_grn FROM public.grn_items WHERE grn_id = p_grn_id;
  END IF;
  v_c5 := v_total_grn <= v_cap;
  IF NOT v_c5 THEN v_reasons := array_append(v_reasons, 'value_cap'); END IF;

  SELECT COUNT(*) INTO v_sup_hist FROM public.goods_received_notes WHERE supplier_id = v_grn.supplier_id
    AND status = 'confirmed' AND received_date > now() - INTERVAL '90 days' AND id <> p_grn_id;
  v_c6 := v_sup_hist >= 3;
  IF NOT v_c6 THEN v_reasons := array_append(v_reasons, 'supplier_history_lt3'); END IF;

  SELECT COUNT(*) INTO v_bad_review FROM public.grn_items gi WHERE gi.grn_id = p_grn_id
    AND public.inventory_requires_manual_review(gi.ingredient_id) = true;
  v_c7 := v_bad_review = 0;
  IF NOT v_c7 THEN v_reasons := array_append(v_reasons, 'ingredient_manual_review'); END IF;

  v_trust := public.compute_user_trust_score(v_grn.created_by, v_grn.branch_id);
  v_c8 := v_trust >= 70;
  IF NOT v_c8 THEN v_reasons := array_append(v_reasons, 'trust_score_lt70'); END IF;

  v_hard_ok := v_c1 AND v_c3 AND v_c4 AND v_c5 AND v_c7 AND v_c8;
  v_soft_ok := v_c2 AND v_c6;
  v_approved := v_hard_ok AND (v_soft_ok OR v_in_window);

  RETURN jsonb_build_object('grn_id', p_grn_id, 'approved', v_approved, 'hard_ok', v_hard_ok, 'soft_ok', v_soft_ok,
    'in_window', v_in_window, 'in_base_window', v_in_base, 'in_extended_window', v_in_ext,
    'total_grn_value', v_total_grn, 'total_po_value', v_total_po, 'supplier_grn_count_90d', v_sup_hist,
    'trust_score', v_trust,
    'conditions', jsonb_build_object('c1_has_po', v_c1, 'c2_variance_ok', v_c2, 'c3_line_totals_diff', v_c3,
      'c4_no_quality_issue', v_c4, 'c5_value_cap', v_c5, 'c6_supplier_history', v_c6,
      'c7_no_manual_review', v_c7, 'c8_trust_score_ok', v_c8),
    'failed_reasons', to_jsonb(v_reasons), 'evaluated_at', now());
END; $function$;

GRANT EXECUTE ON FUNCTION public.grn_is_auto_approvable(BIGINT) TO authenticated;
