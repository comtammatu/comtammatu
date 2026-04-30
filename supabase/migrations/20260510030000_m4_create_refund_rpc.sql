-- =============================================================
-- M4 P0-5 — create_refund RPC
--
-- Replaces the direct INSERT in `apps/web/app/orders/refund-actions.ts`
-- (which has a `payment.status='completed'` precondition gap and an
-- `area_manager` scope hole). The RPC is the source of truth:
--
--   - Validates payment.status='completed' (the missing precondition).
--   - Validates amount > 0 AND amount ≤ payment.amount.
--   - Re-checks tenant_id match (defence-in-depth vs RLS).
--   - Inserts the refunds row (status='pending') under the caller's
--     identity.
--   - Writes one audit_logs row via log_audit().
--
-- The action wrapper (refund-actions.ts) keeps role / area_branches
-- scoping (server-side) and translates RPC error codes to user-facing
-- Vietnamese messages.
--
-- Enforces regression rule REFUND-MUST-CHECK-PAYMENT-COMPLETED.
--
-- Refs: docs/plan/m4-payments-fix.md §3, tasks/regressions.md.
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_refund(
  p_payment_id  BIGINT,
  p_amount      NUMERIC,
  p_reason      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor    UUID   := auth.uid();
  v_tenant   BIGINT := public.auth_tenant_id();
  v_payment  RECORD;
  v_refund_id BIGINT;
  v_already  NUMERIC(15,2) := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  -- Permission gate: caller must hold orders:refund (creation) at branch
  -- of the payment OR tenant-wide.
  -- The action layer (refund-actions.ts) already checks role + area scope;
  -- here we re-check the permission key as a defence-in-depth.
  IF NOT public.has_permission_any('orders:refund') THEN
    RAISE EXCEPTION 'permission denied: orders:refund required'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22023';
  END IF;

  -- Load + lock payment row. RLS already scopes by tenant; the explicit
  -- tenant_id eq is belt-and-braces.
  SELECT id, tenant_id, branch_id, order_id, amount, status, method
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Gap fix: the OLD action code allowed creating refunds against
  -- pending/failed payments. The RPC rejects anything but completed.
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed: status=%', v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Total of already-approved+pending refunds on this payment must
  -- not exceed payment.amount.
  SELECT COALESCE(SUM(amount), 0) INTO v_already
  FROM public.refunds
  WHERE payment_id = v_payment.id
    AND status IN ('pending', 'approved');

  IF v_already + p_amount > v_payment.amount THEN
    RAISE EXCEPTION 'refund_exceeds_remaining: already=%, requested=%, payment=%',
      v_already, p_amount, v_payment.amount USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.refunds
    (tenant_id, branch_id, payment_id, order_id, amount, reason, status, created_by)
  VALUES
    (v_payment.tenant_id, v_payment.branch_id, v_payment.id, v_payment.order_id,
     p_amount, p_reason, 'pending', v_actor)
  RETURNING id INTO v_refund_id;

  PERFORM public.log_audit(
    'refund.create',
    'refund',
    v_refund_id,
    NULL,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'order_id',   v_payment.order_id,
      'amount',     p_amount,
      'method',     v_payment.method
    )
  );

  RETURN jsonb_build_object(
    'status',    'created',
    'refund_id', v_refund_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_refund(BIGINT, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_refund(BIGINT, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_refund(BIGINT, NUMERIC, TEXT) IS
  'M4 P0-5 (2026-04-29): refund creation with payment.status=completed precondition + cumulative refund cap (sum of pending+approved refunds ≤ payment.amount). Replaces direct INSERT in refund-actions.ts. Audit row written via log_audit.';
