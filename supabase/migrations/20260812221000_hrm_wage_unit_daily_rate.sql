-- ADR 0036 Phase C: wage_unit + daily_rate on contracts and payroll snapshots

ALTER TABLE public.employment_contracts
  ADD COLUMN IF NOT EXISTS wage_unit text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS daily_rate numeric;

ALTER TABLE public.employment_contracts
  DROP CONSTRAINT IF EXISTS employment_contracts_wage_unit_check;

ALTER TABLE public.employment_contracts
  ADD CONSTRAINT employment_contracts_wage_unit_check
    CHECK (wage_unit IN ('monthly', 'daily'));

UPDATE public.employment_contracts
SET wage_unit = 'monthly'
WHERE wage_unit IS NULL;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS wage_unit text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS daily_rate numeric;

ALTER TABLE public.payroll_entries
  DROP CONSTRAINT IF EXISTS payroll_entries_wage_unit_check;

ALTER TABLE public.payroll_entries
  ADD CONSTRAINT payroll_entries_wage_unit_check
    CHECK (wage_unit IN ('monthly', 'daily'));

CREATE OR REPLACE FUNCTION private.set_payroll_entry_pay_basis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_period_end date;
BEGIN
  SELECT (
    make_date(period.period_year, period.period_month, 1)
    + interval '1 month - 1 day'
  )::date
  INTO v_period_end
  FROM public.payroll_periods period
  WHERE period.id = NEW.payroll_period_id
    AND period.tenant_id = NEW.tenant_id;

  SELECT contract.pay_basis, contract.wage_unit, contract.daily_rate
  INTO NEW.pay_basis, NEW.wage_unit, NEW.daily_rate
  FROM public.employment_contracts contract
  WHERE contract.tenant_id = NEW.tenant_id
    AND contract.employee_id = NEW.employee_id
    AND contract.start_date <= v_period_end
    AND (contract.end_date IS NULL OR contract.end_date >= v_period_end)
  ORDER BY contract.start_date DESC, contract.id DESC
  LIMIT 1;

  NEW.pay_basis := COALESCE(NEW.pay_basis, 'attendance_prorated');
  NEW.wage_unit := COALESCE(NEW.wage_unit, 'monthly');
  RETURN NEW;
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
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_period_id bigint;
  v_period_status text;
  v_entry_count integer;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL
     OR NOT public.has_permission(NULL, 'hr:payroll_snapshot') THEN
    RAISE EXCEPTION 'missing_payroll_snapshot_permission' USING ERRCODE = '42501';
  END IF;
  IF p_period_year < 2020
     OR p_period_month NOT BETWEEN 1 AND 12
     OR p_standard_days IS NULL
     OR p_standard_days <= 0
     OR p_standard_days > 31
     OR p_entries IS NULL
     OR jsonb_typeof(p_entries) <> 'array'
     OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'invalid_payroll_snapshot' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:%s:%s', v_tenant_id, p_period_year, p_period_month), 0)
  );

  SELECT period.id, period.status
  INTO v_period_id, v_period_status
  FROM public.payroll_periods period
  WHERE period.tenant_id = v_tenant_id
    AND period.period_year = p_period_year
    AND period.period_month = p_period_month
  FOR UPDATE;

  IF FOUND AND v_period_status IN ('approved', 'paid') THEN
    SELECT count(*)::integer
    INTO v_entry_count
    FROM public.payroll_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.payroll_period_id = v_period_id;

    RETURN jsonb_build_object(
      'period_id', v_period_id,
      'employee_count', v_entry_count,
      'status', 'already_finalized'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) entry
    GROUP BY entry.employee_id
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) entry
    LEFT JOIN public.employees employee
      ON employee.id = entry.employee_id
     AND employee.tenant_id = v_tenant_id
    WHERE employee.id IS NULL
      OR entry.working_days IS NULL OR entry.working_days < 0
      OR entry.paid_leave_days IS NULL OR entry.paid_leave_days < 0
      OR entry.unpaid_leave_days IS NULL OR entry.unpaid_leave_days < 0
      OR entry.payable_days IS NULL OR entry.payable_days < 0
      OR (
        COALESCE(entry.wage_unit, 'monthly') = 'monthly'
        AND entry.payable_days > p_standard_days
      )
      OR entry.standard_days IS DISTINCT FROM p_standard_days
      OR entry.base_salary IS NULL OR entry.base_salary < 0
      OR entry.gross_total IS NULL OR entry.gross_total < 0
      OR entry.net_salary IS NULL OR entry.net_salary < 0
  ) THEN
    RAISE EXCEPTION 'invalid_payroll_entry' USING ERRCODE = '23514';
  END IF;

  IF v_period_id IS NULL THEN
    INSERT INTO public.payroll_periods (
      tenant_id, period_year, period_month, standard_days,
      status, approved_by, approved_at
    ) VALUES (
      v_tenant_id, p_period_year, p_period_month, p_standard_days,
      'approved', v_user_id, now()
    )
    RETURNING id INTO v_period_id;
  ELSE
    UPDATE public.payroll_periods
    SET standard_days = p_standard_days,
        status = 'approved',
        approved_by = v_user_id,
        approved_at = now(),
        updated_at = now()
    WHERE id = v_period_id
      AND tenant_id = v_tenant_id;
  END IF;

  DELETE FROM public.payroll_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.payroll_period_id = v_period_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) source
      WHERE source.employee_id = entry.employee_id
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
    insurance_base, wage_unit, daily_rate
  )
  SELECT
    v_tenant_id, v_period_id, entry.employee_id,
    entry.working_days, entry.paid_leave_days, entry.unpaid_leave_days, entry.payable_days,
    entry.standard_days, entry.overtime_hours, entry.base_salary, entry.allowances,
    entry.tax_exempt_allowances, entry.overtime_pay, entry.bonus, entry.gross_total,
    entry.bhxh_employee, entry.bhyt_employee, entry.bhtn_employee, entry.total_insurance_employee,
    entry.bhxh_employer, entry.bhyt_employer, entry.bhtn_employer, entry.total_insurance_employer,
    entry.personal_deduction, entry.dependent_count, entry.dependent_deduction, entry.charity_deduction,
    entry.taxable_income, entry.pit_tax, entry.advance_deduction, entry.other_deductions, entry.net_salary,
    entry.insurance_base, COALESCE(entry.wage_unit, 'monthly'), entry.daily_rate
  FROM jsonb_populate_recordset(NULL::public.payroll_entries, p_entries) entry
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
    wage_unit = EXCLUDED.wage_unit,
    daily_rate = EXCLUDED.daily_rate;

  SELECT count(*)::integer
  INTO v_entry_count
  FROM public.payroll_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.payroll_period_id = v_period_id;

  RETURN jsonb_build_object(
    'period_id', v_period_id,
    'employee_count', v_entry_count,
    'status', 'approved'
  );
END;
$$;
