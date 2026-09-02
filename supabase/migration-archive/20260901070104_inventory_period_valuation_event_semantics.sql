-- Migration: inventory_period_valuation_event_semantics

-- Period inventory value is an account movement report. Ordinary valuation
-- events therefore contribute their signed event value exactly once. Reprice
-- events are the exception: their allocations distribute one source-cost
-- correction across the stock pools that still hold that source. Terminal
-- allocations restate food cost or loss buckets and are not inventory again.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_inventory_valuation_period_value(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL::bigint
) RETURNS TABLE(
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
  WITH direct_event_impacts AS (
    SELECT
      event.effective_at,
      account.branch_id AS event_branch_id,
      event.value_delta AS value_impact
    FROM public.inventory_valuation_events AS event
    JOIN public.inventory_valuation_accounts AS account
      ON account.id = coalesce(event.to_account_id, event.from_account_id)
     AND account.tenant_id = event.tenant_id
    WHERE event.tenant_id = v_tenant
      AND event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND (
        event.from_account_id IS NULL
        OR event.to_account_id IS NULL
        OR event.from_account_id = event.to_account_id
      )

    UNION ALL

    SELECT
      event.effective_at,
      to_account.branch_id AS event_branch_id,
      abs(event.value_delta) AS value_impact
    FROM public.inventory_valuation_events AS event
    JOIN public.inventory_valuation_accounts AS to_account
      ON to_account.id = event.to_account_id
     AND to_account.tenant_id = event.tenant_id
    WHERE event.tenant_id = v_tenant
      AND event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND event.from_account_id IS NOT NULL
      AND event.to_account_id IS NOT NULL
      AND event.from_account_id <> event.to_account_id

    UNION ALL

    SELECT
      event.effective_at,
      from_account.branch_id AS event_branch_id,
      -abs(event.value_delta) AS value_impact
    FROM public.inventory_valuation_events AS event
    JOIN public.inventory_valuation_accounts AS from_account
      ON from_account.id = event.from_account_id
     AND from_account.tenant_id = event.tenant_id
    WHERE event.tenant_id = v_tenant
      AND event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND event.from_account_id IS NOT NULL
      AND event.to_account_id IS NOT NULL
      AND event.from_account_id <> event.to_account_id
  ),
  reprice_inventory_impacts AS (
    SELECT
      event.effective_at,
      to_account.branch_id AS event_branch_id,
      allocation.allocated_value AS value_impact
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    JOIN public.inventory_origin_balances AS to_balance
      ON to_balance.id = allocation.to_balance_id
     AND to_balance.tenant_id = allocation.tenant_id
    JOIN public.inventory_valuation_accounts AS to_account
      ON to_account.id = to_balance.valuation_account_id
     AND to_account.tenant_id = to_balance.tenant_id
    WHERE allocation.tenant_id = v_tenant
      AND event.event_type IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
  ),
  period_impacts AS (
    SELECT * FROM direct_event_impacts
    UNION ALL
    SELECT * FROM reprice_inventory_impacts
  ),
  branch_scope AS (
    SELECT branch.id
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR branch.id = p_branch_id)
  )
  SELECT
    branch.id,
    coalesce(sum(impact.value_impact) FILTER (
      WHERE impact.effective_at
        < p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ), 0),
    coalesce(sum(impact.value_impact) FILTER (
      WHERE impact.effective_at
        < (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ), 0)
  FROM branch_scope AS branch
  LEFT JOIN period_impacts AS impact
    ON impact.event_branch_id = branch.id
  GROUP BY branch.id
  ORDER BY branch.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_valuation_period_value(
  date,
  date,
  bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inventory_valuation_period_value(
  date,
  date,
  bigint
) TO authenticated, service_role;

-- Freeze the three append-only surfaces while deriving the tiny historical
-- opening residual. This makes the account value and both impact sources one
-- transactionally consistent snapshot.
LOCK TABLE
  public.inventory_valuation_accounts,
  public.inventory_valuation_events,
  public.inventory_value_allocations
IN SHARE ROW EXCLUSIVE MODE;

WITH active_cutovers AS (
  SELECT
    cutover.tenant_id,
    cutover.cutoff_at
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.status = 'active'
    AND cutover.cutoff_at IS NOT NULL
), direct_event_impacts AS (
  SELECT
    event.tenant_id,
    coalesce(event.to_account_id, event.from_account_id) AS account_id,
    event.value_delta AS value_impact
  FROM public.inventory_valuation_events AS event
  JOIN active_cutovers AS cutover ON cutover.tenant_id = event.tenant_id
  WHERE event.event_type NOT IN (
      'invoice_reprice',
      'credit_reprice',
      'provisional_reprice'
    )
    AND coalesce(event.to_account_id, event.from_account_id) IS NOT NULL
    AND (
      event.from_account_id IS NULL
      OR event.to_account_id IS NULL
      OR event.from_account_id = event.to_account_id
    )
), cross_account_event_impacts AS (
  SELECT
    event.tenant_id,
    event.to_account_id AS account_id,
    abs(event.value_delta) AS value_impact
  FROM public.inventory_valuation_events AS event
  JOIN active_cutovers AS cutover ON cutover.tenant_id = event.tenant_id
  WHERE event.event_type NOT IN (
      'invoice_reprice',
      'credit_reprice',
      'provisional_reprice'
    )
    AND event.from_account_id IS NOT NULL
    AND event.to_account_id IS NOT NULL
    AND event.from_account_id <> event.to_account_id

  UNION ALL

  SELECT
    event.tenant_id,
    event.from_account_id AS account_id,
    -abs(event.value_delta) AS value_impact
  FROM public.inventory_valuation_events AS event
  JOIN active_cutovers AS cutover ON cutover.tenant_id = event.tenant_id
  WHERE event.event_type NOT IN (
      'invoice_reprice',
      'credit_reprice',
      'provisional_reprice'
    )
    AND event.from_account_id IS NOT NULL
    AND event.to_account_id IS NOT NULL
    AND event.from_account_id <> event.to_account_id
), reprice_inventory_impacts AS (
  SELECT
    allocation.tenant_id,
    to_account.id AS account_id,
    allocation.allocated_value AS value_impact
  FROM public.inventory_value_allocations AS allocation
  JOIN active_cutovers AS cutover
    ON cutover.tenant_id = allocation.tenant_id
  JOIN public.inventory_valuation_events AS event
    ON event.id = allocation.valuation_event_id
   AND event.tenant_id = allocation.tenant_id
  JOIN public.inventory_origin_balances AS to_balance
    ON to_balance.id = allocation.to_balance_id
   AND to_balance.tenant_id = allocation.tenant_id
  JOIN public.inventory_valuation_accounts AS to_account
    ON to_account.id = to_balance.valuation_account_id
   AND to_account.tenant_id = to_balance.tenant_id
  WHERE event.event_type IN (
    'invoice_reprice',
    'credit_reprice',
    'provisional_reprice'
  )
), account_impacts AS (
  SELECT * FROM direct_event_impacts
  UNION ALL
  SELECT * FROM cross_account_event_impacts
  UNION ALL
  SELECT * FROM reprice_inventory_impacts
), account_gaps AS (
  SELECT
    account.tenant_id,
    account.id AS account_id,
    account.ingredient_id,
    cutover.cutoff_at,
    account.book_value,
    coalesce(sum(impact.value_impact), 0) AS ledger_value,
    round(
      account.book_value - coalesce(sum(impact.value_impact), 0),
      2
    ) AS opening_delta
  FROM public.inventory_valuation_accounts AS account
  JOIN active_cutovers AS cutover ON cutover.tenant_id = account.tenant_id
  LEFT JOIN account_impacts AS impact
    ON impact.tenant_id = account.tenant_id
   AND impact.account_id = account.id
  GROUP BY
    account.tenant_id,
    account.id,
    account.ingredient_id,
    cutover.cutoff_at,
    account.book_value
), inserted_events AS (
  INSERT INTO public.inventory_valuation_events (
    tenant_id,
    ingredient_id,
    event_type,
    terminal_bucket,
    from_account_id,
    to_account_id,
    quantity_delta,
    value_delta,
    effective_at,
    posting_year,
    posting_month,
    idempotency_key,
    metadata
  )
  SELECT
    gap.tenant_id,
    gap.ingredient_id,
    'opening',
    CASE WHEN gap.opening_delta < 0 THEN 'rounding' END,
    CASE WHEN gap.opening_delta < 0 THEN gap.account_id END,
    CASE WHEN gap.opening_delta > 0 THEN gap.account_id END,
    0,
    gap.opening_delta,
    gap.cutoff_at,
    extract(
      YEAR FROM gap.cutoff_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )::integer,
    extract(
      MONTH FROM gap.cutoff_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )::integer,
    md5(
      'inventory-period-opening-anchor:'
      || gap.tenant_id::text || ':'
      || gap.account_id::text || ':'
      || gap.cutoff_at::text || ':'
      || gap.opening_delta::text
    )::uuid,
    jsonb_build_object(
      'repair', 'period_valuation_opening_residual',
      'account_id', gap.account_id,
      'account_book_value', gap.book_value,
      'ledger_value_before_anchor', gap.ledger_value,
      'cutoff_at', gap.cutoff_at
    )
  FROM account_gaps AS gap
  WHERE gap.opening_delta <> 0
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING
    id,
    tenant_id,
    value_delta
)
INSERT INTO public.inventory_value_allocations (
  tenant_id,
  valuation_event_id,
  allocation_bucket,
  allocated_quantity,
  allocated_value,
  allocation_fraction
)
SELECT
  event.tenant_id,
  event.id,
  'rounding',
  0,
  abs(event.value_delta),
  0
FROM inserted_events AS event;

DO $$
DECLARE
  v_unreconciled_count integer;
BEGIN
  WITH direct_event_impacts AS (
    SELECT
      event.tenant_id,
      coalesce(event.to_account_id, event.from_account_id) AS account_id,
      event.value_delta AS value_impact
    FROM public.inventory_valuation_events AS event
    WHERE event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND coalesce(event.to_account_id, event.from_account_id) IS NOT NULL
      AND (
        event.from_account_id IS NULL
        OR event.to_account_id IS NULL
        OR event.from_account_id = event.to_account_id
      )
  ),
  cross_account_event_impacts AS (
    SELECT
      event.tenant_id,
      event.to_account_id AS account_id,
      abs(event.value_delta) AS value_impact
    FROM public.inventory_valuation_events AS event
    WHERE event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND event.from_account_id IS NOT NULL
      AND event.to_account_id IS NOT NULL
      AND event.from_account_id <> event.to_account_id

    UNION ALL

    SELECT
      event.tenant_id,
      event.from_account_id AS account_id,
      -abs(event.value_delta) AS value_impact
    FROM public.inventory_valuation_events AS event
    WHERE event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND event.from_account_id IS NOT NULL
      AND event.to_account_id IS NOT NULL
      AND event.from_account_id <> event.to_account_id
  ),
  reprice_inventory_impacts AS (
    SELECT
      allocation.tenant_id,
      to_account.id AS account_id,
      allocation.allocated_value AS value_impact
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    JOIN public.inventory_origin_balances AS to_balance
      ON to_balance.id = allocation.to_balance_id
     AND to_balance.tenant_id = allocation.tenant_id
    JOIN public.inventory_valuation_accounts AS to_account
      ON to_account.id = to_balance.valuation_account_id
     AND to_account.tenant_id = to_balance.tenant_id
    WHERE event.event_type IN (
      'invoice_reprice',
      'credit_reprice',
      'provisional_reprice'
    )
  ),
  account_impacts AS (
    SELECT * FROM direct_event_impacts
    UNION ALL
    SELECT * FROM cross_account_event_impacts
    UNION ALL
    SELECT * FROM reprice_inventory_impacts
  ),
  account_totals AS (
    SELECT
      account.tenant_id,
      account.id,
      account.book_value,
      coalesce(sum(impact.value_impact), 0) AS ledger_value
    FROM public.inventory_valuation_accounts AS account
    JOIN public.inventory_valuation_cutovers AS cutover
      ON cutover.tenant_id = account.tenant_id
     AND cutover.status = 'active'
    LEFT JOIN account_impacts AS impact
      ON impact.tenant_id = account.tenant_id
     AND impact.account_id = account.id
    GROUP BY account.tenant_id, account.id, account.book_value
  )
  SELECT count(*)
  INTO v_unreconciled_count
  FROM account_totals AS total
  WHERE round(total.book_value - total.ledger_value, 2) <> 0;

  IF v_unreconciled_count <> 0 THEN
    RAISE EXCEPTION 'inventory_period_valuation_reconciliation_failed'
      USING ERRCODE = '23514',
            DETAIL = format(
              'unreconciled_accounts=%s',
              v_unreconciled_count
            );
  END IF;
END;
$$;

COMMIT;
