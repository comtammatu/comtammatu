-- =========================================================================
-- cancel_pending_payment v2 — security fix + order-reset guard fix.
--
-- Changes vs original:
--   1. Add p_tenant_id / p_branch_id params and filter the payment lookup
--      through them — prevents a cashier from one branch cancelling another
--      branch's payment by guessing the payment_id (IDOR, QA finding M3).
--   2. Fix order-reset guard: was `WHERE payment_status = 'pending'` —
--      that only worked in the old flow where selecting MoMo/VietQR
--      immediately flipped orders.payment_status to 'pending'. In the new
--      flow the order stays 'unpaid', so the guard never matched and
--      orders.payment_method was left stranded (= 'momo') after cancel.
--      Fixed to `WHERE payment_status <> 'paid'` so any in-progress order
--      (both old 'pending' and new 'unpaid') gets cleaned up correctly.
--   3. Drop the old 1-arg overload so callers cannot bypass the new guard.
-- =========================================================================

-- Drop the old 1-argument overload — callers must now supply tenant/branch.
DROP FUNCTION IF EXISTS public.cancel_pending_payment(BIGINT);

CREATE OR REPLACE FUNCTION public.cancel_pending_payment(
  p_payment_id BIGINT,
  p_tenant_id  BIGINT,
  p_branch_id  BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Scope the lookup to the caller's tenant + branch (IDOR guard).
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

  -- Reset order payment fields, guarding against a concurrent confirm.
  -- Use <> 'paid' instead of = 'pending': in the new MoMo flow the order
  -- stays 'unpaid' (not 'pending') while the payment row is pending, so
  -- the old guard never fired and payment_method was left set.
  UPDATE public.orders
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at     = now()
  WHERE id             = v_payment.order_id
    AND payment_status <> 'paid';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pending_payment(BIGINT, BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_pending_payment(BIGINT, BIGINT, BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_pending_payment(BIGINT, BIGINT, BIGINT) TO authenticated;

COMMENT ON FUNCTION public.cancel_pending_payment(BIGINT, BIGINT, BIGINT) IS
  'Cancels a pending MoMo payment and resets order payment fields. '
  'Tenant/branch params guard against IDOR. Order reset uses payment_status <> ''paid'' '
  'to handle both old (payment_status=''pending'') and new (payment_status=''unpaid'') flows.';
