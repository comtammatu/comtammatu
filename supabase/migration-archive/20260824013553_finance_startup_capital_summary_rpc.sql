-- All-time startup capital (capital + deposit, gross) summary for the
-- Chi phí ban đầu and Thiết bị cards. Period is intentionally ignored;
-- these values never enter the period result.

CREATE FUNCTION public.get_finance_startup_capital_summary(
  p_location text,
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
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_location := lower(btrim(COALESCE(p_location, '')));
  IF v_location NOT IN ('all', 'company', 'branches', 'branch') THEN
    RAISE EXCEPTION 'invalid_location' USING ERRCODE = '22023';
  END IF;
  IF v_location = 'branch' AND p_branch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF v_location = 'branches' THEN
    SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
    INTO v_sales_branch_ids
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant
      AND branch.branch_kind = 'branch'
      AND COALESCE(branch.is_active, true);
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'startup_total',
        COALESCE(SUM(expense.amount), 0)::text,
      'startup_recorded', COUNT(*) > 0,
      'equipment_total',
        COALESCE(SUM(expense.amount)
          FILTER (WHERE expense.category = 'capital'), 0)::text,
      'equipment_recorded',
        COUNT(*) FILTER (WHERE expense.category = 'capital') > 0
    )
    FROM public.expenses expense
    WHERE expense.tenant_id = v_tenant
      AND expense.category IN ('capital', 'deposit')
      AND (
        CASE v_location
          WHEN 'company' THEN expense.branch_id IS NULL
          WHEN 'branch' THEN expense.branch_id = p_branch_id
          WHEN 'branches' THEN expense.branch_id = ANY (v_sales_branch_ids)
          ELSE true
        END
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_startup_capital_summary(text, bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_startup_capital_summary(text, bigint)
  TO authenticated;
COMMENT ON FUNCTION public.get_finance_startup_capital_summary(text, bigint) IS
  'All-time gross capital+deposit (Chi phí ban đầu) and capital slice (Thiết bị). Period is intentionally ignored; never part of the period result.';
