CREATE TABLE public.bank_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_transaction_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  transfer_type text NOT NULL CHECK (transfer_type IN ('in', 'out')),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  balance_after numeric(15,2),
  account_number text,
  code text,
  content text,
  reference_code text,
  ingest_source text NOT NULL CHECK (
    ingest_source IN ('sepay_webhook', 'sepay_export')
  ),
  webhook_event_id bigint UNIQUE
    REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_tenant_provider_transaction_key
    UNIQUE (tenant_id, provider_transaction_id)
);

COMMENT ON TABLE public.bank_transactions IS
  'Canonical SePay bank ledger. Every trusted incoming and outgoing transfer changes the bank balance exactly once; reconciliation only classifies rows.';
COMMENT ON COLUMN public.bank_transactions.provider_transaction_id IS
  'Stable SePay transaction ID shared by webhook payloads and SePay exports.';
COMMENT ON COLUMN public.bank_transactions.ingest_source IS
  'Trusted ingestion path: signed SePay webhook or owner-imported SePay export.';

CREATE INDEX bank_transactions_tenant_occurred_at_idx
  ON public.bank_transactions (tenant_id, occurred_at DESC, id DESC);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_transactions_select_finance
  ON public.bank_transactions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

REVOKE ALL ON TABLE public.bank_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bank_transactions TO authenticated;
GRANT ALL ON TABLE public.bank_transactions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bank_transactions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION private.sepay_bank_occurred_at(
  p_payload jsonb,
  p_fallback timestamptz
) RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_payload->>'transactionDate', '')
      ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?$'
    THEN replace(p_payload->>'transactionDate', 'T', ' ')::timestamp
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ELSE p_fallback
  END;
$$;

REVOKE ALL ON FUNCTION private.sepay_bank_occurred_at(jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_sepay_bank_transaction_from_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_provider_transaction_id text;
  v_transfer_type text;
  v_amount numeric(15,2);
  v_occurred_at timestamptz;
  v_existing public.bank_transactions%ROWTYPE;
BEGIN
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

  SELECT transaction.*
  INTO v_existing
  FROM public.bank_transactions transaction
  WHERE transaction.tenant_id = NEW.tenant_id
    AND transaction.provider_transaction_id = v_provider_transaction_id
  FOR UPDATE;

  IF FOUND AND (
    v_existing.transfer_type <> v_transfer_type
    OR v_existing.amount <> v_amount
    OR date_trunc('second', v_existing.occurred_at)
      <> date_trunc('second', v_occurred_at)
  ) THEN
    RAISE EXCEPTION 'bank_transaction_conflict'
      USING ERRCODE = '23505';
  END IF;

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
  )
  ON CONFLICT (tenant_id, provider_transaction_id) DO UPDATE
  SET
    balance_after = COALESCE(
      EXCLUDED.balance_after,
      public.bank_transactions.balance_after
    ),
    account_number = COALESCE(
      EXCLUDED.account_number,
      public.bank_transactions.account_number
    ),
    code = COALESCE(EXCLUDED.code, public.bank_transactions.code),
    content = COALESCE(EXCLUDED.content, public.bank_transactions.content),
    reference_code = COALESCE(
      EXCLUDED.reference_code,
      public.bank_transactions.reference_code
    ),
    ingest_source = 'sepay_webhook',
    webhook_event_id = EXCLUDED.webhook_event_id,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_sepay_bank_transaction_from_webhook()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_sepay_bank_transaction_from_webhook
AFTER INSERT OR UPDATE OF
  tenant_id,
  provider,
  request_id,
  signature_valid,
  payload
ON public.webhook_events
FOR EACH ROW
EXECUTE FUNCTION private.sync_sepay_bank_transaction_from_webhook();

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
)
SELECT
  event.tenant_id,
  COALESCE(NULLIF(btrim(event.payload->>'id'), ''), event.request_id),
  private.sepay_bank_occurred_at(event.payload, event.created_at),
  lower(event.payload->>'transferType'),
  abs((event.payload->>'transferAmount')::numeric),
  CASE
    WHEN COALESCE(event.payload->>'accumulated', '')
      ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (event.payload->>'accumulated')::numeric
    ELSE NULL
  END,
  NULLIF(btrim(event.payload->>'accountNumber'), ''),
  NULLIF(btrim(event.payload->>'code'), ''),
  NULLIF(btrim(event.payload->>'content'), ''),
  NULLIF(btrim(event.payload->>'referenceCode'), ''),
  'sepay_webhook',
  event.id,
  event.payload
FROM public.webhook_events event
WHERE event.provider = 'sepay'
  AND event.signature_valid IS TRUE
  AND lower(COALESCE(event.payload->>'transferType', '')) IN ('in', 'out')
  AND COALESCE(event.payload->>'transferAmount', '')
    ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND abs((event.payload->>'transferAmount')::numeric) > 0
ON CONFLICT (tenant_id, provider_transaction_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.import_sepay_bank_transactions(
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_row jsonb;
  v_provider_transaction_id text;
  v_transfer_type text;
  v_amount numeric(15,2);
  v_balance_after numeric(15,2);
  v_occurred_at timestamptz;
  v_existing public.bank_transactions%ROWTYPE;
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

    SELECT transaction.*
    INTO v_existing
    FROM public.bank_transactions transaction
    WHERE transaction.tenant_id = v_tenant_id
      AND transaction.provider_transaction_id = v_provider_transaction_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing.transfer_type <> v_transfer_type
        OR v_existing.amount <> v_amount
        OR date_trunc('second', v_existing.occurred_at)
          <> date_trunc('second', v_occurred_at)
      THEN
        RAISE EXCEPTION 'bank_transaction_conflict'
          USING ERRCODE = '23505';
      END IF;

      UPDATE public.bank_transactions
      SET
        balance_after = COALESCE(v_balance_after, balance_after),
        account_number = COALESCE(
          NULLIF(btrim(v_row->>'account_number'), ''),
          account_number
        ),
        code = COALESCE(NULLIF(btrim(v_row->>'code'), ''), code),
        content = COALESCE(NULLIF(btrim(v_row->>'content'), ''), content),
        reference_code = COALESCE(
          NULLIF(btrim(v_row->>'reference_code'), ''),
          reference_code
        ),
        raw_payload = CASE
          WHEN ingest_source = 'sepay_webhook' THEN raw_payload
          ELSE COALESCE(v_row->'raw_payload', v_row)
        END,
        updated_at = now()
      WHERE id = v_existing.id;

      v_existing_count := v_existing_count + 1;
    ELSE
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
        raw_payload
      ) VALUES (
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
        'sepay_export',
        COALESCE(v_row->'raw_payload', v_row)
      );

      v_inserted_count := v_inserted_count + 1;
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
$$;

REVOKE ALL ON FUNCTION public.import_sepay_bank_transactions(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_sepay_bank_transactions(jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.import_sepay_bank_transactions(jsonb) IS
  'Atomically imports normalized SePay export rows. Re-imports are idempotent; conflicting facts for one SePay ID fail the whole import.';

CREATE OR REPLACE FUNCTION public.get_bank_ledger_movement_since(
  p_since timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_bank_in numeric;
  v_bank_out numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(sum(transaction.amount) FILTER (
      WHERE transaction.transfer_type = 'in'
    ), 0),
    COALESCE(sum(transaction.amount) FILTER (
      WHERE transaction.transfer_type = 'out'
    ), 0)
  INTO v_bank_in, v_bank_out
  FROM public.bank_transactions transaction
  WHERE transaction.tenant_id = v_tenant_id
    AND transaction.occurred_at >= p_since;

  RETURN jsonb_build_object(
    'bank_in', v_bank_in,
    'bank_out', v_bank_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_bank_ledger_movement_since(timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bank_ledger_movement_since(timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_ledger_movement_since(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.get_bank_ledger_movement_since(timestamptz) IS
  'Returns signed movement from canonical bank_transactions only. Matching state never changes bank balance.';
