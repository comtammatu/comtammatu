CREATE TABLE public.payroll_adjustments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id bigint NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  effective_month date NOT NULL,
  kind text NOT NULL,
  amount numeric(15, 2) NOT NULL,
  note text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_adjustments_effective_month_check
    CHECK (effective_month = date_trunc('month', effective_month)::date),
  CONSTRAINT payroll_adjustments_kind_check
    CHECK (kind = ANY (ARRAY[
      'bonus',
      'taxable_allowance',
      'tax_exempt_allowance',
      'advance',
      'deduction'
    ]::text[])),
  CONSTRAINT payroll_adjustments_amount_check
    CHECK (amount > 0 AND amount <= 1000000000),
  CONSTRAINT payroll_adjustments_note_check
    CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX payroll_adjustments_tenant_month_employee_idx
  ON public.payroll_adjustments (tenant_id, effective_month, employee_id);

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_adjustments_select ON public.payroll_adjustments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:payroll_calculate')
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.payroll_adjustments
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_payroll_adjustment(
  p_adjustment_id bigint DEFAULT NULL,
  p_employee_id bigint DEFAULT NULL,
  p_effective_month date DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_adjustment public.payroll_adjustments%ROWTYPE;
  v_existing boolean := false;
  v_month date := date_trunc('month', p_effective_month)::date;
  v_prior jsonb;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'upsert_payroll_adjustment: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission_any('finance:payroll_calculate') THEN
    RAISE EXCEPTION 'upsert_payroll_adjustment: missing payroll permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_employee_id IS NULL OR p_effective_month IS NULL OR p_kind IS NULL
    OR p_kind NOT IN ('bonus', 'taxable_allowance', 'tax_exempt_allowance', 'advance', 'deduction')
    OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000
    OR (p_note IS NOT NULL AND char_length(p_note) > 500) THEN
    RAISE EXCEPTION 'upsert_payroll_adjustment: invalid input'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'upsert_payroll_adjustment: employee not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_adjustment_id IS NOT NULL THEN
    SELECT * INTO v_adjustment
    FROM public.payroll_adjustments pa
    WHERE pa.id = p_adjustment_id
      AND pa.tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'upsert_payroll_adjustment: adjustment not found'
        USING ERRCODE = 'no_data_found';
    END IF;
    v_existing := true;
    v_prior := jsonb_build_object(
      'employee_id', v_adjustment.employee_id,
      'effective_month', v_adjustment.effective_month,
      'kind', v_adjustment.kind,
      'amount', v_adjustment.amount,
      'note', v_adjustment.note
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payroll_periods pp
    WHERE pp.tenant_id = v_tenant_id
      AND pp.status IN ('approved', 'paid')
      AND (
        (pp.period_year = EXTRACT(YEAR FROM v_month)::integer
          AND pp.period_month = EXTRACT(MONTH FROM v_month)::integer)
        OR (v_existing
          AND pp.period_year = EXTRACT(YEAR FROM v_adjustment.effective_month)::integer
          AND pp.period_month = EXTRACT(MONTH FROM v_adjustment.effective_month)::integer)
      )
  ) THEN
    RAISE EXCEPTION 'upsert_payroll_adjustment: payroll snapshot locked'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_existing THEN
    UPDATE public.payroll_adjustments
    SET employee_id = p_employee_id,
        effective_month = v_month,
        kind = p_kind,
        amount = p_amount,
        note = NULLIF(btrim(p_note), ''),
        updated_at = now()
    WHERE id = v_adjustment.id
    RETURNING * INTO v_adjustment;
  ELSE
    INSERT INTO public.payroll_adjustments (
      tenant_id,
      employee_id,
      effective_month,
      kind,
      amount,
      note,
      created_by
    ) VALUES (
      v_tenant_id,
      p_employee_id,
      v_month,
      p_kind,
      p_amount,
      NULLIF(btrim(p_note), ''),
      v_user_id
    )
    RETURNING * INTO v_adjustment;
  END IF;

  PERFORM public.log_audit(
    CASE WHEN v_existing THEN 'update' ELSE 'create' END,
    'payroll_adjustment',
    v_adjustment.id,
    v_prior,
    jsonb_build_object(
      'employee_id', v_adjustment.employee_id,
      'effective_month', v_adjustment.effective_month,
      'kind', v_adjustment.kind,
      'amount', v_adjustment.amount,
      'note', v_adjustment.note
    )
  );

  RETURN v_adjustment.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_payroll_adjustment(
  p_adjustment_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_adjustment public.payroll_adjustments%ROWTYPE;
BEGIN
  IF v_tenant_id IS NULL OR NOT public.has_permission_any('finance:payroll_calculate') THEN
    RAISE EXCEPTION 'delete_payroll_adjustment: missing payroll permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_adjustment
  FROM public.payroll_adjustments pa
  WHERE pa.id = p_adjustment_id
    AND pa.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_payroll_adjustment: adjustment not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payroll_periods pp
    WHERE pp.tenant_id = v_tenant_id
      AND pp.period_year = EXTRACT(YEAR FROM v_adjustment.effective_month)::integer
      AND pp.period_month = EXTRACT(MONTH FROM v_adjustment.effective_month)::integer
      AND pp.status IN ('approved', 'paid')
  ) THEN
    RAISE EXCEPTION 'delete_payroll_adjustment: payroll snapshot locked'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.payroll_adjustments
  WHERE id = v_adjustment.id;

  PERFORM public.log_audit(
    'delete',
    'payroll_adjustment',
    v_adjustment.id,
    jsonb_build_object(
      'employee_id', v_adjustment.employee_id,
      'effective_month', v_adjustment.effective_month,
      'kind', v_adjustment.kind,
      'amount', v_adjustment.amount,
      'note', v_adjustment.note
    ),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_payroll_calculation(
  p_period_year integer,
  p_period_month integer,
  p_standard_days numeric,
  p_entries jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_period_id bigint;
  v_period_status text;
  v_entry_count integer;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'snapshot_payroll_calculation: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission_any('finance:payroll_calculate') THEN
    RAISE EXCEPTION 'snapshot_payroll_calculation: missing payroll permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_period_year < 2020 OR p_period_month NOT BETWEEN 1 AND 12
    OR p_standard_days IS NULL OR p_standard_days <= 0 OR p_standard_days > 31
    OR p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array'
    OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'snapshot_payroll_calculation: invalid input'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:%s:%s', v_tenant_id, p_period_year, p_period_month), 0)
  );

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entries) AS x(employee_id bigint)
    GROUP BY x.employee_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'snapshot_payroll_calculation: duplicate employee entry'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entries) AS x(
      employee_id bigint,
      working_days numeric,
      paid_leave_days numeric,
      unpaid_leave_days numeric,
      payable_days numeric,
      standard_days numeric,
      base_salary numeric,
      allowances numeric,
      tax_exempt_allowances numeric,
      bonus numeric,
      gross_total numeric,
      total_insurance_employee numeric,
      pit_tax numeric,
      advance_deduction numeric,
      other_deductions numeric,
      net_salary numeric,
      insurance_base numeric
    )
    LEFT JOIN public.employees e
      ON e.id = x.employee_id
      AND e.tenant_id = v_tenant_id
    WHERE e.id IS NULL
      OR x.working_days < 0
      OR x.paid_leave_days < 0
      OR x.unpaid_leave_days < 0
      OR x.payable_days < 0
      OR x.payable_days > p_standard_days
      OR x.standard_days <> p_standard_days
      OR x.base_salary < 0
      OR x.allowances < 0
      OR x.tax_exempt_allowances < 0
      OR x.bonus < 0
      OR x.gross_total < 0
      OR x.total_insurance_employee < 0
      OR x.pit_tax < 0
      OR x.advance_deduction < 0
      OR x.other_deductions < 0
      OR x.net_salary < 0
      OR x.insurance_base < 0
  ) THEN
    RAISE EXCEPTION 'snapshot_payroll_calculation: invalid entry'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pp.id, pp.status
  INTO v_period_id, v_period_status
  FROM public.payroll_periods pp
  WHERE pp.tenant_id = v_tenant_id
    AND pp.period_year = p_period_year
    AND pp.period_month = p_period_month
  FOR UPDATE;

  IF FOUND THEN
    IF v_period_status IN ('approved', 'paid') THEN
      RAISE EXCEPTION 'snapshot_payroll_calculation: payroll snapshot locked'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.payroll_periods
    SET standard_days = p_standard_days,
        status = 'approved',
        approved_by = v_user_id,
        approved_at = now(),
        updated_at = now()
    WHERE id = v_period_id;
  ELSE
    INSERT INTO public.payroll_periods (
      tenant_id,
      period_year,
      period_month,
      standard_days,
      status,
      approved_by,
      approved_at
    ) VALUES (
      v_tenant_id,
      p_period_year,
      p_period_month,
      p_standard_days,
      'approved',
      v_user_id,
      now()
    )
    RETURNING id INTO v_period_id;
  END IF;

  DELETE FROM public.payroll_entries pe
  WHERE pe.tenant_id = v_tenant_id
    AND pe.payroll_period_id = v_period_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_entries) x
      WHERE (x ->> 'employee_id')::bigint = pe.employee_id
    );

  INSERT INTO public.payroll_entries (
    tenant_id, payroll_period_id, employee_id,
    working_days, paid_leave_days, unpaid_leave_days, payable_days,
    standard_days, overtime_hours, base_salary, allowances,
    tax_exempt_allowances, overtime_pay, bonus, gross_total,
    bhxh_employee, bhyt_employee, bhtn_employee, total_insurance_employee,
    bhxh_employer, bhyt_employer, bhtn_employer, total_insurance_employer,
    personal_deduction, dependent_count, dependent_deduction, charity_deduction,
    taxable_income, pit_tax, advance_deduction, other_deductions, net_salary,
    insurance_base
  )
  SELECT
    v_tenant_id, v_period_id, x.employee_id,
    x.working_days, x.paid_leave_days, x.unpaid_leave_days, x.payable_days,
    x.standard_days, x.overtime_hours, x.base_salary, x.allowances,
    x.tax_exempt_allowances, x.overtime_pay, x.bonus, x.gross_total,
    x.bhxh_employee, x.bhyt_employee, x.bhtn_employee, x.total_insurance_employee,
    x.bhxh_employer, x.bhyt_employer, x.bhtn_employer, x.total_insurance_employer,
    x.personal_deduction, x.dependent_count, x.dependent_deduction, x.charity_deduction,
    x.taxable_income, x.pit_tax, x.advance_deduction, x.other_deductions, x.net_salary,
    x.insurance_base
  FROM jsonb_to_recordset(p_entries) AS x(
    employee_id bigint,
    working_days numeric,
    paid_leave_days numeric,
    unpaid_leave_days numeric,
    payable_days numeric,
    standard_days numeric,
    overtime_hours numeric,
    base_salary numeric,
    allowances numeric,
    tax_exempt_allowances numeric,
    overtime_pay numeric,
    bonus numeric,
    gross_total numeric,
    bhxh_employee numeric,
    bhyt_employee numeric,
    bhtn_employee numeric,
    total_insurance_employee numeric,
    bhxh_employer numeric,
    bhyt_employer numeric,
    bhtn_employer numeric,
    total_insurance_employer numeric,
    personal_deduction numeric,
    dependent_count integer,
    dependent_deduction numeric,
    charity_deduction numeric,
    taxable_income numeric,
    pit_tax numeric,
    advance_deduction numeric,
    other_deductions numeric,
    net_salary numeric,
    insurance_base numeric
  )
  ON CONFLICT (payroll_period_id, employee_id, tenant_id) DO UPDATE SET
    working_days = EXCLUDED.working_days,
    paid_leave_days = EXCLUDED.paid_leave_days,
    unpaid_leave_days = EXCLUDED.unpaid_leave_days,
    payable_days = EXCLUDED.payable_days,
    standard_days = EXCLUDED.standard_days,
    overtime_hours = EXCLUDED.overtime_hours,
    base_salary = EXCLUDED.base_salary,
    allowances = EXCLUDED.allowances,
    tax_exempt_allowances = EXCLUDED.tax_exempt_allowances,
    overtime_pay = EXCLUDED.overtime_pay,
    bonus = EXCLUDED.bonus,
    gross_total = EXCLUDED.gross_total,
    bhxh_employee = EXCLUDED.bhxh_employee,
    bhyt_employee = EXCLUDED.bhyt_employee,
    bhtn_employee = EXCLUDED.bhtn_employee,
    total_insurance_employee = EXCLUDED.total_insurance_employee,
    bhxh_employer = EXCLUDED.bhxh_employer,
    bhyt_employer = EXCLUDED.bhyt_employer,
    bhtn_employer = EXCLUDED.bhtn_employer,
    total_insurance_employer = EXCLUDED.total_insurance_employer,
    personal_deduction = EXCLUDED.personal_deduction,
    dependent_count = EXCLUDED.dependent_count,
    dependent_deduction = EXCLUDED.dependent_deduction,
    charity_deduction = EXCLUDED.charity_deduction,
    taxable_income = EXCLUDED.taxable_income,
    pit_tax = EXCLUDED.pit_tax,
    advance_deduction = EXCLUDED.advance_deduction,
    other_deductions = EXCLUDED.other_deductions,
    net_salary = EXCLUDED.net_salary,
    insurance_base = EXCLUDED.insurance_base,
    updated_at = now();

  GET DIAGNOSTICS v_entry_count = ROW_COUNT;

  PERFORM public.log_audit(
    'approve',
    'payroll_period',
    v_period_id,
    NULL,
    jsonb_build_object(
      'period_year', p_period_year,
      'period_month', p_period_month,
      'standard_days', p_standard_days,
      'employee_count', v_entry_count,
      'status', 'approved'
    )
  );

  RETURN jsonb_build_object(
    'period_id', v_period_id,
    'employee_count', v_entry_count,
    'status', 'approved'
  );
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.payroll_entries
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payroll_periods
  FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.upsert_payroll_adjustment(bigint, bigint, date, text, numeric, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_payroll_adjustment(bigint)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.snapshot_payroll_calculation(integer, integer, numeric, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_payroll_adjustment(bigint, bigint, date, text, numeric, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_payroll_adjustment(bigint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_payroll_calculation(integer, integer, numeric, jsonb)
  TO authenticated, service_role;
