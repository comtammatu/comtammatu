-- =============================================================
-- Location Ledger Phase 2 Completion
-- Backfill remaining tables + update RPCs to dual-write location_id
--
-- Preconditions (all already applied):
--   20260417040000 — inventory_locations table + seed
--   20260417050000 — compat columns on ledger tables
--   20260416200002 — kitchen locations, backfill stock_levels/movements/sessions,
--                    location-aware create_transfer_draft/confirm_ship/GRN/stocktake
--
-- This migration completes Phase 2:
--   Part 1: Backfill stock_transfers + stock_issues location_ids
--   Part 2: Update RPCs: stock_transfer_receive, complete_stocktake,
--           confirm_stock_issue, consume_stock_for_order(+service)
--   Part 3: Validation DO block (advisory, not constraint)
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- PART 1 — BACKFILL
-- ═══════════════════════════════════════════════════════════════

-- 1a. stock_transfers.from_location_id ← from_branch default_issue
UPDATE public.stock_transfers st
SET from_location_id = il.id
FROM public.inventory_locations il
WHERE st.from_location_id IS NULL
  AND il.branch_id = st.from_branch_id
  AND il.tenant_id = st.tenant_id
  AND il.is_default_issue = true
  AND il.is_active = true;

-- 1b. stock_transfers.to_location_id ← to_branch default_receive
UPDATE public.stock_transfers st
SET to_location_id = il.id
FROM public.inventory_locations il
WHERE st.to_location_id IS NULL
  AND il.branch_id = st.to_branch_id
  AND il.tenant_id = st.tenant_id
  AND il.is_default_receive = true
  AND il.is_active = true;

-- 1c. stock_issues.source_location_id ← branch default_issue
UPDATE public.stock_issues si
SET source_location_id = il.id
FROM public.inventory_locations il
WHERE si.source_location_id IS NULL
  AND il.branch_id = si.branch_id
  AND il.tenant_id = si.tenant_id
  AND il.is_default_issue = true
  AND il.is_active = true;

-- 1d. stock_issues.target_location_id ← branch default_consumption (kitchen_use only)
UPDATE public.stock_issues si
SET target_location_id = il.id
FROM public.inventory_locations il
WHERE si.target_location_id IS NULL
  AND si.issue_type = 'kitchen_use'
  AND il.branch_id = si.branch_id
  AND il.tenant_id = si.tenant_id
  AND il.is_default_consumption = true
  AND il.is_active = true;


-- ═══════════════════════════════════════════════════════════════
-- PART 2 — RPC UPDATES
-- ═══════════════════════════════════════════════════════════════

-- ─── 2a. stock_transfer_receive: write transfer_in movements with to_location_id ───

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id BIGINT,
  p_items       JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_recv      NUMERIC(15,3);
  v_note      TEXT;
  v_cost      NUMERIC(15,2);
  v_old_q     NUMERIC(15,3);
  v_old_wac   NUMERIC(15,2);
  v_new_q     NUMERIC(15,3);
  v_new_wac   NUMERIC(15,2);
  v_key       TEXT;
  -- GL auto-post variables
  v_transfer_total NUMERIC(15,2) := 0;
  v_journal_id     BIGINT;
  v_lines          JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'confirmed_receive' THEN
    RAISE EXCEPTION 'transfer_not_in_confirmed_receive' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    v_note := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::text;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::numeric;
          v_note := (p_items -> v_key) ->> 'note';
        ELSE
          v_recv := (p_items ->> v_key)::numeric;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items
      SET quantity_received = 0, receive_note = v_note
      WHERE id = v_line.id;
      CONTINUE;
    END IF;

    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    -- *** Phase 2: write movement with to_location_id ***
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost,
      v_tr.to_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv, receive_note = v_note
    WHERE id = v_line.id;

    -- Accumulate transfer value for GL
    v_transfer_total := v_transfer_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received', received_at = now(), updated_at = now()
  WHERE id = p_transfer_id;

  -- ═══ AUTO-POST GL JOURNAL ═══
  IF v_transfer_total > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'rule_code', 'TRANSFER_INVENTORY',
      'amount', v_transfer_total,
      'line_description', 'Chuyển kho ' || v_tr.transfer_number
    ));

    v_journal_id := public.auto_post_journal(
      v_tenant,
      v_tr.to_branch_id,
      'transfer',
      p_transfer_id,
      'Nhận chuyển kho ' || v_tr.transfer_number,
      v_lines,
      now(),
      v_uid
    );

    IF v_journal_id IS NOT NULL THEN
      UPDATE public.stock_transfers
      SET journal_entry_id = v_journal_id
      WHERE id = p_transfer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received',
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) TO authenticated;


-- ─── 2b. complete_stocktake: write count_adjustment movements with location_id ───

CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_session       RECORD;
  v_line          RECORD;
  v_fresh_qty     NUMERIC(15,3);
  v_adjustment    NUMERIC(15,3);
  v_total_lines   INT := 0;
  v_adjusted      INT := 0;
  v_total_var_abs NUMERIC(15,3) := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT s.* INTO v_session
  FROM public.stocktake_sessions s
  WHERE s.id = p_session_id AND s.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id
      AND sl.tenant_id = v_tenant
      AND sl.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id AND sl.tenant_id = v_tenant
  LOOP
    v_total_lines := v_total_lines + 1;

    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh_qty
    FROM public.stock_levels stl
    WHERE stl.tenant_id = v_tenant
      AND stl.branch_id = v_session.branch_id
      AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh_qty := 0;
    END IF;

    v_adjustment := v_line.counted_quantity - v_fresh_qty;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_var_abs := v_total_var_abs + abs(v_adjustment);

      -- *** Phase 2: write movement with session's location_id ***
      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id
      ) VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        COALESCE(v_line.variance_reason, 'Stocktake #' || p_session_id::text),
        v_uid,
        v_session.location_id
      );
    END IF;
  END LOOP;

  UPDATE public.stocktake_sessions
  SET status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total_lines', v_total_lines,
    'adjusted_lines', v_adjusted,
    'total_variance_abs', v_total_var_abs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_stocktake(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_stocktake(BIGINT) TO authenticated;


-- ─── 2c. confirm_stock_issue: write movements with source_location_id ───

CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_issue   RECORD;
  v_item    RECORD;
  v_sl      NUMERIC(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_issue
  FROM public.stock_issues
  WHERE id = p_issue_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_issue_items
    WHERE issue_id = p_issue_id AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_issue.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_sl := 0;
    END IF;

    IF v_sl < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_levels
    SET current_quantity = current_quantity - v_item.quantity
    WHERE tenant_id = v_tenant
      AND branch_id = v_issue.branch_id
      AND ingredient_id = v_item.ingredient_id;

    -- *** Phase 2: write movement with source_location_id ***
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id
    ) VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      -v_item.quantity,
      v_item.unit_cost,
      COALESCE(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('ok', true, 'issue_id', p_issue_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stock_issue(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_stock_issue(BIGINT) TO authenticated;


-- ─── 2d. consume_stock_for_order: resolve default_consumption location ───

CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_order         RECORD;
  v_need          RECORD;
  v_sl            NUMERIC(15,3);
  v_total         NUMERIC(15,3);
  v_location_id   BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order FROM public.orders o
  WHERE o.id = p_order_id AND o.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id AND sm.type = 'consumption' AND sm.tenant_id = v_tenant
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed');
  END IF;

  -- *** Phase 2: resolve default_consumption location ***
  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_consumption = true
    AND il.is_active = true
  LIMIT 1;

  -- Phase 1: validate sufficient stock
  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Phase 2: insert consumption movements with location_id
  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_tenant,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text,
      v_uid,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order(BIGINT) TO authenticated;


-- ─── 2e. consume_stock_for_order_service: service-role clone with location_id ───

CREATE OR REPLACE FUNCTION public.consume_stock_for_order_service(
  p_order_id BIGINT,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor         UUID := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_order         RECORD;
  v_need          RECORD;
  v_sl            NUMERIC(15,3);
  v_total         NUMERIC(15,3);
  v_location_id   BIGINT;
BEGIN
  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND sm.tenant_id = v_order.tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed'
    );
  END IF;

  -- *** Phase 2: resolve default_consumption location ***
  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.is_default_consumption = true
    AND il.is_active = true
  LIMIT 1;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text,
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_service(BIGINT, UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- PART 3 — VALIDATION (advisory, raises NOTICE not exception)
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_null_transfers  INT;
  v_null_issues_src INT;
  v_null_movements  INT;
  v_null_sessions   INT;
  v_null_levels     INT;
BEGIN
  SELECT COUNT(*) INTO v_null_transfers
  FROM public.stock_transfers
  WHERE from_location_id IS NULL OR to_location_id IS NULL;

  SELECT COUNT(*) INTO v_null_issues_src
  FROM public.stock_issues
  WHERE source_location_id IS NULL;

  SELECT COUNT(*) INTO v_null_movements
  FROM public.stock_movements
  WHERE location_id IS NULL;

  SELECT COUNT(*) INTO v_null_sessions
  FROM public.stocktake_sessions
  WHERE location_id IS NULL;

  SELECT COUNT(*) INTO v_null_levels
  FROM public.stock_levels
  WHERE location_id IS NULL;

  RAISE NOTICE 'Phase 2 validation: transfers_null=%, issues_src_null=%, movements_null=%, sessions_null=%, levels_null=%',
    v_null_transfers, v_null_issues_src, v_null_movements, v_null_sessions, v_null_levels;

  IF v_null_transfers + v_null_issues_src + v_null_movements + v_null_sessions + v_null_levels > 0 THEN
    RAISE NOTICE 'WARNING: Some rows still have NULL location_id. Review before Migration C constraints.';
  ELSE
    RAISE NOTICE 'All location_id columns fully populated. Ready for Migration C (NOT NULL constraints).';
  END IF;
END;
$$;
