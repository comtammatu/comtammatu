-- Keep the target-table alias out of JOIN ON; PostgreSQL only exposes it to
-- the UPDATE WHERE clause.
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
      FROM linked_grn lg, public.purchase_order_items poi
     WHERE gi.tenant_id = v_tenant_id
       AND gi.grn_id = lg.grn_id
       AND poi.tenant_id = v_tenant_id
       AND poi.po_id = v_po.id
       AND poi.ingredient_id = gi.ingredient_id
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
  'Approve PO draft to sent after all prices are positive, then sync prices to the linked draft GRN.';
