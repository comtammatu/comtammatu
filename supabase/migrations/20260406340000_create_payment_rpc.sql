-- =============================================================
-- Atomic payment creation RPC
-- Prevents race condition: payment insert + order update in one tx
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_payment(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_order_id BIGINT,
  p_method TEXT,
  p_amount NUMERIC(15,2),
  p_created_by UUID,
  p_provider_ref TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order RECORD;
  v_payment_id BIGINT;
  v_final_status TEXT;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Validate method
  IF p_method NOT IN ('cash', 'vietqr', 'momo') THEN
    RAISE EXCEPTION 'invalid payment method: %', p_method USING ERRCODE = '22023';
  END IF;

  -- Lock order row to prevent concurrent payment creation
  SELECT id, total_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Already paid check
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  -- Amount must match order total
  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %', v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  -- Determine status: cash = completed immediately
  v_final_status := CASE WHEN p_method = 'cash' THEN 'completed' ELSE COALESCE(p_status, 'pending') END;

  -- Insert payment
  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status,
    provider_ref, paid_at, created_by
  ) VALUES (
    p_tenant_id, p_branch_id, p_order_id, p_method, p_amount, v_final_status,
    p_provider_ref,
    CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  -- Update order payment info atomically
  UPDATE public.orders
  SET payment_method = p_method,
      payment_status = CASE WHEN v_final_status = 'completed' THEN 'paid' ELSE 'pending' END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'status', v_final_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated;
