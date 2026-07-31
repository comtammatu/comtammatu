-- Reconstruct warehouse book value as of a period from append-only allocations.

CREATE OR REPLACE FUNCTION public.get_inventory_valuation_period_value(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
) RETURNS TABLE (
  branch_id bigint,
  opening_value numeric,
  closing_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'inventory_valuation_period_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH allocation_impacts AS (
    SELECT
      event.effective_at,
      coalesce(to_account.branch_id, from_account.branch_id) AS event_branch_id,
      CASE
        WHEN event.event_type IN ('invoice_reprice', 'credit_reprice')
          AND to_account.id IS NOT NULL
          THEN allocation.allocated_value
        WHEN to_account.id IS NOT NULL
          THEN allocation.allocated_value
        WHEN from_account.id IS NOT NULL
          THEN -allocation.allocated_value
        ELSE 0::numeric
      END AS value_impact
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    LEFT JOIN public.inventory_origin_balances AS to_balance
      ON to_balance.id = allocation.to_balance_id
     AND to_balance.tenant_id = allocation.tenant_id
    LEFT JOIN public.inventory_valuation_accounts AS to_account
      ON to_account.id = to_balance.valuation_account_id
     AND to_account.tenant_id = to_balance.tenant_id
    LEFT JOIN public.inventory_origin_balances AS from_balance
      ON from_balance.id = allocation.from_balance_id
     AND from_balance.tenant_id = allocation.tenant_id
    LEFT JOIN public.inventory_valuation_accounts AS from_account
      ON from_account.id = from_balance.valuation_account_id
     AND from_account.tenant_id = from_balance.tenant_id
    WHERE allocation.tenant_id = v_tenant
      AND coalesce(to_account.branch_id, from_account.branch_id) IS NOT NULL
      AND (
        p_branch_id IS NULL
        OR coalesce(to_account.branch_id, from_account.branch_id) = p_branch_id
      )
  ),
  branch_scope AS (
    SELECT branch.id
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR branch.id = p_branch_id)
  )
  SELECT
    branch.id,
    coalesce(pg_catalog.sum(impact.value_impact) FILTER (
      WHERE impact.effective_at
        < p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ), 0),
    coalesce(pg_catalog.sum(impact.value_impact) FILTER (
      WHERE impact.effective_at
        < (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ), 0)
  FROM branch_scope AS branch
  LEFT JOIN allocation_impacts AS impact
    ON impact.event_branch_id = branch.id
  GROUP BY branch.id
  ORDER BY branch.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_valuation_period_value(
  date, date, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_valuation_period_value(
  date, date, bigint
) TO authenticated, service_role;
