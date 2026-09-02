-- Align branch_day summary/close with inventory_shift_key 04:00 local cut-off.
-- Business date D = [D 04:00 local, (D+1) 04:00 local) using branches.timezone.

CREATE OR REPLACE FUNCTION public.branch_business_day_bounds(
  p_branch_id bigint,
  p_business_date date
)
RETURNS TABLE (day_start timestamptz, day_end timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_tz text;
  v_start timestamptz;
BEGIN
  IF p_branch_id IS NULL OR p_business_date IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT timezone INTO v_tz
  FROM public.branches
  WHERE id = p_branch_id;

  IF v_tz IS NULL OR btrim(v_tz) = '' THEN
    v_tz := 'Asia/Ho_Chi_Minh';
  END IF;

  v_start := (
    (p_business_date::text || ' 04:00:00')::timestamp
    AT TIME ZONE v_tz
  );

  day_start := v_start;
  day_end := v_start + interval '1 day';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.branch_business_day_bounds(bigint, date) IS
  'UTC bounds for business date D: [D 04:00, (D+1) 04:00) in branch timezone (inventory_shift_key cut-off).';

CREATE OR REPLACE FUNCTION public.branch_business_date(
  p_branch_id bigint,
  p_at timestamptz DEFAULT now()
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_tz text;
  v_local timestamp;
BEGIN
  IF p_branch_id IS NULL OR p_at IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT timezone INTO v_tz
  FROM public.branches
  WHERE id = p_branch_id;

  IF v_tz IS NULL OR btrim(v_tz) = '' THEN
    v_tz := 'Asia/Ho_Chi_Minh';
  END IF;

  v_local := p_at AT TIME ZONE v_tz;
  IF EXTRACT(HOUR FROM v_local)::int < 4 THEN
    RETURN (v_local - interval '1 day')::date;
  END IF;
  RETURN v_local::date;
END;
$$;

COMMENT ON FUNCTION public.branch_business_date(bigint, timestamptz) IS
  'Business date for timestamp using branch timezone and 04:00 cut-off (matches inventory_shift_key).';

REVOKE ALL ON FUNCTION public.branch_business_day_bounds(bigint, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branch_business_day_bounds(bigint, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branch_business_day_bounds(bigint, date) TO service_role;

REVOKE ALL ON FUNCTION public.branch_business_date(bigint, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branch_business_date(bigint, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branch_business_date(bigint, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_branch_day_summary(
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

  SELECT b.day_start, b.day_end
    INTO v_day_start, v_day_end
    FROM public.branch_business_day_bounds(p_branch_id, p_business_date) AS b;

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

CREATE OR REPLACE FUNCTION public.close_branch_day(
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
  v_day_start timestamptz;
  v_day_end timestamptz;
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

  SELECT b.day_start, b.day_end
    INTO v_day_start, v_day_end
    FROM public.branch_business_day_bounds(p_branch_id, p_business_date) AS b;

  -- Block close while any POS session opened in this business day is still open.
  SELECT COUNT(*) INTO v_open_session_count
    FROM public.pos_sessions ps
   WHERE ps.tenant_id = v_tenant
     AND ps.branch_id = p_branch_id
     AND ps.status = 'open'
     AND ps.opened_at >= v_day_start
     AND ps.opened_at < v_day_end;
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
