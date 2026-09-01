DO $$
DECLARE
  v_policy public.holiday_surcharge_policies%ROWTYPE;
  v_order_ids bigint[] := ARRAY[
    12992,
    12993,
    12994,
    12995,
    12996,
    12997,
    12998
  ]::bigint[];
  v_updated_ids bigint[] := ARRAY[]::bigint[];
BEGIN
  SELECT p.*
  INTO STRICT v_policy
  FROM public.holiday_surcharge_policies p
  WHERE p.id = 1
  FOR SHARE;

  IF NOT v_policy.is_active
     OR v_policy.name <> 'Phụ thu lễ 2/9'
     OR v_policy.calculation_type <> 'percentage'
     OR v_policy.value <> 10
     OR v_policy.starts_at <> TIMESTAMPTZ '2026-09-01 00:00:00+07'
     OR v_policy.ends_at <> TIMESTAMPTZ '2026-09-03 00:00:00+07' THEN
    RAISE EXCEPTION 'holiday surcharge policy no longer matches the approved backfill';
  END IF;

  PERFORM 1
  FROM public.orders o
  WHERE o.id = ANY(v_order_ids)
  ORDER BY o.id
  FOR UPDATE;

  WITH updated_orders AS (
    UPDATE public.orders o
    SET holiday_surcharge_policy_id = v_policy.id,
        holiday_surcharge_source = 'automatic',
        holiday_surcharge_calculation_type = v_policy.calculation_type,
        holiday_surcharge_value = v_policy.value,
        holiday_surcharge_policy_name = v_policy.name,
        updated_at = now()
    WHERE o.id = ANY(v_order_ids)
      AND o.tenant_id = v_policy.tenant_id
      AND (v_policy.branch_id IS NULL OR v_policy.branch_id = o.branch_id)
      AND o.created_at >= v_policy.starts_at
      AND o.created_at < v_policy.created_at
      AND o.payment_status = 'unpaid'
      AND o.status <> 'cancelled'
      AND o.holiday_surcharge_source = 'none'
      AND o.holiday_surcharge_policy_id IS NULL
      AND o.service_charge = 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments pay
        WHERE pay.order_id = o.id
          AND pay.tenant_id = o.tenant_id
          AND pay.branch_id = o.branch_id
          AND pay.status = 'pending'
      )
    RETURNING o.id
  )
  SELECT COALESCE(array_agg(u.id ORDER BY u.id), ARRAY[]::bigint[])
  INTO v_updated_ids
  FROM updated_orders u;

  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = ANY(v_updated_ids)
      AND (
        o.holiday_surcharge_policy_id <> v_policy.id
        OR o.holiday_surcharge_source <> 'automatic'
        OR o.holiday_surcharge_calculation_type <> v_policy.calculation_type
        OR o.holiday_surcharge_value <> v_policy.value
        OR o.holiday_surcharge_policy_name <> v_policy.name
        OR o.service_charge <> ROUND(
          GREATEST(0, o.subtotal - o.discount_amount) * v_policy.value / 100,
          0
        )
        OR o.total_amount <> GREATEST(0, o.subtotal - o.discount_amount)
          + o.service_charge
      )
  ) THEN
    RAISE EXCEPTION 'holiday surcharge backfill invariant failed';
  END IF;
END;
$$;
