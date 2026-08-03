ALTER TABLE public.menu_items
  ADD COLUMN vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT menu_items_vat_rate_check
    CHECK (vat_rate IN (0, 5, 8, 10));

COMMENT ON COLUMN public.menu_items.vat_rate IS
  'VAT rate embedded in base_price. VAT must not be added again at checkout.';

COMMENT ON COLUMN public.menu_items.base_price IS
  'VAT-inclusive menu selling price before discounts.';

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

  UPDATE public.purchase_orders
     SET status = 'sent',
         updated_at = now()
   WHERE id = v_po.id
     AND tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'inventory.po.approved',
    'purchase_order',
    v_po.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'sent',
      'branch_id', v_po.branch_id,
      'po_number', v_po.po_number
    )
  );

  RETURN jsonb_build_object('id', v_po.id, 'status', 'sent');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_order(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_grn_from_approved_po(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_branch_id bigint;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT branch_id
    INTO v_branch_id
    FROM public.purchase_orders
   WHERE id = p_po_id
     AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_permission(v_branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public.create_grn_from_po(p_po_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_grn_from_approved_po(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_grn_from_approved_po(bigint)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_grn_from_po(bigint)
  FROM authenticated;

-- PO mutations are RPC-only so `po_create` cannot bypass the approval right.
REVOKE INSERT, UPDATE, DELETE ON public.purchase_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.purchase_order_items FROM authenticated;
