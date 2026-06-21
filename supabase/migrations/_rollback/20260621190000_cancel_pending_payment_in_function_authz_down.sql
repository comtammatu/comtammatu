-- Restore cancel_pending_payment without the in-function authorization checks.
CREATE OR REPLACE FUNCTION public.cancel_pending_payment(
  p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  v_payment RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, order_id, status
  INTO v_payment
  FROM public.payments
  WHERE id        = p_payment_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET status     = 'failed',
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at     = now()
  WHERE id             = v_payment.order_id
    AND payment_status <> 'paid';
END;
$function$;
