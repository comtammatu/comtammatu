-- =============================================================
-- GL Phase 3.2 — Period enforcement in auto_post_journal()
-- Before inserting a journal, check fiscal period is 'open'.
-- If closed → raise exception. If no period exists → auto-create.
-- =============================================================

CREATE OR REPLACE FUNCTION public.auto_post_journal(
  p_tenant_id       BIGINT,
  p_branch_id       BIGINT,
  p_reference_type  TEXT,
  p_reference_id    BIGINT,
  p_description     TEXT,
  p_lines           JSONB,
  p_entry_date      TIMESTAMPTZ DEFAULT now(),
  p_posted_by       UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id      BIGINT;
  v_entry_number  TEXT;
  v_line          JSONB;
  v_rule          RECORD;
  v_dr_account_id BIGINT;
  v_cr_account_id BIGINT;
  v_amount        NUMERIC(15,2);
  v_line_desc     TEXT;
  v_lines_count   INT := 0;
  v_total_dr      NUMERIC(15,2) := 0;
  v_total_cr      NUMERIC(15,2) := 0;
  v_actor         UUID;
  v_period_month  INT;
  v_period_year   INT;
  v_period_status TEXT;
BEGIN
  -- Resolve actor
  v_actor := COALESCE(p_posted_by, auth.uid());

  -- ═══ FISCAL PERIOD CHECK ═══
  v_period_month := EXTRACT(MONTH FROM p_entry_date)::INT;
  v_period_year  := EXTRACT(YEAR FROM p_entry_date)::INT;

  SELECT fp.status INTO v_period_status
  FROM public.fiscal_periods fp
  WHERE fp.tenant_id = p_tenant_id
    AND fp.period_month = v_period_month
    AND fp.period_year = v_period_year;

  IF FOUND THEN
    IF v_period_status = 'closed' THEN
      RAISE EXCEPTION 'fiscal_period_closed: %-% is closed, cannot post journal',
        v_period_year, lpad(v_period_month::text, 2, '0')
        USING ERRCODE = '23514';
    END IF;
    -- 'open' or 'closing' → allow (closing permits adjusting entries)
  ELSE
    -- Auto-create open period if it doesn't exist
    INSERT INTO public.fiscal_periods (tenant_id, period_month, period_year, status)
    VALUES (p_tenant_id, v_period_month, v_period_year, 'open')
    ON CONFLICT (period_month, period_year, tenant_id) DO NOTHING;
  END IF;

  -- Generate auto entry number: AUTO-YYYYMMDD-NNNNNN
  v_entry_number := 'AUTO-' || to_char(p_entry_date, 'YYYYMMDD') || '-'
                    || lpad(nextval('public.auto_journal_seq')::TEXT, 6, '0');

  -- Create journal header (status = posted, skips draft)
  INSERT INTO public.journal_entries (
    tenant_id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status,
    posted_by, posted_at, created_by
  ) VALUES (
    p_tenant_id, p_branch_id, v_entry_number, p_entry_date, p_description,
    p_reference_type, p_reference_id, 'posted',
    v_actor, now(), v_actor
  )
  RETURNING id INTO v_entry_id;

  -- Process each line from p_lines JSONB array
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    -- Lookup posting rule
    SELECT pr.*
    INTO v_rule
    FROM public.posting_rules pr
    WHERE pr.tenant_id = p_tenant_id
      AND pr.rule_code = (v_line ->> 'rule_code')
      AND pr.is_active = true;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_amount := (v_line ->> 'amount')::NUMERIC(15,2);
    v_line_desc := v_line ->> 'line_description';

    IF v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Resolve debit account_id
    SELECT id INTO v_dr_account_id
    FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND account_code = v_rule.debit_account_code AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'gl_account_not_found: debit % for rule %', v_rule.debit_account_code, v_rule.rule_code
        USING ERRCODE = 'P0002';
    END IF;

    -- Resolve credit account_id
    SELECT id INTO v_cr_account_id
    FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND account_code = v_rule.credit_account_code AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'gl_account_not_found: credit % for rule %', v_rule.credit_account_code, v_rule.rule_code
        USING ERRCODE = 'P0002';
    END IF;

    -- Insert debit line
    INSERT INTO public.journal_entry_lines (
      tenant_id, journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES (
      p_tenant_id, v_entry_id, v_dr_account_id, v_amount, 0,
      COALESCE(v_line_desc, v_rule.description)
    );

    -- Insert credit line
    INSERT INTO public.journal_entry_lines (
      tenant_id, journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES (
      p_tenant_id, v_entry_id, v_cr_account_id, 0, v_amount,
      COALESCE(v_line_desc, v_rule.description)
    );

    v_total_dr := v_total_dr + v_amount;
    v_total_cr := v_total_cr + v_amount;
    v_lines_count := v_lines_count + 1;
  END LOOP;

  -- If no valid lines, delete empty header and return NULL
  IF v_lines_count = 0 THEN
    DELETE FROM public.journal_entries WHERE id = v_entry_id;
    RETURN NULL;
  END IF;

  -- Safety: validate balance
  IF NOT public.validate_journal_balance(v_entry_id) THEN
    RAISE EXCEPTION 'auto_post_journal: balance validation failed for entry %', v_entry_id
      USING ERRCODE = '23514';
  END IF;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_post_journal(BIGINT, BIGINT, TEXT, BIGINT, TEXT, JSONB, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_post_journal(BIGINT, BIGINT, TEXT, BIGINT, TEXT, JSONB, TIMESTAMPTZ, UUID) TO authenticated;
