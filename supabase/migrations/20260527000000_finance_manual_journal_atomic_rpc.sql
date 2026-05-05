-- =============================================================
-- M6 Finance - manual journal RPC-only atomic writes
-- =============================================================
-- Manual journal creation currently inserts journal_entries and
-- journal_entry_lines from the app in separate statements. This migration
-- moves create/post/void into SECURITY DEFINER RPCs so GL-impacting writes
-- are single-transaction operations.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS void_journal_entry_id BIGINT
    REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS voided_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

COMMENT ON COLUMN public.journal_entries.void_journal_entry_id IS
  'For posted-entry voids, points to the reversing journal entry created by void_manual_journal_entry.';

CREATE OR REPLACE FUNCTION public.next_manual_journal_entry_number(
  p_tenant_id  BIGINT,
  p_entry_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_date_key TEXT;
  v_next     INT;
  v_suffix   TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_entry_date IS NULL THEN
    RAISE EXCEPTION 'journal_entry_number: tenant and date required'
      USING ERRCODE = '22023';
  END IF;

  v_date_key := to_char(p_entry_date, 'YYYYMMDD');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('journal_entry_number:' || p_tenant_id::TEXT || ':' || v_date_key, 0)
  );

  SELECT COALESCE(
    MAX(
      substring(entry_number FROM ('^JE-' || v_date_key || '-([0-9]{3,})$'))::INT
    ),
    0
  ) + 1
  INTO v_next
  FROM public.journal_entries
  WHERE tenant_id = p_tenant_id
    AND entry_number LIKE 'JE-' || v_date_key || '-%';

  v_suffix := CASE
    WHEN v_next < 1000 THEN lpad(v_next::TEXT, 3, '0')
    ELSE v_next::TEXT
  END;

  RETURN 'JE-' || v_date_key || '-' || v_suffix;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_manual_journal_entry_number(BIGINT, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_manual_journal_entry_number(BIGINT, DATE) FROM authenticated;

CREATE OR REPLACE FUNCTION public.ensure_journal_write_permission(
  p_branch_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    PERFORM 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = v_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch not found for tenant' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.has_permission(p_branch_id, 'finance:expense_approve') THEN
      RAISE EXCEPTION 'permission denied: finance:expense_approve required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(NULL, 'finance:expense_approve') THEN
      RAISE EXCEPTION 'permission denied: finance:expense_approve required'
        USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_journal_write_permission(BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_journal_write_permission(BIGINT) FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_manual_journal_entry(
  p_entry_date     DATE,
  p_description    TEXT,
  p_lines          JSONB,
  p_reference_type TEXT DEFAULT 'manual',
  p_reference_id   BIGINT DEFAULT NULL,
  p_branch_id      BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor        UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_description  TEXT;
  v_ref_type     TEXT := COALESCE(NULLIF(btrim(p_reference_type), ''), 'manual');
  v_entry_id     BIGINT;
  v_entry_number TEXT;
  v_line         JSONB;
  v_lines        JSONB := '[]'::JSONB;
  v_account_id   BIGINT;
  v_debit        NUMERIC(15,2);
  v_credit       NUMERIC(15,2);
  v_line_count   INT := 0;
  v_total_debit  NUMERIC(15,2) := 0;
  v_total_credit NUMERIC(15,2) := 0;
BEGIN
  PERFORM public.ensure_journal_write_permission(p_branch_id);

  IF p_entry_date IS NULL THEN
    RAISE EXCEPTION 'entry_date required' USING ERRCODE = '22023';
  END IF;

  v_description := btrim(COALESCE(p_description, ''));
  IF length(v_description) = 0 OR length(v_description) > 500 THEN
    RAISE EXCEPTION 'description invalid' USING ERRCODE = '22023';
  END IF;

  IF v_ref_type NOT IN (
    'sale', 'purchase', 'payroll', 'manual', 'adjustment',
    'transfer', 'production', 'refund'
  ) THEN
    RAISE EXCEPTION 'reference_type invalid' USING ERRCODE = '22023';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'journal lines must be an array' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := NULLIF(v_line->>'account_id', '')::BIGINT;
    v_debit := COALESCE(NULLIF(v_line->>'debit_amount', '')::NUMERIC, 0);
    v_credit := COALESCE(NULLIF(v_line->>'credit_amount', '')::NUMERIC, 0);

    IF v_account_id IS NULL OR v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'journal line invalid' USING ERRCODE = '22023';
    END IF;
    IF (v_debit = 0 AND v_credit = 0) OR (v_debit > 0 AND v_credit > 0) THEN
      RAISE EXCEPTION 'journal line must have exactly one debit or credit amount'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_account_id
      AND coa.tenant_id = v_tenant
      AND coa.is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'chart account invalid for tenant' USING ERRCODE = '23503';
    END IF;

    v_line_count := v_line_count + 1;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_account_id,
      'debit_amount', v_debit,
      'credit_amount', v_credit,
      'description', NULLIF(btrim(COALESCE(v_line->>'description', '')), '')
    ));
  END LOOP;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'journal entry requires at least two lines' USING ERRCODE = '22023';
  END IF;
  IF abs(v_total_debit - v_total_credit) > 0.01 OR v_total_debit <= 0 THEN
    RAISE EXCEPTION 'journal entry not balanced' USING ERRCODE = '22023';
  END IF;

  v_entry_number := public.next_manual_journal_entry_number(v_tenant, p_entry_date);

  INSERT INTO public.journal_entries (
    tenant_id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    created_by
  ) VALUES (
    v_tenant,
    p_branch_id,
    v_entry_number,
    p_entry_date::TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    v_description,
    v_ref_type,
    p_reference_id,
    'draft',
    v_actor
  )
  RETURNING id INTO v_entry_id;

  -- Explicitly lock header before writing lines (JE-LINE-WRITE-LOCKS-HEADER).
  PERFORM 1
  FROM public.journal_entries
  WHERE id = v_entry_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  INSERT INTO public.journal_entry_lines (
    tenant_id,
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  )
  SELECT
    v_tenant,
    v_entry_id,
    x.account_id,
    x.debit_amount,
    x.credit_amount,
    x.description
  FROM jsonb_to_recordset(v_lines) AS x(
    account_id BIGINT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  );

  PERFORM public.log_audit(
    'journal.create',
    'journal_entry',
    v_entry_id,
    NULL,
    jsonb_build_object(
      'status', 'draft',
      'entry_number', v_entry_number,
      'line_count', v_line_count,
      'total_debit', v_total_debit,
      'total_credit', v_total_credit
    )
  );

  RETURN jsonb_build_object(
    'id', v_entry_id,
    'entry_number', v_entry_number,
    'status', 'draft'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_manual_journal_entry(
  p_entry_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor        UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_entry        RECORD;
  v_total_debit  NUMERIC(15,2);
  v_total_credit NUMERIC(15,2);
  v_line_count   INT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'entry id required' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, branch_id, entry_number, status
  INTO v_entry
  FROM public.journal_entries
  WHERE id = p_entry_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'journal entry not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.ensure_journal_write_permission(v_entry.branch_id);

  IF v_entry.status <> 'draft' THEN
    RAISE EXCEPTION 'journal entry must be draft to post' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_line_count, v_total_debit, v_total_credit
  FROM public.journal_entry_lines
  WHERE journal_entry_id = p_entry_id
    AND tenant_id = v_tenant;

  IF v_line_count < 2 OR abs(v_total_debit - v_total_credit) > 0.01 OR v_total_debit <= 0 THEN
    RAISE EXCEPTION 'journal entry not balanced' USING ERRCODE = '22023';
  END IF;

  UPDATE public.journal_entries
     SET status = 'posted',
         posted_by = v_actor,
         posted_at = now()
   WHERE id = p_entry_id
     AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'journal.post',
    'journal_entry',
    p_entry_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'posted')
  );

  RETURN jsonb_build_object(
    'id', p_entry_id,
    'entry_number', v_entry.entry_number,
    'status', 'posted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.void_manual_journal_entry(
  p_entry_id BIGINT,
  p_reason   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor                UUID := auth.uid();
  v_tenant               BIGINT := public.auth_tenant_id();
  v_entry                RECORD;
  v_reason               TEXT;
  v_reverse_id           BIGINT;
  v_reverse_entry_number TEXT;
  v_reverse_date         DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
  v_period_status        TEXT;
  v_period_year          INT;
  v_period_month         INT;
  v_line_count           INT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'entry id required' USING ERRCODE = '22023';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 20 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'void reason invalid' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, branch_id, entry_number, entry_date, description,
         reference_type, reference_id, status, void_journal_entry_id
  INTO v_entry
  FROM public.journal_entries
  WHERE id = p_entry_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'journal entry not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.ensure_journal_write_permission(v_entry.branch_id);

  IF v_entry.status = 'voided' THEN
    RETURN jsonb_build_object(
      'id', p_entry_id,
      'status', 'already_voided',
      'void_journal_entry_id', v_entry.void_journal_entry_id
    );
  END IF;
  IF v_entry.status NOT IN ('draft', 'posted') THEN
    RAISE EXCEPTION 'journal entry cannot be voided from status %', v_entry.status
      USING ERRCODE = '22023';
  END IF;

  IF v_entry.status = 'draft' THEN
    UPDATE public.journal_entries
       SET status = 'voided',
           voided_reason = v_reason,
           voided_by = v_actor,
           voided_at = now()
     WHERE id = p_entry_id
       AND tenant_id = v_tenant;

    PERFORM public.log_audit(
      'journal.void',
      'journal_entry',
      p_entry_id,
      jsonb_build_object('status', 'draft'),
      jsonb_build_object('status', 'voided', 'reason', v_reason)
    );

    RETURN jsonb_build_object(
      'id', p_entry_id,
      'status', 'voided',
      'void_journal_entry_id', NULL
    );
  END IF;

  v_period_year := EXTRACT(YEAR FROM v_reverse_date)::INT;
  v_period_month := EXTRACT(MONTH FROM v_reverse_date)::INT;

  SELECT fp.status
  INTO v_period_status
  FROM public.fiscal_periods fp
  WHERE fp.tenant_id = v_tenant
    AND fp.period_year = v_period_year
    AND fp.period_month = v_period_month
  FOR SHARE;

  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'current_period_closed_cannot_reverse'
      USING ERRCODE = '23514';
  END IF;

  IF v_period_status IS NULL THEN
    INSERT INTO public.fiscal_periods (tenant_id, period_month, period_year, status)
    VALUES (v_tenant, v_period_month, v_period_year, 'open')
    ON CONFLICT (period_month, period_year, tenant_id) DO NOTHING;
  END IF;

  v_reverse_entry_number := public.next_manual_journal_entry_number(v_tenant, v_reverse_date);

  INSERT INTO public.journal_entries (
    tenant_id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    posted_by,
    posted_at,
    created_by
  ) VALUES (
    v_tenant,
    v_entry.branch_id,
    v_reverse_entry_number,
    v_reverse_date::TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'Đảo bút toán ' || v_entry.entry_number || ': ' || v_reason,
    'adjustment',
    p_entry_id,
    'posted',
    v_actor,
    now(),
    v_actor
  )
  RETURNING id INTO v_reverse_id;

  PERFORM 1
  FROM public.journal_entries
  WHERE id = v_reverse_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  INSERT INTO public.journal_entry_lines (
    tenant_id,
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  )
  SELECT
    v_tenant,
    v_reverse_id,
    account_id,
    credit_amount,
    debit_amount,
    'Đảo dòng từ ' || v_entry.entry_number
  FROM public.journal_entry_lines
  WHERE journal_entry_id = p_entry_id
    AND tenant_id = v_tenant;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'posted journal entry has no lines' USING ERRCODE = '22023';
  END IF;

  UPDATE public.journal_entries
     SET status = 'voided',
         voided_reason = v_reason,
         voided_by = v_actor,
         voided_at = now(),
         void_journal_entry_id = v_reverse_id
   WHERE id = p_entry_id
     AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'journal.void',
    'journal_entry',
    p_entry_id,
    jsonb_build_object('status', 'posted'),
    jsonb_build_object(
      'status', 'voided',
      'reason', v_reason,
      'void_journal_entry_id', v_reverse_id
    )
  );

  RETURN jsonb_build_object(
    'id', p_entry_id,
    'status', 'voided',
    'void_journal_entry_id', v_reverse_id,
    'void_journal_entry_number', v_reverse_entry_number
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_journal_entry(DATE, TEXT, JSONB, TEXT, BIGINT, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_manual_journal_entry(BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_manual_journal_entry(BIGINT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_manual_journal_entry(DATE, TEXT, JSONB, TEXT, BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_manual_journal_entry(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_manual_journal_entry(BIGINT, TEXT) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.journal_entry_lines FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.journal_entries FROM authenticated;
GRANT SELECT ON TABLE public.journal_entries TO authenticated;
GRANT SELECT ON TABLE public.journal_entry_lines TO authenticated;

COMMENT ON FUNCTION public.create_manual_journal_entry(DATE, TEXT, JSONB, TEXT, BIGINT, BIGINT) IS
  'Creates a draft manual journal entry and all lines atomically. Gated by finance:expense_approve.';
COMMENT ON FUNCTION public.post_manual_journal_entry(BIGINT) IS
  'Posts a draft manual journal entry atomically after locking the header and validating balance.';
COMMENT ON FUNCTION public.void_manual_journal_entry(BIGINT, TEXT) IS
  'Voids draft entries directly. For posted entries, creates a reversing posted entry in the current period, then marks the original voided.';
