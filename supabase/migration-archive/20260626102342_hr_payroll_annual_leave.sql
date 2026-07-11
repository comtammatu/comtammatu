ALTER TABLE public.payroll_periods
  ADD COLUMN standard_days numeric(5,1) NOT NULL DEFAULT 26,
  ADD CONSTRAINT payroll_periods_standard_days_check CHECK (standard_days > 0);

ALTER TABLE public.payroll_entries
  ADD COLUMN paid_leave_days numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN unpaid_leave_days numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN payable_days numeric(5,1) NOT NULL DEFAULT 0;

UPDATE public.payroll_entries
SET payable_days = LEAST(working_days, standard_days)
WHERE payable_days = 0;

CREATE TABLE public.annual_leave_entitlements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id bigint NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year integer NOT NULL,
  entitlement_days numeric(5,1) NOT NULL DEFAULT 12,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annual_leave_entitlements_year_check CHECK (year >= 2020 AND year <= 2100),
  CONSTRAINT annual_leave_entitlements_days_check CHECK (entitlement_days >= 0 AND entitlement_days <= 60),
  CONSTRAINT annual_leave_entitlements_employee_year_key UNIQUE (tenant_id, employee_id, year)
);

CREATE INDEX idx_annual_leave_entitlements_employee_year
  ON public.annual_leave_entitlements (tenant_id, employee_id, year);

CREATE TRIGGER trg_annual_leave_entitlements_updated_at
  BEFORE UPDATE ON public.annual_leave_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.annual_leave_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY annual_leave_entitlements_select
  ON public.annual_leave_entitlements
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1
        FROM public.employees e
        WHERE e.id = annual_leave_entitlements.employee_id
          AND e.tenant_id = public.auth_tenant_id()
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission_any('hr:view_employee')
      OR EXISTS (
        SELECT 1
        FROM public.employees e
        JOIN public.profiles p
          ON p.id = e.profile_id
         AND p.tenant_id = e.tenant_id
        WHERE e.id = annual_leave_entitlements.employee_id
          AND e.tenant_id = public.auth_tenant_id()
          AND p.branch_id IS NOT NULL
          AND public.has_permission(p.branch_id, 'hr:approve_leave_request')
      )
    )
  );

REVOKE ALL ON TABLE public.annual_leave_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.annual_leave_entitlements TO authenticated;
GRANT ALL ON TABLE public.annual_leave_entitlements TO service_role;
GRANT ALL ON SEQUENCE public.annual_leave_entitlements_id_seq TO service_role;

INSERT INTO public.annual_leave_entitlements (
  tenant_id,
  employee_id,
  year,
  entitlement_days
)
SELECT
  e.tenant_id,
  e.id,
  2026,
  CASE
    WHEN e.start_date IS NULL OR e.start_date < DATE '2026-01-01' THEN 12
    WHEN e.start_date > DATE '2026-12-31' THEN 0
    ELSE GREATEST(0, 13 - EXTRACT(MONTH FROM e.start_date)::integer)::numeric
  END
FROM public.employees e
WHERE e.is_active = true
ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;

CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
  v_year_row  RECORD;
  v_entitlement_days NUMERIC;
  v_used_days NUMERIC;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_leave_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.leave_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'approve_leave_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(v_request.branch_id, 'hr:approve_leave_request') THEN
    RAISE EXCEPTION 'approve_leave_request: missing permission for this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'approve_leave_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'approve_leave_request: cannot review own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(v_request.employee_id);

  IF v_request.leave_type = 'annual' THEN
    FOR v_year_row IN
      SELECT
        EXTRACT(YEAR FROM day)::integer AS leave_year,
        COUNT(*)::numeric AS requested_days
      FROM generate_series(v_request.start_date, v_request.end_date, INTERVAL '1 day') AS day
      GROUP BY 1
    LOOP
      INSERT INTO public.annual_leave_entitlements (
        tenant_id,
        employee_id,
        year,
        entitlement_days
      )
      SELECT
        v_tenant_id,
        v_request.employee_id,
        v_year_row.leave_year,
        CASE
          WHEN e.start_date IS NULL OR e.start_date < make_date(v_year_row.leave_year, 1, 1) THEN 12
          WHEN e.start_date > make_date(v_year_row.leave_year, 12, 31) THEN 0
          ELSE GREATEST(0, 13 - EXTRACT(MONTH FROM e.start_date)::integer)::numeric
        END
      FROM public.employees e
      WHERE e.id = v_request.employee_id
        AND e.tenant_id = v_tenant_id
      ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;

      SELECT entitlement_days INTO v_entitlement_days
      FROM public.annual_leave_entitlements
      WHERE tenant_id = v_tenant_id
        AND employee_id = v_request.employee_id
        AND year = v_year_row.leave_year
      FOR UPDATE;

      SELECT COALESCE(
        SUM(
          LEAST(lr.end_date, make_date(v_year_row.leave_year, 12, 31))
          - GREATEST(lr.start_date, make_date(v_year_row.leave_year, 1, 1))
          + 1
        ),
        0
      )::numeric INTO v_used_days
      FROM public.leave_requests lr
      WHERE lr.tenant_id = v_tenant_id
        AND lr.employee_id = v_request.employee_id
        AND lr.leave_type = 'annual'
        AND lr.status = 'approved'
        AND lr.start_date <= make_date(v_year_row.leave_year, 12, 31)
        AND lr.end_date >= make_date(v_year_row.leave_year, 1, 1);

      IF v_used_days + v_year_row.requested_days > COALESCE(v_entitlement_days, 0) THEN
        RAISE EXCEPTION 'approve_leave_request: annual leave quota exceeded'
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  UPDATE public.leave_requests
  SET status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'leave_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_payroll_calculation(p_period_id bigint, p_entries jsonb) RETURNS jsonb
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
    working_days, paid_leave_days, unpaid_leave_days, payable_days,
    standard_days, overtime_hours, base_salary, allowances,
    tax_exempt_allowances, overtime_pay, bonus, gross_total,
    bhxh_employee, bhyt_employee, bhtn_employee, total_insurance_employee,
    bhxh_employer, bhyt_employer, bhtn_employer, total_insurance_employer,
    personal_deduction, dependent_count, dependent_deduction, charity_deduction,
    taxable_income, pit_tax, advance_deduction, other_deductions, net_salary, insurance_base
  )
  SELECT
    v_tenant, p_period_id, x.employee_id,
    x.working_days, x.paid_leave_days, x.unpaid_leave_days, x.payable_days,
    x.standard_days, x.overtime_hours, x.base_salary, x.allowances,
    x.tax_exempt_allowances, x.overtime_pay, x.bonus, x.gross_total,
    x.bhxh_employee, x.bhyt_employee, x.bhtn_employee, x.total_insurance_employee,
    x.bhxh_employer, x.bhyt_employer, x.bhtn_employer, x.total_insurance_employer,
    x.personal_deduction, x.dependent_count, x.dependent_deduction, x.charity_deduction,
    x.taxable_income, x.pit_tax, x.advance_deduction, x.other_deductions, x.net_salary, x.insurance_base
  FROM jsonb_to_recordset(p_entries) AS x(
    employee_id bigint,
    working_days numeric, paid_leave_days numeric, unpaid_leave_days numeric, payable_days numeric,
    standard_days numeric, overtime_hours numeric,
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

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.payroll_periods
  SET status = 'calculated'
  WHERE id = p_period_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('employee_count', v_count, 'status', 'calculated');
END;
$$;
