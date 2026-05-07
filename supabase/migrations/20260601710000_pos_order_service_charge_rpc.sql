-- =========================================================================
-- POS per-order surcharge / service charge.
--
-- Uses the existing orders.service_charge amount column as the MVP storage
-- for delivery fee / packaging fee / other per-order surcharges. The money
-- must be on the order before payment so cash, QR, receipts, and reports all
-- agree on orders.total_amount.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.set_order_service_charge(
  p_order_id BIGINT,
  p_amount   NUMERIC,
  p_note     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid          UUID;
  v_prof_tenant  BIGINT;
  v_prof_branch  BIGINT;
  v_prof_role    TEXT;
  v_order        RECORD;
  v_note_trim    TEXT;
  v_amount       NUMERIC(15,2);
  v_total_amount NUMERIC(15,2);
  v_has_pending  BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'service_charge_invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF p_amount > 50000000 THEN
    RAISE EXCEPTION 'service_charge_amount_too_large' USING ERRCODE = '22023';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'service_charge_note_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.tax_amount, o.service_charge, o.discount_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.tenant_id = v_order.tenant_id
      AND p.branch_id = v_order.branch_id
      AND p.status = 'pending'
  )
  INTO v_has_pending;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'pending' OR v_has_pending THEN
    RAISE EXCEPTION 'service_charge_payment_pending' USING ERRCODE = '22023';
  END IF;

  v_amount := ROUND(p_amount::NUMERIC, 2);
  v_total_amount := COALESCE(v_order.subtotal, 0)
                  + COALESCE(v_order.tax_amount, 0)
                  + v_amount
                  - COALESCE(v_order.discount_amount, 0);

  UPDATE public.orders
     SET service_charge = v_amount,
         total_amount   = v_total_amount,
         updated_at     = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    CASE
      WHEN v_amount = 0 THEN 'service_charge_cleared'
      ELSE 'service_charge_set: ' || v_amount::TEXT || 'đ'
    END || ' :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id',       p_order_id,
    'service_charge', v_amount,
    'total_amount',   v_total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_service_charge(BIGINT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_service_charge(BIGINT, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_order_service_charge(BIGINT, NUMERIC, TEXT) IS
  'Set or clear orders.service_charge before payment. Requires note >=3 chars, '
  'blocks paid/terminal/pending-payment orders, recomputes total_amount, and '
  'records an order_status_history audit note.';
