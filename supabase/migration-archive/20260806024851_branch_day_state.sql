-- Branch day state + close-day (EOD) workflow.
-- Introduces `branch_day_state` (one row per tenant/branch/business_date once
-- closed) plus two SECURITY DEFINER RPCs:
--   * get_branch_day_summary — read-only per-day roll-up (preview + post-close)
--   * close_branch_day        — atomic close with cash reconciliation snapshot
-- Idempotency mirrors the one-open-per-branch pattern on pos_sessions: a partial
-- unique index on (tenant_id, branch_id, business_date) WHERE status='closed'
-- makes a second close raise a sentinel the action maps to a friendly error.

CREATE TABLE public.branch_day_state (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz,            -- first POS session opened_at for the day (denormalized for reporting)
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,    -- revenue/payment-mix/order counts
  cash_recon jsonb NOT NULL DEFAULT '{}'::jsonb, -- per-session + rolled cash reconciliation
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_day_state_branch_fk FOREIGN KEY (branch_id) REFERENCES public.branches (id) ON DELETE CASCADE,
  CONSTRAINT branch_day_state_closed_by_fk FOREIGN KEY (closed_by) REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT branch_day_state_status_open_no_close CHECK (
    (status = 'open') IS FALSE  -- table only ever holds closed rows for now; kept for future open-state expansion
  )
);

CREATE INDEX branch_day_state_tenant_branch_date_idx
  ON public.branch_day_state (tenant_id, branch_id, business_date DESC);

-- One closed row per tenant/branch/business_date. A second close raises 23505,
-- which close_branch_day maps to the branch_day_already_closed sentinel.
CREATE UNIQUE INDEX branch_day_state_one_closed_per_day_idx
  ON public.branch_day_state (tenant_id, branch_id, business_date)
  WHERE status = 'closed';

ALTER TABLE public.branch_day_state REPLICA IDENTITY FULL;

-- read-only per-day summary used by the close-day preview + post-close view.
-- Gate: settings:branch OR finance:view (the same authorities that reach the
-- pos-sessions Z-report). STABLE so it can be used in larger read queries.
CREATE FUNCTION public.get_branch_day_summary(
  p_branch_id bigint,
  p_business_date date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_actor  uuid   := auth.uid();
  v_day_start timestamptz;
  v_day_end   timestamptz;
  v_revenue   numeric(15,2) := 0;
  v_paid_orders bigint := 0;
  v_unpaid_orders bigint := 0;
  v_cash_revenue numeric(15,2) := 0;
  v_noncash_revenue numeric(15,2) := 0;
  v_payment_mix jsonb;
  v_session_count bigint := 0;
  v_open_session_count bigint := 0;
  v_closed_state record;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL OR p_business_date IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'settings:branch')
     AND NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- VN-local business day → UTC bounds (matches getVNDayUtcRange in shared/time).
  v_day_start := (p_business_date::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '7 hours';
  v_day_end   := v_day_start + interval '1 day';

  SELECT COALESCE(SUM(p.amount), 0)::numeric(15,2)
    INTO v_revenue
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
   WHERE p.tenant_id = v_tenant
     AND p.branch_id = p_branch_id
     AND p.status = 'completed'
     AND p.paid_at IS NOT NULL
     AND p.paid_at >= v_day_start
     AND p.paid_at < v_day_end
     AND o.status <> 'cancelled';

  SELECT COUNT(*) INTO v_paid_orders
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
   WHERE p.tenant_id = v_tenant
     AND p.branch_id = p_branch_id
     AND p.status = 'completed'
     AND p.paid_at IS NOT NULL
     AND p.paid_at >= v_day_start
     AND p.paid_at < v_day_end
     AND o.status <> 'cancelled';

  SELECT COUNT(*) INTO v_unpaid_orders
    FROM public.orders o
   WHERE o.tenant_id = v_tenant
     AND o.branch_id = p_branch_id
     AND o.status IN ('confirmed', 'preparing', 'ready', 'served')
     AND o.payment_status = 'unpaid'
     AND o.created_at >= v_day_start
     AND o.created_at < v_day_end;

  SELECT
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)::numeric(15,2),
    COALESCE(SUM(p.amount) FILTER (WHERE p.method <> 'cash'), 0)::numeric(15,2)
    INTO v_cash_revenue, v_noncash_revenue
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
   WHERE p.tenant_id = v_tenant
     AND p.branch_id = p_branch_id
     AND p.status = 'completed'
     AND p.paid_at IS NOT NULL
     AND p.paid_at >= v_day_start
     AND p.paid_at < v_day_end
     AND o.status <> 'cancelled';

  SELECT COALESCE(jsonb_object_agg(p.method, p.amount), '{}'::jsonb)
    INTO v_payment_mix
    FROM (
      SELECT COALESCE(p.method, 'unknown') AS method, SUM(p.amount)::numeric(15,2) AS amount
        FROM public.payments p
        JOIN public.orders o ON o.id = p.order_id
       WHERE p.tenant_id = v_tenant
         AND p.branch_id = p_branch_id
         AND p.status = 'completed'
         AND p.paid_at IS NOT NULL
         AND p.paid_at >= v_day_start
         AND p.paid_at < v_day_end
         AND o.status <> 'cancelled'
       GROUP BY 1
    ) p;

  SELECT
    COUNT(*) FILTER (WHERE ps.status = 'closed'),
    COUNT(*) FILTER (WHERE ps.status = 'open')
    INTO v_session_count, v_open_session_count
    FROM public.pos_sessions ps
   WHERE ps.tenant_id = v_tenant
     AND ps.branch_id = p_branch_id
     AND ps.opened_at >= v_day_start
     AND ps.opened_at < v_day_end;

  SELECT * INTO v_closed_state
    FROM public.branch_day_state
   WHERE tenant_id = v_tenant
     AND branch_id = p_branch_id
     AND business_date = p_business_date
     AND status = 'closed'
   LIMIT 1;

  RETURN jsonb_build_object(
    'business_date', p_business_date,
    'day_start', v_day_start,
    'day_end', v_day_end,
    'revenue', v_revenue,
    'paid_orders', v_paid_orders,
    'unpaid_orders', v_unpaid_orders,
    'cash_revenue', v_cash_revenue,
    'noncash_revenue', v_noncash_revenue,
    'payment_mix', v_payment_mix,
    'closed_session_count', v_session_count,
    'open_session_count', v_open_session_count,
    'is_closed', FOUND AND v_closed_state.id IS NOT NULL,
    'closed_at', v_closed_state.closed_at,
    'closed_by_user_id', v_closed_state.closed_by,
    'note', v_closed_state.note
  );
END;
$$;

-- Atomic close. Aggregates from the same payment/order truth as
-- get_branch_day_summary, snapshots cash reconciliation the caller provides
-- (counted totals per session), and writes exactly one closed row. The partial
-- unique index guarantees idempotency.
CREATE FUNCTION public.close_branch_day(
  p_branch_id bigint,
  p_business_date date,
  p_cash_recon jsonb,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid   := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch record;
  v_summary jsonb;
  v_open_session_count bigint := 0;
  v_new_id bigint;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL OR p_business_date IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_branch
    FROM public.branches
   WHERE id = p_branch_id
     AND tenant_id = v_tenant
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_day_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'settings:branch') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Block close while any POS session for the day is still open.
  SELECT COUNT(*) INTO v_open_session_count
    FROM public.pos_sessions ps
   WHERE ps.tenant_id = v_tenant
     AND ps.branch_id = p_branch_id
     AND ps.status = 'open'
     AND ps.opened_at >= ((p_business_date::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '7 hours')
     AND ps.opened_at <  ((p_business_date::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '7 hours' + interval '1 day');
  IF v_open_session_count > 0 THEN
    RAISE EXCEPTION 'pos_session_still_open' USING ERRCODE = '22023';
  END IF;

  v_summary := public.get_branch_day_summary(p_branch_id, p_business_date);

  BEGIN
    INSERT INTO public.branch_day_state (
      tenant_id, branch_id, business_date, status,
      closed_by, summary, cash_recon, note
    ) VALUES (
      v_tenant, p_branch_id, p_business_date, 'closed',
      v_actor, v_summary,
      COALESCE(p_cash_recon, '{}'::jsonb),
      NULLIF(btrim(COALESCE(p_note, '')), '')
    )
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'branch_day_already_closed' USING ERRCODE = 'P0001';
  END;

  PERFORM public.log_audit(
    'branch_day.close',
    'branch_day',
    v_new_id,
    NULL,
    v_summary || jsonb_build_object('cash_recon', COALESCE(p_cash_recon, '{}'::jsonb))
  );

  RETURN jsonb_build_object(
    'branch_day_state_id', v_new_id,
    'summary', v_summary
  );
END;
$$;

ALTER TABLE public.branch_day_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY branch_day_state_select ON public.branch_day_state
  FOR SELECT TO authenticated
  USING ((tenant_id = public.auth_tenant_id())
         AND public.has_permission(branch_id, 'settings:branch'::text));

-- The close RPC runs SECURITY DEFINER (service-level); direct INSERT/UPDATE by
-- clients is intentionally not granted — only the RPC may write.

REVOKE ALL ON public.branch_day_state FROM PUBLIC;
GRANT SELECT ON public.branch_day_state TO authenticated;
GRANT ALL ON public.branch_day_state TO service_role;
