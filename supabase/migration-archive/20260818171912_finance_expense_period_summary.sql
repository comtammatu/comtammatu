-- Period operating-expense and needs-action totals for the Chi phí KPI.
-- List loaders stay paged; this RPC sums the whole period.

CREATE FUNCTION public.get_finance_expense_period_summary(
  p_location text,
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location text;
  v_sales_branch_ids bigint[] := ARRAY[]::bigint[];
  v_operating_categories text[] := ARRAY[
    'rent',
    'utilities',
    'gas_fuel',
    'salary',
    'repair',
    'supplies',
    'marketing',
    'fees_tax',
    'hospitality',
    'other'
  ];
  v_ledger_categories text[] := v_operating_categories || ARRAY['capital', 'deposit'];
  v_operating_total numeric(14, 2) := 0;
  v_operating_count integer := 0;
  v_needs_action_total numeric(15, 2) := 0;
  v_needs_action_count integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  v_location := lower(btrim(COALESCE(p_location, '')));
  IF v_location NOT IN ('all', 'company', 'branches', 'branch') THEN
    RAISE EXCEPTION 'invalid_location' USING ERRCODE = '22023';
  END IF;

  IF v_location = 'branch' THEN
    IF p_branch_id IS NULL THEN
      RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches branch
      WHERE branch.id = p_branch_id
        AND branch.tenant_id = v_tenant
        AND branch.branch_kind = 'branch'
    ) THEN
      RAISE EXCEPTION 'branch_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_location = 'branches' THEN
    SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
    INTO v_sales_branch_ids
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant
      AND branch.branch_kind = 'branch'
      AND COALESCE(branch.is_active, true);
  END IF;

  WITH scoped AS (
    SELECT
      expense.category,
      expense.subtotal,
      expense.amount,
      (
        (
          expense.payment_method = 'unpaid'
          OR expense.paid_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.bank_transaction_expense_matches match
          WHERE match.tenant_id = expense.tenant_id
            AND match.expense_id = expense.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.webhook_events webhook
          WHERE webhook.tenant_id = expense.tenant_id
            AND webhook.provider = 'sepay'
            AND webhook.expense_id = expense.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.bank_transaction_reconciliation_matches recon
          WHERE recon.tenant_id = expense.tenant_id
            AND recon.expense_id = expense.id
        )
      ) AS needs_action
    FROM public.expenses expense
    WHERE expense.tenant_id = v_tenant
      AND expense.expense_date >= p_start_date
      AND expense.expense_date <= p_end_date
      AND expense.category = ANY (v_ledger_categories)
      AND (
        CASE v_location
          WHEN 'company' THEN expense.branch_id IS NULL
          WHEN 'branch' THEN expense.branch_id = p_branch_id
          WHEN 'branches' THEN expense.branch_id = ANY (v_sales_branch_ids)
          ELSE true
        END
      )
  )
  SELECT
    COALESCE(
      SUM(scoped.subtotal) FILTER (
        WHERE scoped.category = ANY (v_operating_categories)
      ),
      0
    ),
    COUNT(*) FILTER (
      WHERE scoped.category = ANY (v_operating_categories)
    )::integer,
    COALESCE(SUM(scoped.amount) FILTER (WHERE scoped.needs_action), 0),
    COUNT(*) FILTER (WHERE scoped.needs_action)::integer
  INTO
    v_operating_total,
    v_operating_count,
    v_needs_action_total,
    v_needs_action_count
  FROM scoped;

  RETURN jsonb_build_object(
    'operating_total', v_operating_total::text,
    'operating_count', v_operating_count,
    'operating_recorded', v_operating_count > 0,
    'needs_action_total', v_needs_action_total::text,
    'needs_action_count', v_needs_action_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_expense_period_summary(
  text,
  date,
  date,
  bigint
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_finance_expense_period_summary(
  text,
  date,
  date,
  bigint
) TO authenticated;

COMMENT ON FUNCTION public.get_finance_expense_period_summary(
  text,
  date,
  date,
  bigint
) IS
  'Period Chi vận hành (pre-VAT subtotal) and Cần xử lý (gross) totals for finance:view. Startup capital stays all-time and out of band.';
