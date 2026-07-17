BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.create_payment(
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  uuid,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.correct_payment_method(
  p_payment_id bigint,
  p_new_method text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_payment record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_new_method IS NULL OR p_new_method NOT IN ('cash', 'vietqr') THEN
    RAISE EXCEPTION 'invalid method: %', p_new_method USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, branch_id, status, method
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_payment.branch_id, 'orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed: status=%', v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.method = p_new_method THEN
    RAISE EXCEPTION 'method_unchanged: already %', p_new_method
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET method = p_new_method,
      updated_at = now()
  WHERE id = v_payment.id;

  PERFORM public.log_audit(
    'payment.method_correct',
    'payment',
    v_payment.id,
    jsonb_build_object('method', v_payment.method),
    jsonb_build_object('method', p_new_method, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'status', 'corrected',
    'payment_id', v_payment.id,
    'old_method', v_payment.method,
    'new_method', p_new_method
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_payment_method(bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_payment_method(bigint, text, text)
  TO authenticated;

COMMIT;
