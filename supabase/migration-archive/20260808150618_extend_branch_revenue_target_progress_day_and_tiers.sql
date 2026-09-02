-- Extend branch revenue target progress for manager home:
-- calendar-day Doanh thu thuần + assigned-branch reward tiers (read-only).

DROP FUNCTION IF EXISTS public.get_branch_revenue_target_progress(bigint, date);

CREATE FUNCTION public.get_branch_revenue_target_progress(
  p_branch_id bigint,
  p_year_month date DEFAULT NULL::date
)
RETURNS TABLE (
  branch_id bigint,
  year_month date,
  net_revenue_mtd numeric,
  net_revenue_today numeric,
  target_amount numeric,
  progress_pct numeric,
  gap_amount numeric,
  reward_tiers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_caller_branch bigint := public.auth_branch_id();
  v_month date;
  v_today date;
  v_end date;
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_today_start_utc timestamptz;
  v_today_end_utc timestamptz;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
  v_net numeric := 0;
  v_net_today numeric := 0;
  v_target numeric;
  v_reward_tiers jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = v_tenant
      AND b.branch_kind = 'branch'
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'branch_manager' THEN
    IF v_caller_branch IS NULL OR v_caller_branch <> p_branch_id THEN
      RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role IN ('owner', 'accountant') THEN
    SELECT scope.has_tenant_scope, scope.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
    FROM private.finance_scope(v_uid, 'finance:view') scope;

    IF NOT (
      v_has_tenant_scope
      OR p_branch_id = ANY(COALESCE(v_branch_ids, ARRAY[]::bigint[]))
    ) THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_today := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_month := date_trunc(
    'month',
    COALESCE(p_year_month, v_today)::timestamp
  )::date;

  IF date_trunc('month', v_today::timestamp)::date = v_month THEN
    v_end := v_today;
  ELSE
    v_end := (v_month + interval '1 month' - interval '1 day')::date;
  END IF;

  v_start_utc := v_month::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc := (v_end + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_today_start_utc := v_today::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_today_end_utc := (v_today + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  WITH paid AS (
    SELECT
      payment.order_id,
      payment.id AS payment_id,
      payment.paid_at,
      orders.subtotal,
      orders.discount_amount
    FROM public.payments payment
    JOIN public.orders orders
      ON orders.id = payment.order_id
     AND orders.tenant_id = payment.tenant_id
     AND orders.branch_id = payment.branch_id
    WHERE payment.tenant_id = v_tenant
      AND payment.branch_id = p_branch_id
      AND payment.status = 'completed'
      AND payment.paid_at >= v_start_utc
      AND payment.paid_at < v_end_utc
  ),
  order_facts AS (
    SELECT DISTINCT ON (paid.order_id)
      paid.subtotal,
      paid.discount_amount
    FROM paid
    ORDER BY paid.order_id, paid.paid_at, paid.payment_id
  )
  SELECT COALESCE(sum(order_facts.subtotal - order_facts.discount_amount), 0)
  INTO v_net
  FROM order_facts;

  IF date_trunc('month', v_today::timestamp)::date = v_month THEN
    WITH paid_today AS (
      SELECT
        payment.order_id,
        payment.id AS payment_id,
        payment.paid_at,
        orders.subtotal,
        orders.discount_amount
      FROM public.payments payment
      JOIN public.orders orders
        ON orders.id = payment.order_id
       AND orders.tenant_id = payment.tenant_id
       AND orders.branch_id = payment.branch_id
      WHERE payment.tenant_id = v_tenant
        AND payment.branch_id = p_branch_id
        AND payment.status = 'completed'
        AND payment.paid_at >= v_today_start_utc
        AND payment.paid_at < v_today_end_utc
    ),
    order_facts_today AS (
      SELECT DISTINCT ON (paid_today.order_id)
        paid_today.subtotal,
        paid_today.discount_amount
      FROM paid_today
      ORDER BY paid_today.order_id, paid_today.paid_at, paid_today.payment_id
    )
    SELECT COALESCE(
      sum(order_facts_today.subtotal - order_facts_today.discount_amount),
      0
    )
    INTO v_net_today
    FROM order_facts_today;
  ELSE
    v_net_today := 0;
  END IF;

  SELECT
    targets.target_amount,
    COALESCE(targets.reward_tiers, '[]'::jsonb)
  INTO v_target, v_reward_tiers
  FROM public.branch_revenue_targets targets
  WHERE targets.tenant_id = v_tenant
    AND targets.branch_id = p_branch_id
    AND targets.year_month = v_month;

  IF v_reward_tiers IS NULL THEN
    v_reward_tiers := '[]'::jsonb;
  END IF;

  RETURN QUERY
  SELECT
    p_branch_id,
    v_month,
    v_net,
    v_net_today,
    v_target,
    CASE
      WHEN v_target IS NULL OR v_target <= 0 THEN NULL::numeric
      ELSE round((v_net / v_target) * 100, 1)
    END,
    CASE
      WHEN v_target IS NULL THEN NULL::numeric
      ELSE greatest(v_target - v_net, 0)
    END,
    v_reward_tiers;
END;
$$;

COMMENT ON FUNCTION public.get_branch_revenue_target_progress(bigint, date) IS
  'Branch-scoped MTD + calendar-day Doanh thu thuần vs monthly target, with reward tiers for assigned BM or finance:view.';

REVOKE ALL ON FUNCTION public.get_branch_revenue_target_progress(bigint, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_revenue_target_progress(bigint, date)
  TO authenticated, service_role;
