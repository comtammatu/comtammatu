-- =============================================================
-- GL Auto-Posting: Phase 1.5 — Extend confirm_goods_receipt_note()
-- On GRN confirmation, auto-post: Dr 152 (Inventory) / Cr 331 (AP)
-- Same signature — only internal logic extended.
-- =============================================================

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_grn           RECORD;
  v_item          RECORD;
  v_branch        BIGINT;
  v_old_q         NUMERIC(15,3);
  v_old_wac       NUMERIC(15,2);
  v_recv          NUMERIC(15,3);
  v_cost          NUMERIC(15,2);
  v_new_q         NUMERIC(15,3);
  v_new_wac       NUMERIC(15,2);
  -- GL auto-post variables
  v_inventory_total NUMERIC(15,2) := 0;
  v_journal_id      BIGINT;
  v_lines           JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  SELECT b.id INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id AND b.tenant_id = v_tenant AND b.is_tenant = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_tenant_branch' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    IF v_item.quality_status = 'rejected' OR v_item.received_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_recv := v_item.received_quantity;
    v_cost := v_item.unit_cost;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost
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
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;

    -- Accumulate total inventory value for GL posting
    v_inventory_total := v_inventory_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  -- ═══ AUTO-POST GL JOURNAL ═══
  IF v_inventory_total > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'rule_code', 'GRN_INVENTORY',
        'amount', v_inventory_total,
        'line_description', 'Nhập kho GRN #' || v_grn.grn_number
      )
    );

    v_journal_id := public.auto_post_journal(
      v_tenant,
      v_grn.branch_id,
      'purchase',
      p_grn_id,
      'Nhập kho phiếu ' || v_grn.grn_number,
      v_lines,
      now(),
      v_uid
    );

    -- Link journal to GRN
    IF v_journal_id IS NOT NULL THEN
      UPDATE public.goods_received_notes
      SET journal_entry_id = v_journal_id
      WHERE id = p_grn_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(BIGINT) TO authenticated;
