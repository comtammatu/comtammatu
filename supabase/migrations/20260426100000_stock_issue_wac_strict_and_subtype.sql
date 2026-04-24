-- =============================================================
-- Stock Issue: WAC strict override + movement_subtype discriminator
-- =============================================================
-- Team decision (2026-04-25, 4-agent debate):
--
--   D1  Label "Hao hụt kho" (consumption at CW/CK) vs "Tiêu hao"
--       (consumption at branch) derives from
--       `stock_movements.movement_subtype`, not from stored labels.
--
--   D3  `confirm_stock_issue` strict-overrides `unit_cost` from
--       `stock_levels.avg_unit_cost` read under FOR UPDATE at confirm
--       time. Caller-provided `stock_issue_items.unit_cost` is
--       discarded (overwritten) so the voucher row matches the ledger.
--       NULL WAC -> raise `wac_not_ready_for_<ingredient_id>`.
--
-- Latest prior confirm_stock_issue: 20260425000000_stock_levels_per_location.sql
-- =============================================================

-- ─── 1. Add stock_movements.movement_subtype column ───

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS movement_subtype TEXT;

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_subtype_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_subtype_check CHECK (
    movement_subtype IS NULL OR movement_subtype IN (
      'storage_loss',     -- consumption at central_warehouse / central_kitchen
      'sale_consumption', -- consumption at branch (POS recipe / manual at branch)
      'writeoff',         -- hủy hỏng / thanh lý
      'other'             -- other (khác)
    )
  );

CREATE INDEX IF NOT EXISTS idx_stock_movements_subtype
  ON public.stock_movements(movement_subtype)
  WHERE movement_subtype IS NOT NULL;

COMMENT ON COLUMN public.stock_movements.movement_subtype IS
  'Discriminator for stock_issue-originated consumption movements: '
  'storage_loss | sale_consumption | writeoff | other. '
  'Derived from (issue_type x branch_kind) at confirm_stock_issue time. '
  'NULL for non-issue movements (grn_receipt, transfer_*, production_*, ...).';

-- ─── 2. Rewrite confirm_stock_issue RPC ───

CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID   := auth.uid();
  v_tenant      BIGINT := public.auth_tenant_id();
  v_issue       RECORD;
  v_item        RECORD;
  v_branch_kind TEXT;
  v_subtype     TEXT;
  v_sl_q        NUMERIC(15,3);
  v_wac         NUMERIC(15,2);
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

  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing' USING ERRCODE = '23502';
  END IF;

  -- Pin branch kind for subtype derivation
  SELECT b.branch_kind INTO v_branch_kind
  FROM public.branches b
  WHERE b.id = v_issue.branch_id AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Derive movement_subtype from (issue_type, branch_kind)
  -- kitchen_use is retired (20260425000000 reject trigger + 2026-04-25 CHECK swap).
  v_subtype := CASE
    WHEN v_issue.issue_type = 'consumption'
         AND v_branch_kind IN ('central_warehouse', 'central_kitchen')
      THEN 'storage_loss'
    WHEN v_issue.issue_type = 'consumption'
      THEN 'sale_consumption'
    WHEN v_issue.issue_type = 'writeoff'
      THEN 'writeoff'
    WHEN v_issue.issue_type = 'other'
      THEN 'other'
    ELSE NULL
  END;

  FOR v_item IN
    SELECT * FROM public.stock_issue_items
    WHERE issue_id = p_issue_id AND tenant_id = v_tenant
  LOOP
    -- Strict WAC override: read current_quantity + avg_unit_cost under FOR UPDATE lock
    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_sl_q, v_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_issue.branch_id
      AND sl.location_id   = v_issue.source_location_id
      AND sl.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    IF v_sl_q < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    -- Sync voucher row with ledger (voucher unit_cost = ledger WAC)
    UPDATE public.stock_issue_items
    SET unit_cost = v_wac
    WHERE id = v_item.id AND tenant_id = v_tenant;

    -- Movement: trg_update_stock_on_movement decrements stock_levels
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, movement_subtype,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id
    ) VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      v_subtype,
      -v_item.quantity,
      v_wac,
      COALESCE(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'ok', true,
    'issue_id', p_issue_id,
    'movement_subtype', v_subtype
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stock_issue(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_stock_issue(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.confirm_stock_issue(BIGINT) IS
  'Atomically confirm a stock_issue. Strict WAC override from '
  'stock_levels.avg_unit_cost (FOR UPDATE). Derives '
  'stock_movements.movement_subtype from (issue_type x branch_kind). '
  'Raises wac_not_ready_for_<id> or insufficient_stock_for_<id>.';
