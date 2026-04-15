-- =============================================================
-- GL Auto-Posting: Phase 2.2 — post_payroll_journal() RPC
-- Aggregates payroll entries and creates a multi-line journal:
--   Dr 622 (Lương) / Cr 334 (Phải trả NLĐ)
--   Dr 627 (BHXH/BHYT/BHTN DN) / Cr 3383,3384,3386
--   Dr 334 / Cr 3335 (Thuế TNCN)
-- =============================================================

CREATE OR REPLACE FUNCTION public.post_payroll_journal(p_payroll_period_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_period          RECORD;
  v_totals          RECORD;
  v_lines           JSONB := '[]'::JSONB;
  v_journal_id      BIGINT;
  v_desc            TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Role check: only owner/super_manager can post payroll journals
  IF public.auth_role() NOT IN ('owner', 'super_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Fetch and validate period
  SELECT pp.*
  INTO v_period
  FROM public.payroll_periods pp
  WHERE pp.id = p_payroll_period_id AND pp.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payroll_period_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Only post for approved or paid periods, and only once
  IF v_period.status NOT IN ('approved', 'paid') THEN
    RAISE EXCEPTION 'payroll_not_approved' USING ERRCODE = '22023';
  END IF;

  IF v_period.journal_entry_id IS NOT NULL THEN
    -- Already posted — return existing
    RETURN v_period.journal_entry_id;
  END IF;

  -- Aggregate all entries in this period
  SELECT
    COALESCE(SUM(pe.gross_total), 0) AS total_gross,
    COALESCE(SUM(pe.bhxh_employee), 0) AS total_bhxh_ee,
    COALESCE(SUM(pe.bhyt_employee), 0) AS total_bhyt_ee,
    COALESCE(SUM(pe.bhtn_employee), 0) AS total_bhtn_ee,
    COALESCE(SUM(pe.bhxh_employer), 0) AS total_bhxh_er,
    COALESCE(SUM(pe.bhyt_employer), 0) AS total_bhyt_er,
    COALESCE(SUM(pe.bhtn_employer), 0) AS total_bhtn_er,
    COALESCE(SUM(pe.pit_tax), 0) AS total_pit
  INTO v_totals
  FROM public.payroll_entries pe
  WHERE pe.payroll_period_id = p_payroll_period_id
    AND pe.tenant_id = v_tenant;

  -- Build journal lines

  -- 1. Gross salary: Dr 622 / Cr 334
  IF v_totals.total_gross > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_SALARY',
      'amount', v_totals.total_gross,
      'line_description', 'Lương T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  -- 2. Employer BHXH: Dr 627 / Cr 3383
  IF v_totals.total_bhxh_er > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_BHXH_ER',
      'amount', v_totals.total_bhxh_er,
      'line_description', 'BHXH DN T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  -- 3. Employer BHYT: Dr 627 / Cr 3384
  IF v_totals.total_bhyt_er > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_BHYT_ER',
      'amount', v_totals.total_bhyt_er,
      'line_description', 'BHYT DN T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  -- 4. Employer BHTN: Dr 627 / Cr 3386
  IF v_totals.total_bhtn_er > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_BHTN_ER',
      'amount', v_totals.total_bhtn_er,
      'line_description', 'BHTN DN T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  -- 5. PIT withholding: Dr 334 / Cr 3335
  IF v_totals.total_pit > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_PIT',
      'amount', v_totals.total_pit,
      'line_description', 'Thuế TNCN T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  -- 6. Employee BHXH deduction: Dr 334 / Cr 3383
  IF v_totals.total_bhxh_ee > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_BHXH_EE',
      'amount', v_totals.total_bhxh_ee,
      'line_description', 'BHXH NLĐ T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  -- 7. Employee BHYT deduction: Dr 334 / Cr 3384
  IF v_totals.total_bhyt_ee > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_BHYT_EE',
      'amount', v_totals.total_bhyt_ee,
      'line_description', 'BHYT NLĐ T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  -- 8. Employee BHTN deduction: Dr 334 / Cr 3386
  IF v_totals.total_bhtn_ee > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PAYROLL_BHTN_EE',
      'amount', v_totals.total_bhtn_ee,
      'line_description', 'BHTN NLĐ T' || v_period.period_month || '/' || v_period.period_year
    ));
  END IF;

  v_desc := 'Lương tháng ' || v_period.period_month || '/' || v_period.period_year;

  -- Use last day of the payroll period as entry_date (not now()).
  -- This ensures the journal lands in the correct fiscal period,
  -- even when approved in a later month.
  v_journal_id := public.auto_post_journal(
    v_tenant,
    NULL,  -- payroll is tenant-level, not branch-specific
    'payroll',
    p_payroll_period_id,
    v_desc,
    v_lines,
    (make_date(v_period.period_year, v_period.period_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::TIMESTAMPTZ,
    v_uid
  );

  -- Link journal to payroll period
  IF v_journal_id IS NOT NULL THEN
    UPDATE public.payroll_periods
    SET journal_entry_id = v_journal_id
    WHERE id = p_payroll_period_id;
  END IF;

  RETURN v_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_payroll_journal(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_payroll_journal(BIGINT) TO authenticated;
