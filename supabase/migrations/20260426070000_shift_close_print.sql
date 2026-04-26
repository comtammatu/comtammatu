-- =========================================================================
-- POS shift-close report print (PHIẾU CHỐT CA)
--
-- After cashier closes a session via close_pos_session, auto-fire one print
-- to the receipt printer with: cashier, open/close timestamps, opening cash,
-- expected cash, closing cash, cash difference, payment breakdown by method,
-- variance approval block (if applicable), and carry-over order count.
--
-- Why this matters: cashier needs a paper trail to hand over to the next
-- shift / management. Today there is no physical artifact — only DB row.
-- Idempotency key is session-scoped (`session:N:shift_close`) so re-pressing
-- "Chốt ca" never duplicates the print.
--
-- Design choices:
-- 1. New job_type='shift_close_report' added to print_jobs CHECK constraint.
-- 2. enqueue_shift_close_print is SECURITY DEFINER + checks pos:close_shift
--    (same gate as the close itself).
-- 3. Server Action calls this AFTER close_pos_session succeeds — keeping
--    failure isolation: print failure must NEVER undo the close.
-- 4. Payment breakdown queried from `orders.payment_method` (single method
--    per paid order; split payments not yet modelled).
-- =========================================================================

-- ─── 1. Expand print_jobs.job_type CHECK ─────────────────────────────────

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_job_type_check;

ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_job_type_check CHECK (
    job_type IN (
      'kitchen_ticket',
      'receipt',
      'reprint',
      'cancel_ticket',
      'provisional_bill',
      'shift_close_report'
    )
  );


-- ─── 2. enqueue_shift_close_print RPC ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_shift_close_print(
  p_session_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid             UUID;
  v_session         RECORD;
  v_branch          public.branches%ROWTYPE;
  v_cashier_name    TEXT;
  v_approver_name   TEXT;
  v_branch_tax      TEXT;
  v_printer_id      BIGINT;
  v_breakdown       JSONB;
  v_total_revenue   NUMERIC(15,2);
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, opening_cash, closing_cash,
         expected_cash, cash_difference, opened_at, closed_at, closed_by,
         note, variance_approval_note, variance_approver_user_id
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'session not closed yet' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('pos:close_shift') THEN
    RAISE EXCEPTION 'permission denied: pos:close_shift' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_session.branch_id;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_session.closed_by;

  IF v_session.variance_approver_user_id IS NOT NULL THEN
    SELECT full_name INTO v_approver_name
    FROM public.profiles WHERE id = v_session.variance_approver_user_id;
  END IF;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_session.tenant_id AND key = 'branch_tax_code';

  SELECT id INTO v_printer_id
  FROM public.printers
  WHERE branch_id = v_session.branch_id
    AND tenant_id = v_session.tenant_id
    AND role = 'receipt'
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  -- Payment breakdown by method. Filter status NOT IN ('cancelled') so a
  -- voided order whose payment row was never created doesn't leak in.
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'method',  payment_method,
      'count',   cnt,
      'amount',  amount
    ) ORDER BY payment_method), '[]'::jsonb),
    COALESCE(SUM(amount), 0)
  INTO v_breakdown, v_total_revenue
  FROM (
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*) AS cnt,
      SUM(total_amount) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) AS grp;

  v_payload := jsonb_build_object(
    'kind',                  'shift_close_report',
    'branch_name',           COALESCE(v_branch.name, ''),
    'branch_address',        COALESCE(v_branch.address, ''),
    'branch_phone',          COALESCE(v_branch.phone, ''),
    'branch_tax_code',       COALESCE(v_branch_tax, ''),
    'session_id',            p_session_id,
    'cashier_name',          COALESCE(v_cashier_name, ''),
    'opened_at',             to_char(v_session.opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'closed_at',             to_char(v_session.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'opening_cash',          v_session.opening_cash,
    'closing_cash',          v_session.closing_cash,
    'expected_cash',         v_session.expected_cash,
    'cash_difference',       v_session.cash_difference,
    'note',                  v_session.note,
    'variance_note',         v_session.variance_approval_note,
    'variance_approver',     v_approver_name,
    'paid_order_count',      (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND payment_status = 'paid'
         AND status <> 'cancelled'
    ),
    'unpaid_order_count',    (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND payment_status <> 'paid'
         AND status <> 'cancelled'
    ),
    'cancelled_order_count', (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND status = 'cancelled'
    ),
    'payment_breakdown',     v_breakdown,
    'total_revenue',         v_total_revenue,
    'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS')
  );

  -- Session-scoped idempotency: re-pressing "in lại phiếu chốt" overwrites
  -- the payload (numbers stay the same, only printed_at changes) but never
  -- enqueues a duplicate row. ON CONFLICT DO UPDATE so a stuck/failed job
  -- can be revived by re-calling this RPC.
  v_idempotency := 'session:' || p_session_id::TEXT || ':shift_close';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_session.tenant_id, v_session.branch_id, v_printer_id, 'shift_close_report',
    NULL, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    status  = CASE WHEN public.print_jobs.status IN ('failed', 'expired')
                   THEN 'pending' ELSE public.print_jobs.status END,
    last_error = NULL,
    claimed_by_agent = NULL,
    claimed_at = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_shift_close_print(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_shift_close_print(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.enqueue_shift_close_print(BIGINT) IS
  'Build a shift-close (PHIẾU CHỐT CA) print job for the receipt printer. '
  'Re-callable: session-scoped idempotency overwrites payload + revives '
  'failed/expired jobs. Returns {skipped:true, reason:no_printer} silently '
  'when the branch has no active receipt printer.';
