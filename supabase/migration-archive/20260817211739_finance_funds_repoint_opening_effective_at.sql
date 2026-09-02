-- Owner may backdate finance opening effective_at when the original clock
-- was wrong. Cash/bank amounts stay frozen. MB statement restore then
-- counts rows from statement start without a duplicate opening adjustment.

CREATE OR REPLACE FUNCTION private.reject_finance_fund_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.entry_type = 'opening'
    AND NEW.entry_type = 'opening'
    AND NEW.id = OLD.id
    AND NEW.tenant_id = OLD.tenant_id
    AND NEW.cash_delta = OLD.cash_delta
    AND NEW.bank_delta = OLD.bank_delta
    AND NEW.reason = OLD.reason
    AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
    AND NEW.created_at = OLD.created_at
    AND NEW.idempotency_key = OLD.idempotency_key
    AND current_setting('app.finance_opening_repoint', true) = 'on'
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'finance_fund_entries_append_only'
    USING ERRCODE = '55000';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.repoint_finance_fund_opening(
  p_effective_at timestamp with time zone,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_now timestamptz := statement_timestamp();
  v_reason text := btrim(p_reason);
  v_opening public.finance_fund_entries%ROWTYPE;
  v_previous_effective_at timestamptz;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = v_actor
        AND profile.tenant_id = v_tenant_id
        AND COALESCE(profile.is_active, true)
    )
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_effective_at IS NULL
    OR NOT isfinite(p_effective_at)
    OR p_effective_at > v_now
    OR v_reason IS NULL
    OR char_length(v_reason) NOT BETWEEN 5 AND 500
  THEN
    RAISE EXCEPTION 'finance_fund_opening_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_funds:' || v_tenant_id::text, 0)
  );

  SELECT *
  INTO v_opening
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.entry_type = 'opening';

  IF v_opening.id IS NULL THEN
    RAISE EXCEPTION 'finance_funds_not_initialized'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_opening.effective_at = p_effective_at THEN
    RETURN to_jsonb(v_opening);
  END IF;

  v_previous_effective_at := v_opening.effective_at;

  BEGIN
    PERFORM set_config('app.finance_opening_repoint', 'on', true);

    UPDATE public.finance_fund_entries entry
    SET effective_at = p_effective_at
    WHERE entry.id = v_opening.id
      AND entry.entry_type = 'opening'
    RETURNING * INTO v_opening;

    PERFORM set_config('app.finance_opening_repoint', '', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('app.finance_opening_repoint', '', true);
      RAISE;
  END;

  PERFORM public.log_audit(
    'finance_fund_opening_repointed',
    'finance_fund_entry',
    v_opening.id,
    jsonb_build_object(
      'effective_at', v_previous_effective_at
    ),
    jsonb_build_object(
      'effective_at', v_opening.effective_at,
      'reason', v_reason
    )
  );

  RETURN to_jsonb(v_opening);
END;
$fn$;

REVOKE ALL ON FUNCTION public.repoint_finance_fund_opening(
  timestamp with time zone,
  text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repoint_finance_fund_opening(
  timestamp with time zone,
  text
) TO authenticated;

COMMENT ON FUNCTION public.repoint_finance_fund_opening(timestamp with time zone, text) IS
  'Owner-only: backdate opening effective_at. Cash and bank opening amounts stay frozen.';

DROP FUNCTION IF EXISTS public.restore_mbbank_statement_gap(
  jsonb,
  numeric,
  text,
  uuid
);

CREATE FUNCTION public.restore_mbbank_statement_gap(
  p_rows jsonb,
  p_bank_opening_delta numeric,
  p_reason text,
  p_idempotency_key uuid,
  p_opening_effective_at timestamp with time zone DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_row jsonb;
  v_provider_transaction_id text;
  v_transfer_type text;
  v_amount numeric(15,2);
  v_occurred_at timestamptz;
  v_status text;
  v_processed_count integer := 0;
  v_inserted_count integer := 0;
  v_existing_count integer := 0;
  v_adjustment jsonb;
  v_repoint jsonb;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = v_actor
        AND profile.tenant_id = v_tenant_id
        AND COALESCE(profile.is_active, true)
    )
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL
    OR jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) = 0
    OR jsonb_array_length(p_rows) > 5000
    OR p_bank_opening_delta IS NULL
    OR abs(p_bank_opening_delta) > 100000000000
  THEN
    RAISE EXCEPTION 'invalid_bank_transaction_rows' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_provider_transaction_id := NULLIF(
      btrim(v_row->>'provider_transaction_id'),
      ''
    );
    v_transfer_type := lower(COALESCE(v_row->>'transfer_type', ''));

    BEGIN
      v_amount := (v_row->>'amount')::numeric;
      v_occurred_at := (v_row->>'occurred_at')::timestamptz;
    EXCEPTION
      WHEN invalid_text_representation
        OR datetime_field_overflow
        OR numeric_value_out_of_range
      THEN
        RAISE EXCEPTION 'invalid_bank_transaction_row'
          USING ERRCODE = '22023';
    END;

    IF v_provider_transaction_id IS NULL
      OR v_provider_transaction_id NOT LIKE 'mbbank:%'
      OR length(v_provider_transaction_id) > 128
      OR v_transfer_type NOT IN ('in', 'out')
      OR v_amount IS NULL
      OR v_amount <= 0
      OR v_occurred_at IS NULL
      OR NULLIF(btrim(v_row->>'reference_code'), '') IS NULL
    THEN
      RAISE EXCEPTION 'invalid_bank_transaction_row'
        USING ERRCODE = '22023';
    END IF;

    v_status := private.upsert_canonical_bank_transaction(
      v_tenant_id,
      v_provider_transaction_id,
      v_occurred_at,
      v_transfer_type,
      v_amount,
      NULL,
      NULLIF(btrim(v_row->>'account_number'), ''),
      NULLIF(btrim(v_row->>'code'), ''),
      NULLIF(btrim(v_row->>'content'), ''),
      NULLIF(btrim(v_row->>'reference_code'), ''),
      'mbbank_statement',
      NULL,
      COALESCE(v_row->'raw_payload', v_row)
    );

    IF v_status = 'inserted' THEN
      v_inserted_count := v_inserted_count + 1;
    ELSE
      v_existing_count := v_existing_count + 1;
    END IF;

    v_processed_count := v_processed_count + 1;
  END LOOP;

  IF p_opening_effective_at IS NOT NULL THEN
    v_repoint := public.repoint_finance_fund_opening(
      p_opening_effective_at,
      p_reason
    );
  END IF;

  IF p_bank_opening_delta <> 0 THEN
    v_adjustment := public.create_finance_fund_adjustment(
      0,
      p_bank_opening_delta,
      p_reason,
      p_idempotency_key
    );
  END IF;

  PERFORM public.log_audit(
    'bank_transactions.mbbank_restore',
    'bank_transaction_import',
    NULL,
    NULL,
    jsonb_build_object(
      'processed_count', v_processed_count,
      'inserted_count', v_inserted_count,
      'existing_count', v_existing_count,
      'bank_opening_delta', p_bank_opening_delta,
      'adjustment_id', v_adjustment->>'id',
      'opening_effective_at', v_repoint->>'effective_at'
    )
  );

  RETURN jsonb_build_object(
    'processed_count', v_processed_count,
    'inserted_count', v_inserted_count,
    'existing_count', v_existing_count,
    'bank_opening_delta', p_bank_opening_delta,
    'adjustment_id', v_adjustment->>'id',
    'opening_effective_at', v_repoint->>'effective_at'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.restore_mbbank_statement_gap(
  jsonb,
  numeric,
  text,
  uuid,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_mbbank_statement_gap(
  jsonb,
  numeric,
  text,
  uuid,
  timestamp with time zone
) TO authenticated;

COMMENT ON FUNCTION public.restore_mbbank_statement_gap(jsonb, numeric, text, uuid, timestamp with time zone) IS
  'Atomically upserts MB statement bank rows, optionally backdates opening effective_at, and posts a non-zero opening bank adjustment. Owner-only; idempotent by provider id and adjustment key.';
