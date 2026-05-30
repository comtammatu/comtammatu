-- =============================================================
-- S5-a Patch — close_recount_round: propagate round-1 is_final
--
-- Original S5 close_recount_round updated is_final only for
-- rows at round_no = p_round_no. Round-1 row's is_final stayed
-- false even after a later round converged (needs_recount=false).
-- finalize_stocktake then rejected the session because round-1
-- lines "still not final".
--
-- Fix: when p_round_no > 1, after marking round-N rows and
-- writing median, also flip round-1.is_final=true AND
-- round-1.needs_recount=false for any ingredient whose latest
-- round has converged.
--
-- Caught during Phase B pilot walkthrough 2026-04-24 when a
-- 50%-variant sườn line recounted at 1.9 (vs system 2 = 5%)
-- and finalize raised "cannot finalize: 1 round-1 line still
-- not final".
-- =============================================================

CREATE OR REPLACE FUNCTION public.close_recount_round(p_session_id BIGINT, p_round_no SMALLINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD; v_need INT := 0; v_final INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_recount') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_round_no <> v_ss.current_round THEN RAISE EXCEPTION 'round % does not match current_round %', p_round_no, v_ss.current_round USING ERRCODE = '22023'; END IF;

  WITH latest AS (
    SELECT sl.id, sl.ingredient_id, sl.counted_quantity, sl.system_quantity, sl.abc_class,
      COALESCE(sl.counted_quantity, 0) - COALESCE(sl.system_quantity, 0) AS delta,
      CASE WHEN sl.system_quantity IS NULL OR sl.system_quantity = 0 THEN NULL
           ELSE ABS(COALESCE(sl.counted_quantity, 0) - sl.system_quantity) / sl.system_quantity END AS pct
    FROM public.stocktake_lines sl WHERE sl.session_id = p_session_id AND sl.round_no = p_round_no
  ),
  decided AS (
    SELECT l.*,
      CASE WHEN l.counted_quantity IS NULL THEN false
           WHEN l.abc_class = 'A' THEN
                COALESCE(l.pct, 0) > v_ss.variance_threshold_pct_class_a / 100.0
             OR ABS(l.delta) > v_ss.variance_threshold_vnd_class_a / GREATEST((SELECT avg_unit_cost FROM public.stock_levels WHERE ingredient_id = l.ingredient_id AND branch_id = v_ss.branch_id LIMIT 1), 1)
           ELSE
                COALESCE(l.pct, 0) > v_ss.variance_threshold_pct / 100.0
             OR ABS(l.delta) > v_ss.variance_threshold_vnd / GREATEST((SELECT avg_unit_cost FROM public.stock_levels WHERE ingredient_id = l.ingredient_id AND branch_id = v_ss.branch_id LIMIT 1), 1)
      END AS needs_rc FROM latest l
  )
  UPDATE public.stocktake_lines sl SET needs_recount = d.needs_rc, is_final = NOT d.needs_rc
  FROM decided d WHERE sl.id = d.id;

  IF p_round_no > 1 THEN
    WITH converged AS (
      SELECT DISTINCT sl.ingredient_id
      FROM public.stocktake_lines sl
      WHERE sl.session_id = p_session_id AND sl.round_no = p_round_no AND NOT sl.needs_recount
    ),
    medians AS (
      SELECT sl.ingredient_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY sl.counted_quantity) AS med
      FROM public.stocktake_lines sl
      WHERE sl.session_id = p_session_id AND sl.counted_quantity IS NOT NULL
        AND sl.ingredient_id IN (SELECT ingredient_id FROM converged)
      GROUP BY sl.ingredient_id HAVING COUNT(*) >= 2
    )
    UPDATE public.stocktake_lines sl
       SET counted_quantity = m.med, is_final = true, needs_recount = false
    FROM medians m
    WHERE sl.session_id = p_session_id AND sl.ingredient_id = m.ingredient_id AND sl.round_no = 1;
  END IF;

  SELECT COUNT(*) FILTER (WHERE needs_recount), COUNT(*) FILTER (WHERE is_final) INTO v_need, v_final
  FROM public.stocktake_lines WHERE session_id = p_session_id AND round_no = p_round_no;

  IF v_need > 0 AND v_ss.current_round < 4 THEN
    UPDATE public.stocktake_sessions SET current_round = v_ss.current_round + 1 WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('round_no', p_round_no, 'needs_recount_count', v_need, 'final_count', v_final,
    'next_round', CASE WHEN v_need > 0 AND v_ss.current_round < 4 THEN v_ss.current_round + 1 ELSE NULL END,
    'round_4_escalation_required', v_need > 0 AND v_ss.current_round >= 3);
END; $function$;

GRANT EXECUTE ON FUNCTION public.close_recount_round(BIGINT, SMALLINT) TO authenticated;
