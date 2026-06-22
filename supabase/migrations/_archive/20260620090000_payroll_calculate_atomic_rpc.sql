-- Atomic payroll calculate: entries upsert + clean-recompute delete + status flip in one transaction.
-- Intentionally NO EXCEPTION block — a caught error would commit the partial writes this RPC exists to prevent.
CREATE OR REPLACE FUNCTION public.upsert_payroll_calculation(p_period_id bigint, p_entries jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_period RECORD;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_permission_any('finance:payroll_calculate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'invalid_payroll_entries' USING ERRCODE = '22023';
  END IF;

  SELECT pp.id, pp.status INTO v_period
  FROM public.payroll_periods pp
  WHERE pp.id = p_period_id AND pp.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payroll_period_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_period.status NOT IN ('draft', 'calculated') THEN
    RAISE EXCEPTION 'payroll_locked' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.payroll_entries pe
  WHERE pe.payroll_period_id = p_period_id
    AND pe.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_entries) x
      WHERE (x->>'employee_id')::bigint = pe.employee_id
    );

  INSERT INTO public.payroll_entries (
    tenant_id, payroll_period_id, employee_id,
    working_days, standard_days, overtime_hours, base_salary, allowances,
    tax_exempt_allowances, overtime_pay, bonus, gross_total,
    bhxh_employee, bhyt_employee, bhtn_employee, total_insurance_employee,
    bhxh_employer, bhyt_employer, bhtn_employer, total_insurance_employer,
    personal_deduction, dependent_count, dependent_deduction, charity_deduction,
    taxable_income, pit_tax, advance_deduction, other_deductions, net_salary, insurance_base
  )
  SELECT
    v_tenant, p_period_id, x.employee_id,
    x.working_days, x.standard_days, x.overtime_hours, x.base_salary, x.allowances,
    x.tax_exempt_allowances, x.overtime_pay, x.bonus, x.gross_total,
    x.bhxh_employee, x.bhyt_employee, x.bhtn_employee, x.total_insurance_employee,
    x.bhxh_employer, x.bhyt_employer, x.bhtn_employer, x.total_insurance_employer,
    x.personal_deduction, x.dependent_count, x.dependent_deduction, x.charity_deduction,
    x.taxable_income, x.pit_tax, x.advance_deduction, x.other_deductions, x.net_salary, x.insurance_base
  FROM jsonb_to_recordset(p_entries) AS x(
    employee_id bigint,
    working_days numeric, standard_days numeric, overtime_hours numeric,
    base_salary numeric, allowances numeric, tax_exempt_allowances numeric,
    overtime_pay numeric, bonus numeric, gross_total numeric,
    bhxh_employee numeric, bhyt_employee numeric, bhtn_employee numeric, total_insurance_employee numeric,
    bhxh_employer numeric, bhyt_employer numeric, bhtn_employer numeric, total_insurance_employer numeric,
    personal_deduction numeric, dependent_count integer, dependent_deduction numeric, charity_deduction numeric,
    taxable_income numeric, pit_tax numeric, advance_deduction numeric, other_deductions numeric,
    net_salary numeric, insurance_base numeric
  )
  ON CONFLICT (payroll_period_id, employee_id, tenant_id) DO UPDATE SET
    working_days = EXCLUDED.working_days,
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

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.payroll_periods
  SET status = 'calculated'
  WHERE id = p_period_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('employee_count', v_count, 'status', 'calculated');
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_payroll_calculation(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_payroll_calculation(bigint, jsonb) TO authenticated;
