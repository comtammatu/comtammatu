-- =========================================================================
-- Fix: confirm_cash_payment fails with duplicate key when a pending
-- VietQR/MoMo payment row already exists for the same order.
--
-- Root cause:
--   `idx_payments_order_active` is a partial UNIQUE on
--   payments(order_id) WHERE status != 'failed' — enforces at most one
--   active payment per order. But `confirm_cash_payment` only searched
--   for `method='cash' AND status='pending'`, never finding a pending
--   vietqr/momo row, and INSERTing a cash row → violated the unique
--   index. Observed: 12 duplicate-key errors + 7 burned sequence IDs
--   (gaps 6,7,9-13) on 2026-04-24 17:37-17:39 UTC.
--
-- UX that triggers it: cashier opens bill, taps VietQR tab (which
-- calls createPayment → inserts vietqr/pending row), customer decides
-- to pay cash, cashier switches to Cash tab and hits "Đã thanh toán".
--
-- Secondary bug fixed: `orders.payment_method` stayed NULL after a
-- successful cash confirm because `complete_payment_and_consume_stock`
-- is webhook-shared and correctly does not set method. The
-- cash-specific wrapper must set it. (Evidence: order #8 in prod-dev
-- has payment_status='paid', cash_received=62000, payment_method=NULL.)
--
-- Fix strategy (Option A — UPDATE in-place):
--   - Find ANY pending payment row for the order (any method). The
--     unique index guarantees at most one such row exists.
--   - If found → UPDATE to method='cash', amount=total, clear
--     provider_ref/provider_data (abandoned QR state, not relevant for
--     the cash record).
--   - If none → INSERT a fresh cash pending row.
--   - If an already-completed row exists (idempotent retry / race with
--     webhook) → short-circuit, return that payment_id.
--   - UPDATE orders.payment_method='cash' in the same transaction.
--   - FOR UPDATE on both orders + payments rows to serialize concurrent
--     cashiers / webhooks.
--
-- Audit trail is preserved via `payments.updated_at` + the final
-- `orders.payment_method`. Abandoned QR attempts are UX noise, not
-- accounting events — chosen over option B (mark existing failed +
-- insert new) to avoid polluting reports with fake "failed" rows.
--
-- Also includes a 30-day backfill for orders already paid with
-- payment_method=NULL (symptom of the same secondary bug).
-- =========================================================================

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
  v_existing_id  BIGINT;
  v_existing_st  TEXT;
  v_payment_id   BIGINT;
  v_cash_change  NUMERIC(15,2);
  v_complete_res RECORD;
  v_receipt_res  JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock the order row to serialize concurrent confirm attempts.
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

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

  -- Hard guard: BLOCK under-payment. Employee meals / comps must use
  -- the order's discount_amount to zero the total first.
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

  -- Find the single non-failed payment row (if any). The partial unique
  -- index guarantees at most one. Lock it to serialize vs concurrent
  -- webhook / double-click.
  SELECT id, status INTO v_existing_id, v_existing_st
  FROM public.payments
  WHERE order_id = p_order_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_st = 'completed' THEN
    -- Idempotent retry or webhook-won race: payment already paid.
    -- Short-circuit with the existing payment_id. Receipt was already
    -- enqueued on the original completion path; do NOT re-enqueue here.
    v_payment_id := v_existing_id;
  ELSIF v_existing_id IS NOT NULL THEN
    -- Convert the pending slot (any method) to a cash pending row.
    -- Wipe provider_ref / provider_data — those belong to the
    -- abandoned QR attempt, not the cash transaction we're recording.
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = NULL,
           provider_data = NULL,
           updated_at    = now()
     WHERE id = v_existing_id;
    v_payment_id := v_existing_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Set orders.payment_method so reports + receipt payload are correct.
  -- complete_payment_and_consume_stock is webhook-shared and (correctly)
  -- does not touch payment_method. Set it here in the caller-specific
  -- wrapper.
  UPDATE public.orders
     SET payment_method = 'cash',
         updated_at     = now()
   WHERE id = p_order_id;

  -- Short-circuit for already-completed: skip stock/receipt double-run.
  IF v_existing_st = 'completed' THEN
    RETURN jsonb_build_object(
      'order_id',      p_order_id,
      'payment_id',    v_payment_id,
      'cash_received', COALESCE(v_order.cash_received, p_cash_received),
      'cash_change',   COALESCE(v_order.cash_change, v_cash_change),
      'print_job_id',  NULL,
      'idempotent',    true
    );
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

  -- Enqueue the final receipt in the same transaction. Rolls back on
  -- failure — user retries, no half-paid/no-receipt state.
  v_receipt_res := public.enqueue_receipt_print(
    p_order_id,
    p_cash_received,
    v_cash_change
  );

  RETURN jsonb_build_object(
    'order_id',      p_order_id,
    'payment_id',    v_payment_id,
    'cash_received', p_cash_received,
    'cash_change',   v_cash_change,
    'print_job_id',  v_receipt_res->>'job_id'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_payment(bigint, numeric) TO authenticated;

COMMENT ON FUNCTION public.confirm_cash_payment(bigint, numeric) IS
  'Atomic cashier confirm: validates cash >= total, reuses any existing '
  'pending payment slot (UPDATE in-place) or inserts fresh cash row, '
  'calls complete_payment_and_consume_stock (marks paid + consumes stock), '
  'sets orders.payment_method=''cash'', enqueues final receipt. '
  'FOR UPDATE on order + payments serializes concurrent attempts. '
  'Idempotent: if payment already completed, short-circuits without '
  're-enqueuing receipt. Blocks under-payment hard (use discount instead).';

-- ─── Backfill: correct NULL payment_method on already-paid orders ────────
--
-- Symptom of the same secondary bug — previously-confirmed cash orders
-- have payment_method=NULL despite a completed cash payment row. Scoped
-- to last 30 days to avoid surprise updates on archival data; older
-- orders (if any) stay as-is and should be fixed via a one-off query by
-- finance if reporting is off.
UPDATE public.orders o
   SET payment_method = p.method,
       updated_at     = now()
  FROM public.payments p
 WHERE p.order_id = o.id
   AND p.status = 'completed'
   AND o.payment_status = 'paid'
   AND o.payment_method IS NULL
   AND o.created_at > now() - INTERVAL '30 days';
