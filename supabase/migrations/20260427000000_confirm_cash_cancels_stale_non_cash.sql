-- Migration: confirm_cash_payment cancels stale non-cash pending rows before insert.
--
-- Context: The partial unique index `idx_payments_active_per_order` enforces
-- at most one non-failed payment row per order. When a cashier opens the bill,
-- taps VietQR (creates a `vietqr / pending` row), then pivots to cash, the
-- previous `vietqr / pending` row remains live. The subsequent cash-confirm
-- path locates only pending *cash* rows, misses the stale vietqr row, and
-- INSERTs a new cash row → 23505 unique violation, generic toast, cashier
-- blocked. See bughunter bug_015 (2026-04-27).
--
-- Fix: before the locate/insert, flip any `pending` non-cash payment row for
-- this order to `status='failed'` with metadata reason='switched_to_cash'.
-- This frees the partial unique index slot atomically within the same tx.
-- Idempotent: no effect when no stale non-cash row exists.

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(
  p_order_id       bigint,
  p_cash_received  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_payment_id   BIGINT;
  v_cash_change  NUMERIC(15,2);
  v_complete_res RECORD;
  v_receipt_res  JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('pos:payment')
    OR public.has_permission_any('pos:print')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:payment' USING ERRCODE = '42501';
  END IF;

  -- Hard guard: BLOCK under-payment. Employee meals / comps must use the
  -- order's discount_amount to zero the total first, not cash < total.
  IF p_cash_received IS NULL OR p_cash_received < v_order.total_amount THEN
    RAISE EXCEPTION 'cash_received (%) must be >= total_amount (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Sanity upper bound (guard against typo — 10× total, at least 50M VND).
  IF p_cash_received > GREATEST(v_order.total_amount * 10, 50000000) THEN
    RAISE EXCEPTION 'cash_received (%) exceeds sane upper bound for total (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  v_cash_change := p_cash_received - v_order.total_amount;

  -- Cancel any stale non-cash pending row. Frees the partial unique
  -- index slot before the locate/insert below so a cashier pivoting from
  -- VietQR/MoMo to cash does not collide on idx_payments_active_per_order.
  UPDATE public.payments
  SET status = 'failed',
      provider_data = COALESCE(provider_data, '{}'::jsonb) ||
                      jsonb_build_object('cancel_reason', 'switched_to_cash')
  WHERE order_id = p_order_id
    AND status = 'pending'
    AND method <> 'cash';

  -- Locate or create the pending cash payment row for this order.
  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE order_id = p_order_id
    AND method = 'cash'
    AND status = 'pending'
  ORDER BY id DESC
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Atomic mark-paid + stock consumption. Rolls back on failure.
  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    v_order.total_amount,
    jsonb_build_object('cash_received', p_cash_received, 'cash_change', v_cash_change),
    v_uid
  );

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RAISE EXCEPTION 'payment completion failed: % (detail: %)',
      v_complete_res.status, v_complete_res.detail
      USING ERRCODE = 'P0001';
  END IF;

  -- Enqueue the final receipt in the same transaction. If the print job
  -- fails to insert, the whole call rolls back — user retries, no
  -- half-paid/no-receipt state.
  v_receipt_res := public.enqueue_receipt_print(
    p_order_id,
    p_cash_received,
    v_cash_change
  );

  RETURN jsonb_build_object(
    'order_id',       p_order_id,
    'payment_id',     v_payment_id,
    'cash_received',  p_cash_received,
    'cash_change',    v_cash_change,
    'print_job_id',   v_receipt_res->>'job_id'
  );
END;
$function$;
