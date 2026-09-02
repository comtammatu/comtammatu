-- Owner MB statement backfill when SePay has no history. Later SePay
-- webhook/export attaches by matching bank reference + amount + type.

ALTER TABLE public.bank_transactions
  DROP CONSTRAINT bank_transactions_ingest_source_check;

ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_ingest_source_check
  CHECK (
    ingest_source = ANY (
      ARRAY['sepay_webhook', 'sepay_export', 'mbbank_statement']::text[]
    )
  );

COMMENT ON COLUMN public.bank_transactions.ingest_source IS
  'Trusted ingestion path: signed SePay webhook, owner-imported SePay export, or owner MB statement backfill.';

COMMENT ON COLUMN public.bank_transactions.provider_transaction_id IS
  'Stable SePay transaction ID, or mbbank:{bank_reference} until a SePay id attaches.';

CREATE UNIQUE INDEX bank_transactions_tenant_reference_fact_uidx
  ON public.bank_transactions (
    tenant_id,
    reference_code,
    transfer_type,
    amount
  )
  WHERE reference_code IS NOT NULL;

CREATE OR REPLACE FUNCTION private.upsert_canonical_bank_transaction(
  p_tenant_id bigint,
  p_provider_transaction_id text,
  p_occurred_at timestamptz,
  p_transfer_type text,
  p_amount numeric,
  p_balance_after numeric,
  p_account_number text,
  p_code text,
  p_content text,
  p_reference_code text,
  p_ingest_source text,
  p_webhook_event_id bigint,
  p_raw_payload jsonb
) RETURNS text
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  v_existing public.bank_transactions%ROWTYPE;
  v_compare_minute boolean;
  v_time_match boolean;
  v_attach_sepay boolean;
BEGIN
  IF p_tenant_id IS NULL
    OR p_provider_transaction_id IS NULL
    OR length(p_provider_transaction_id) > 128
    OR p_occurred_at IS NULL
    OR p_transfer_type NOT IN ('in', 'out')
    OR p_amount IS NULL
    OR p_amount <= 0
    OR p_ingest_source NOT IN (
      'sepay_webhook',
      'sepay_export',
      'mbbank_statement'
    )
    OR p_raw_payload IS NULL
  THEN
    RAISE EXCEPTION 'invalid_bank_transaction_row'
      USING ERRCODE = '22023';
  END IF;

  SELECT transaction.*
  INTO v_existing
  FROM public.bank_transactions transaction
  WHERE transaction.tenant_id = p_tenant_id
    AND transaction.provider_transaction_id = p_provider_transaction_id
  FOR UPDATE;

  IF NOT FOUND AND p_reference_code IS NOT NULL THEN
    SELECT transaction.*
    INTO v_existing
    FROM public.bank_transactions transaction
    WHERE transaction.tenant_id = p_tenant_id
      AND transaction.reference_code = p_reference_code
      AND transaction.transfer_type = p_transfer_type
      AND transaction.amount = p_amount
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.bank_transactions (
        tenant_id,
        provider_transaction_id,
        occurred_at,
        transfer_type,
        amount,
        balance_after,
        account_number,
        code,
        content,
        reference_code,
        ingest_source,
        webhook_event_id,
        raw_payload
      ) VALUES (
        p_tenant_id,
        p_provider_transaction_id,
        p_occurred_at,
        p_transfer_type,
        p_amount,
        p_balance_after,
        p_account_number,
        p_code,
        p_content,
        p_reference_code,
        p_ingest_source,
        p_webhook_event_id,
        p_raw_payload
      );
      RETURN 'inserted';
    EXCEPTION
      WHEN unique_violation THEN
        SELECT transaction.*
        INTO v_existing
        FROM public.bank_transactions transaction
        WHERE transaction.tenant_id = p_tenant_id
          AND transaction.provider_transaction_id = p_provider_transaction_id
        FOR UPDATE;

        IF NOT FOUND AND p_reference_code IS NOT NULL THEN
          SELECT transaction.*
          INTO v_existing
          FROM public.bank_transactions transaction
          WHERE transaction.tenant_id = p_tenant_id
            AND transaction.reference_code = p_reference_code
            AND transaction.transfer_type = p_transfer_type
            AND transaction.amount = p_amount
          FOR UPDATE;
        END IF;

        IF NOT FOUND THEN
          RAISE;
        END IF;
    END;
  END IF;

  IF v_existing.transfer_type <> p_transfer_type
    OR v_existing.amount <> p_amount
  THEN
    RAISE EXCEPTION 'bank_transaction_conflict'
      USING ERRCODE = '23505';
  END IF;

  v_compare_minute :=
    v_existing.ingest_source = 'mbbank_statement'
    OR p_ingest_source = 'mbbank_statement';
  v_time_match := CASE
    WHEN v_compare_minute THEN
      date_trunc('minute', v_existing.occurred_at)
        = date_trunc('minute', p_occurred_at)
    ELSE
      date_trunc('second', v_existing.occurred_at)
        = date_trunc('second', p_occurred_at)
  END;

  IF NOT v_time_match THEN
    RAISE EXCEPTION 'bank_transaction_conflict'
      USING ERRCODE = '23505';
  END IF;

  v_attach_sepay :=
    v_existing.ingest_source = 'mbbank_statement'
    AND p_ingest_source IN ('sepay_webhook', 'sepay_export')
    AND v_existing.provider_transaction_id <> p_provider_transaction_id;

  IF v_existing.provider_transaction_id <> p_provider_transaction_id
    AND NOT v_attach_sepay
    AND p_ingest_source <> 'mbbank_statement'
  THEN
    RAISE EXCEPTION 'bank_transaction_conflict'
      USING ERRCODE = '23505';
  END IF;

  IF p_ingest_source = 'mbbank_statement' THEN
    UPDATE public.bank_transactions
    SET
      account_number = COALESCE(account_number, p_account_number),
      code = COALESCE(code, p_code),
      content = COALESCE(content, p_content),
      reference_code = COALESCE(reference_code, p_reference_code),
      raw_payload = CASE
        WHEN ingest_source IN ('sepay_webhook', 'sepay_export')
          THEN raw_payload
        ELSE COALESCE(p_raw_payload, raw_payload)
      END,
      updated_at = now()
    WHERE id = v_existing.id;
    RETURN 'existing';
  END IF;

  UPDATE public.bank_transactions
  SET
    provider_transaction_id = CASE
      WHEN v_attach_sepay THEN p_provider_transaction_id
      ELSE provider_transaction_id
    END,
    ingest_source = CASE
      WHEN p_ingest_source = 'sepay_webhook' THEN 'sepay_webhook'
      WHEN v_attach_sepay THEN p_ingest_source
      ELSE ingest_source
    END,
    webhook_event_id = CASE
      WHEN p_ingest_source = 'sepay_webhook' THEN p_webhook_event_id
      ELSE webhook_event_id
    END,
    balance_after = COALESCE(p_balance_after, balance_after),
    account_number = COALESCE(p_account_number, account_number),
    code = COALESCE(p_code, code),
    content = COALESCE(p_content, content),
    reference_code = COALESCE(p_reference_code, reference_code),
    raw_payload = CASE
      WHEN p_ingest_source = 'sepay_webhook' THEN p_raw_payload
      WHEN ingest_source = 'sepay_webhook' THEN raw_payload
      ELSE COALESCE(p_raw_payload, raw_payload)
    END,
    updated_at = now()
  WHERE id = v_existing.id;

  RETURN 'existing';
END;
$fn$;

REVOKE ALL ON FUNCTION private.upsert_canonical_bank_transaction(
  bigint,
  text,
  timestamptz,
  text,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  text,
  bigint,
  jsonb
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_sepay_bank_transaction_from_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_provider_transaction_id text;
  v_transfer_type text;
  v_amount numeric(15,2);
  v_occurred_at timestamptz;
BEGIN
  PERFORM auth.uid();

  IF NEW.provider <> 'sepay' OR NEW.signature_valid IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_provider_transaction_id := COALESCE(
    NULLIF(btrim(NEW.payload->>'id'), ''),
    NULLIF(btrim(NEW.request_id), '')
  );
  v_transfer_type := lower(COALESCE(NEW.payload->>'transferType', ''));

  IF v_provider_transaction_id IS NULL
     OR v_transfer_type NOT IN ('in', 'out')
     OR COALESCE(NEW.payload->>'transferAmount', '')
       !~ '^-?[0-9]+(\.[0-9]+)?$'
  THEN
    RETURN NEW;
  END IF;

  v_amount := abs((NEW.payload->>'transferAmount')::numeric);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_occurred_at := private.sepay_bank_occurred_at(
    NEW.payload,
    NEW.created_at
  );

  PERFORM private.upsert_canonical_bank_transaction(
    NEW.tenant_id,
    v_provider_transaction_id,
    v_occurred_at,
    v_transfer_type,
    v_amount,
    CASE
      WHEN COALESCE(NEW.payload->>'accumulated', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (NEW.payload->>'accumulated')::numeric
      ELSE NULL
    END,
    NULLIF(btrim(NEW.payload->>'accountNumber'), ''),
    NULLIF(btrim(NEW.payload->>'code'), ''),
    NULLIF(btrim(NEW.payload->>'content'), ''),
    NULLIF(btrim(NEW.payload->>'referenceCode'), ''),
    'sepay_webhook',
    NEW.id,
    NEW.payload
  );

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.sync_sepay_bank_transaction_from_webhook()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_sepay_bank_transactions(
  p_rows jsonb
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
  v_balance_after numeric(15,2);
  v_occurred_at timestamptz;
  v_status text;
  v_processed_count integer := 0;
  v_inserted_count integer := 0;
  v_existing_count integer := 0;
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
      v_balance_after := CASE
        WHEN NULLIF(btrim(v_row->>'balance_after'), '') IS NULL THEN NULL
        ELSE (v_row->>'balance_after')::numeric
      END;
    EXCEPTION
      WHEN invalid_text_representation
        OR datetime_field_overflow
        OR numeric_value_out_of_range
      THEN
        RAISE EXCEPTION 'invalid_bank_transaction_row'
          USING ERRCODE = '22023';
    END;

    IF v_provider_transaction_id IS NULL
      OR length(v_provider_transaction_id) > 128
      OR v_transfer_type NOT IN ('in', 'out')
      OR v_amount IS NULL
      OR v_amount <= 0
      OR v_occurred_at IS NULL
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
      v_balance_after,
      NULLIF(btrim(v_row->>'account_number'), ''),
      NULLIF(btrim(v_row->>'code'), ''),
      NULLIF(btrim(v_row->>'content'), ''),
      NULLIF(btrim(v_row->>'reference_code'), ''),
      CASE
        WHEN v_provider_transaction_id LIKE 'mbbank:%' THEN 'mbbank_statement'
        ELSE 'sepay_export'
      END,
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

  PERFORM public.log_audit(
    'bank_transactions.sepay_import',
    'bank_transaction_import',
    NULL,
    NULL,
    jsonb_build_object(
      'processed_count', v_processed_count,
      'inserted_count', v_inserted_count,
      'existing_count', v_existing_count
    )
  );

  RETURN jsonb_build_object(
    'processed_count', v_processed_count,
    'inserted_count', v_inserted_count,
    'existing_count', v_existing_count
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.restore_mbbank_statement_gap(
  p_rows jsonb,
  p_bank_opening_delta numeric,
  p_reason text,
  p_idempotency_key uuid
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

  v_adjustment := public.create_finance_fund_adjustment(
    0,
    p_bank_opening_delta,
    p_reason,
    p_idempotency_key
  );

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
      'adjustment_id', v_adjustment->>'id'
    )
  );

  RETURN jsonb_build_object(
    'processed_count', v_processed_count,
    'inserted_count', v_inserted_count,
    'existing_count', v_existing_count,
    'bank_opening_delta', p_bank_opening_delta,
    'adjustment_id', v_adjustment->>'id'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.restore_mbbank_statement_gap(
  jsonb,
  numeric,
  text,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_mbbank_statement_gap(
  jsonb,
  numeric,
  text,
  uuid
) TO authenticated;

COMMENT ON FUNCTION public.restore_mbbank_statement_gap(jsonb, numeric, text, uuid) IS
  'Atomically upserts MB statement bank rows and posts the opening bank adjustment. Owner-only; idempotent by provider id and adjustment key.';
