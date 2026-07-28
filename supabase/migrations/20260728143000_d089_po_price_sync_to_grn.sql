-- D089: PO commercial price authority → sync into grn_items.unit_cost on approve.
-- Depends on D088 confirm gate + create_purchase_order_from_grn
-- (20260728141000_d088_grn_po_confirm_gate.sql).
-- Optional local/staging inventory wipe is NOT in this migration.
-- Do not apply to production without Environment Registry check + owner delegation.

CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_po record;
  v_synced_lines integer := 0;
  v_missing_price integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id, branch_id, po_number, status
    INTO v_po
    FROM public.purchase_orders
   WHERE id = p_po_id
     AND tenant_id = v_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_purchase_order: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_approve') THEN
    RAISE EXCEPTION 'approve_purchase_order: forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid status transition'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.purchase_order_items
     WHERE tenant_id = v_tenant_id
       AND po_id = v_po.id
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: PO has no lines'
      USING ERRCODE = 'check_violation';
  END IF;

  -- D089: commercial price must be set on every receivable PO line before approve.
  SELECT COUNT(*)::integer
    INTO v_missing_price
    FROM public.purchase_order_items poi
   WHERE poi.tenant_id = v_tenant_id
     AND poi.po_id = v_po.id
     AND poi.quantity > 0
     AND (poi.unit_price_est IS NULL OR poi.unit_price_est <= 0);

  IF v_missing_price > 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: unit_price_est required on all lines'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_orders
     SET status = 'sent',
         updated_at = now()
   WHERE id = v_po.id
     AND tenant_id = v_tenant_id;

  -- D089 Option B: sync PO unit_price_est → linked draft GRN receipt unit_cost.
  WITH linked_grn AS (
    SELECT g.id AS grn_id
      FROM public.goods_received_notes g
     WHERE g.tenant_id = v_tenant_id
       AND g.po_id = v_po.id
       AND g.status = 'draft'
  ),
  synced AS (
    UPDATE public.grn_items gi
       SET unit_cost = poi.unit_price_est,
           po_unit_price = poi.unit_price_est,
           total_cost = ROUND(
             (gi.received_quantity - COALESCE(gi.rejected_quantity, 0))
             * poi.unit_price_est,
             2
           )
      FROM linked_grn lg
      JOIN public.purchase_order_items poi
        ON poi.tenant_id = v_tenant_id
       AND poi.po_id = v_po.id
       AND poi.ingredient_id = gi.ingredient_id
     WHERE gi.tenant_id = v_tenant_id
       AND gi.grn_id = lg.grn_id
       AND gi.quality_status <> 'rejected'
       AND (gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) > 0
    RETURNING gi.id
  )
  SELECT COUNT(*)::integer INTO v_synced_lines FROM synced;

  PERFORM public.log_audit(
    'inventory.po.approved',
    'purchase_order',
    v_po.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'sent',
      'branch_id', v_po.branch_id,
      'po_number', v_po.po_number,
      'grn_unit_cost_synced_lines', v_synced_lines
    )
  );

  RETURN jsonb_build_object(
    'id', v_po.id,
    'status', 'sent',
    'grn_unit_cost_synced_lines', v_synced_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_order(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_purchase_order(bigint) IS
  'Approve PO draft→sent. D089: requires unit_price_est on all lines; syncs commercial price into linked draft GRN grn_items.unit_cost and po_unit_price.';

-- Seed PO prices as NULL when GRN draft has placeholder unit_cost (warehouse did not enter price).
CREATE OR REPLACE FUNCTION public.create_purchase_order_from_grn(p_grn_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_po_id bigint;
  v_display text;
  v_line_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission_any('procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.*
  INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id
    AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_grn.po_id IS NOT NULL THEN
    RAISE EXCEPTION 'grn_already_linked_to_po' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_receivable_lines' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = v_grn.branch_id
      AND b.tenant_id = v_tenant
      AND b.is_active = true
      AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
  ) THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = 'P0002';
  END IF;

  v_display := public.next_po_display_id(v_tenant);

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by
  ) VALUES (
    v_tenant, v_grn.branch_id, v_grn.supplier_id, v_display, v_display, 'draft',
    NULLIF(btrim(v_grn.notes), ''), v_uid
  ) RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, unit_price_est, line_total
  )
  SELECT
    v_tenant,
    v_po_id,
    gi.ingredient_id,
    (gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::numeric(15,3),
    gi.entry_unit_id,
    CASE
      WHEN gi.unit_cost IS NOT NULL AND gi.unit_cost > 0 THEN gi.unit_cost
      ELSE NULL
    END,
    CASE
      WHEN gi.unit_cost IS NOT NULL AND gi.unit_cost > 0 THEN
        ROUND(
          (gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) * gi.unit_cost,
          2
        )
      ELSE NULL
    END
  FROM public.grn_items gi
  WHERE gi.grn_id = p_grn_id
    AND gi.tenant_id = v_tenant
    AND gi.quality_status <> 'rejected'
    AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  -- Quantity snapshot only; commercial price + po_unit_price land on approve (D089).
  UPDATE public.grn_items gi
  SET po_quantity = gi.received_quantity - COALESCE(gi.rejected_quantity, 0)
  WHERE gi.grn_id = p_grn_id
    AND gi.tenant_id = v_tenant
    AND gi.quality_status <> 'rejected'
    AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

  UPDATE public.goods_received_notes
  SET po_id = v_po_id, updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.po.created_from_grn_draft',
    'purchase_order',
    v_po_id,
    NULL,
    jsonb_build_object(
      'grn_id', p_grn_id,
      'lines', v_line_count,
      'branch_id', v_grn.branch_id
    )
  );

  RETURN jsonb_build_object(
    'po_id', v_po_id,
    'display_id', v_display,
    'grn_id', p_grn_id,
    'line_count', v_line_count,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order_from_grn(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_grn(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_grn(bigint) TO service_role;

COMMENT ON FUNCTION public.create_purchase_order_from_grn(bigint) IS
  'D088/D089: create draft PO from GRN draft and link po_id. Seeds unit_price_est only when GRN already has unit_cost > 0; otherwise accountant sets price on PO. Approve syncs price into GRN unit_cost.';
