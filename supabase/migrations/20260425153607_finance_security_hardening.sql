-- =============================================================
-- M6 Finance — Security review hardening
-- =============================================================
-- Closes 2 HIGH + 1 MED finding from /cso review 2026-04-25:
--
-- Finding #1+#3 (HIGH): fn_eval_account_expr was GRANTed to authenticated
--   and accepted caller-supplied p_tenant_id without check, enabling
--   cross-tenant data exfiltration via direct RPC call. The DSL also did
--   not validate the `account` string — a `%` or empty value broadened
--   `LIKE v_acc || '%'` prefix to all accounts.
--   Fix: REVOKE from authenticated (wrappers are SECURITY DEFINER so they
--   call as function owner regardless); add strict regex on account; add
--   tenant gate at function entry as defense-in-depth.
--
-- Finding #4 (MED): transition_tax_invoice_state used shallow JSONB merge
--   `provider_data || p_payload` which let caller overwrite arbitrary
--   top-level keys (e.g. tenant_id, original MISA receipt). Cancel then
--   silently nuked the original signing receipt.
--   Fix: namespace per state — `provider_data || {p_to_status: p_payload}`.
--   Old keys are preserved; the state-named slot owns its own payload.

-- ─── 1. fn_eval_account_expr: lock down + validate ───
CREATE OR REPLACE FUNCTION public.fn_eval_account_expr(
  p_tenant_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE,
  p_expr       JSONB
)
RETURNS NUMERIC(15,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op   TEXT;
  v_acc  TEXT;
  v_sum  NUMERIC(15,2) := 0;
  v_arg  JSONB;
  v_val  NUMERIC(15,2);
BEGIN
  -- Defense-in-depth tenant gate (wrappers gate too, but this prevents
  -- direct misuse if EXECUTE is ever granted again).
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  v_op := p_expr ->> 'op';

  IF v_op IN ('balance', 'debit_balance', 'credit_balance', 'period_credit', 'period_debit') THEN
    v_acc := p_expr ->> 'account';
    IF v_acc IS NULL OR v_acc !~ '^[0-9]{3,8}$' THEN
      RAISE EXCEPTION 'invalid_account_code: %', COALESCE(v_acc, '<null>')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_op = 'balance' THEN
    SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date <= p_end_date
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND coa.account_code LIKE v_acc || '%';
    RETURN v_sum;

  ELSIF v_op = 'debit_balance' THEN
    SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date <= p_end_date
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND coa.account_code LIKE v_acc || '%';
    RETURN GREATEST(v_sum, 0);

  ELSIF v_op = 'credit_balance' THEN
    SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date <= p_end_date
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND coa.account_code LIKE v_acc || '%';
    RETURN GREATEST(v_sum, 0);

  ELSIF v_op = 'period_credit' THEN
    IF p_start_date IS NULL THEN RETURN 0; END IF;
    SELECT COALESCE(SUM(jel.credit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
      AND coa.account_code LIKE v_acc || '%';
    RETURN v_sum;

  ELSIF v_op = 'period_debit' THEN
    IF p_start_date IS NULL THEN RETURN 0; END IF;
    SELECT COALESCE(SUM(jel.debit_amount), 0)
    INTO v_sum
    FROM public.journal_entry_lines jel
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
      AND coa.account_code LIKE v_acc || '%';
    RETURN v_sum;

  ELSIF v_op = 'sum' THEN
    FOR v_arg IN SELECT * FROM jsonb_array_elements(p_expr -> 'args') LOOP
      v_sum := v_sum + public.fn_eval_account_expr(p_tenant_id, p_start_date, p_end_date, v_arg);
    END LOOP;
    RETURN v_sum;

  ELSIF v_op = 'negate' THEN
    RETURN -1 * public.fn_eval_account_expr(p_tenant_id, p_start_date, p_end_date, p_expr -> 'arg');

  ELSIF v_op = 'max_zero' THEN
    v_val := public.fn_eval_account_expr(p_tenant_id, p_start_date, p_end_date, p_expr -> 'arg');
    RETURN GREATEST(v_val, 0);

  ELSIF v_op = 'literal' THEN
    RETURN COALESCE((p_expr ->> 'value')::NUMERIC(15,2), 0);

  ELSE
    RAISE EXCEPTION 'unknown_dsl_op: %', v_op USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Lock down: only wrapper RPCs (also SECURITY DEFINER) need to call this.
-- Direct authenticated execution is no longer needed and was the lateral-move risk.
REVOKE EXECUTE ON FUNCTION public.fn_eval_account_expr(BIGINT, DATE, DATE, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_eval_account_expr(BIGINT, DATE, DATE, JSONB) FROM authenticated;


-- ─── 2. transition_tax_invoice_state: namespace provider_data ───
CREATE OR REPLACE FUNCTION public.transition_tax_invoice_state(
  p_tax_invoice_id BIGINT,
  p_to_status      TEXT,
  p_payload        JSONB DEFAULT NULL,
  p_note           TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice  RECORD;
  v_uid      UUID := auth.uid();
  v_allowed  BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices
  WHERE id = p_tax_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_to_status IN ('cancelled', 'replaced') THEN
    IF NOT public.has_permission_any('settings:tenant') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission_any('orders:write') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_allowed := (
    (v_invoice.status = 'draft'     AND p_to_status IN ('signing', 'cancelled'))
    OR (v_invoice.status = 'signing'   AND p_to_status IN ('submitted', 'issued', 'draft', 'cancelled'))
    OR (v_invoice.status = 'submitted' AND p_to_status IN ('issued', 'cancelled'))
    OR (v_invoice.status = 'issued'    AND p_to_status IN ('cancelled', 'replaced'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal_transition: % -> %', v_invoice.status, p_to_status
      USING ERRCODE = '22023';
  END IF;

  -- Namespace per state — keeps original signing/issue receipt intact when
  -- a later cancel/replace appends its own payload. Caller can no longer
  -- overwrite arbitrary top-level keys (e.g. tenant_id) via JSONB shallow
  -- merge.
  UPDATE public.tax_invoices
  SET
    status = p_to_status,
    issued_at = CASE WHEN p_to_status = 'issued' THEN now() ELSE issued_at END,
    cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    signing_started_at = CASE WHEN p_to_status = 'signing' THEN now() ELSE signing_started_at END,
    provider_data = CASE
      WHEN p_payload IS NULL THEN provider_data
      ELSE COALESCE(provider_data, '{}'::JSONB) || jsonb_build_object(p_to_status, p_payload)
    END,
    updated_at = now()
  WHERE id = p_tax_invoice_id;

  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
  VALUES
    (p_tax_invoice_id, v_invoice.tenant_id, v_invoice.status, p_to_status, v_uid, p_payload, p_note);

  RETURN jsonb_build_object(
    'tax_invoice_id', p_tax_invoice_id,
    'from_status', v_invoice.status,
    'to_status', p_to_status
  );
END;
$$;
