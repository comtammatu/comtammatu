CREATE OR REPLACE FUNCTION public.self_order_payment_request_fingerprint(
  p_method text,
  p_invoice_payload jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'version', 'payment:v1',
          'method', p_method,
          'invoice', COALESCE(p_invoice_payload, '{}'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

ALTER TABLE public.self_order_payment_requests
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS request_fingerprint_version text,
  ADD COLUMN IF NOT EXISTS payment_code_snapshot text,
  ADD COLUMN IF NOT EXISTS qr_payload_snapshot text,
  ADD COLUMN IF NOT EXISTS vietqr_config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE OR REPLACE FUNCTION public.self_order_fill_payment_request_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.request_fingerprint IS NULL THEN
    NEW.request_fingerprint := public.self_order_payment_request_fingerprint(
      NEW.method,
      NEW.invoice_payload
    );
    NEW.request_fingerprint_version := 'legacy:v0';
  ELSIF NEW.request_fingerprint_version IS NULL THEN
    NEW.request_fingerprint_version := 'payment:v1';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_active_payment_lock(
  p_order_id bigint
)
RETURNS bigint
LANGUAGE sql
VOLATILE
SET search_path TO ''
AS $$
  SELECT candidate.lock_id
  FROM (
    SELECT COALESCE(pr.payment_id, pr.id) AS lock_id, pr.created_at
    FROM public.self_order_payment_requests pr
    WHERE pr.order_id = p_order_id
      AND pr.status IN ('cash_call', 'vietqr_pending')

    UNION ALL

    SELECT p.id AS lock_id, p.created_at
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.status = 'pending'
  ) candidate
  ORDER BY candidate.created_at DESC, candidate.lock_id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.self_order_payment_request_public_payload(
  p_request_id bigint
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path TO ''
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', pr.id,
    'clientOpId', pr.client_op_id,
    'status', pr.status,
    'method', pr.method,
    'amount', pr.amount_snapshot,
    'paymentId', pr.payment_id,
    'paymentCode', pr.payment_code_snapshot,
    'qrData', pr.qr_payload_snapshot,
    'bankCode', pr.vietqr_config_snapshot ->> 'bankCode',
    'accountNo', pr.vietqr_config_snapshot ->> 'accountNo',
    'accountName', pr.vietqr_config_snapshot ->> 'accountName',
    'createdAt', pr.created_at,
    'expiresAt', pr.expires_at
  ))
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public.self_order_create_payment_request(
  p_token text,
  p_client_op_id uuid,
  p_method text,
  p_invoice_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_session_ref public.self_order_sessions%ROWTYPE;
  v_session public.self_order_sessions%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_existing public.self_order_payment_requests%ROWTYPE;
  v_active public.self_order_payment_requests%ROWTYPE;
  v_pending_payment public.payments%ROWTYPE;
  v_invoice_payload jsonb;
  v_fingerprint text;
  v_payment_id bigint;
  v_bank_code text;
  v_account_no text;
  v_account_name text;
  v_payment_code text;
  v_qr_payload text;
  v_config_snapshot jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_operation_id' USING ERRCODE = '22023';
  END IF;

  IF p_method NOT IN ('cash_call', 'vietqr') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  v_invoice_payload := public.self_order_normalize_invoice_payload(
    COALESCE(p_invoice_payload, '{}'::jsonb)
  );
  v_fingerprint := public.self_order_payment_request_fingerprint(
    p_method,
    v_invoice_payload
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  SELECT pr.*
  INTO v_existing
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_table.tenant_id
    AND pr.table_id = v_table.id
    AND pr.client_op_id = p_client_op_id
  ORDER BY pr.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.request_fingerprint_version = 'payment:v1'
       AND v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;

    IF v_existing.status NOT IN ('cash_call', 'vietqr_pending') THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true)
        || COALESCE(
          public.self_order_payment_request_public_payload(v_existing.id),
          '{}'::jsonb
        );
    END IF;
  END IF;

  SELECT s.*
  INTO v_session_ref
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.status = 'active'
  ORDER BY s.id DESC
  LIMIT 1;

  IF NOT FOUND
     OR v_session_ref.order_id IS NULL
     OR v_session_ref.approved_by IS NULL THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_session_ref.order_id
    AND o.tenant_id = v_session_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_order_not_payable' USING ERRCODE = '22023';
  END IF;

  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_session_ref.id
    AND s.tenant_id = v_session_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.status <> 'active'
     OR v_session.order_id IS DISTINCT FROM v_order.id
     OR v_session.approved_by IS NULL THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_session.token_snapshot IS DISTINCT FROM v_table.self_order_token
     OR v_session.token_rotated_at_snapshot IS DISTINCT FROM v_table.self_order_token_rotated_at THEN
    RAISE EXCEPTION 'self_order_token_rotated' USING ERRCODE = '55P03';
  END IF;

  IF v_order.branch_id <> v_session.branch_id
     OR v_order.table_id IS DISTINCT FROM v_session.table_id
     OR v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_order_not_payable' USING ERRCODE = '22023';
  END IF;

  IF p_method = 'vietqr' AND v_order.status NOT IN ('ready', 'served') THEN
    RAISE EXCEPTION 'self_order_payment_not_ready' USING ERRCODE = '22023';
  END IF;

  SELECT pr.*
  INTO v_existing
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_session.tenant_id
    AND pr.session_id = v_session.id
    AND pr.client_op_id = p_client_op_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.request_fingerprint_version = 'payment:v1'
       AND v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;

    IF v_existing.status IN ('cash_call', 'vietqr_pending')
       AND v_existing.expires_at <= now() THEN
      PERFORM public.self_order_expire_payment_request(v_existing.id);
      SELECT pr.*
      INTO v_existing
      FROM public.self_order_payment_requests pr
      WHERE pr.id = v_existing.id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'idempotent', true)
      || COALESCE(
        public.self_order_payment_request_public_payload(v_existing.id),
        '{}'::jsonb
      );
  END IF;

  SELECT pr.*
  INTO v_active
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_session.tenant_id
    AND pr.session_id = v_session.id
    AND pr.status IN ('cash_call', 'vietqr_pending')
  ORDER BY pr.id DESC
  LIMIT 1;

  IF FOUND AND v_active.expires_at <= now() THEN
    PERFORM public.self_order_expire_payment_request(v_active.id);
    SELECT pr.*
    INTO v_active
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_session.tenant_id
      AND pr.session_id = v_session.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
    ORDER BY pr.id DESC
    LIMIT 1;
  END IF;

  IF FOUND THEN
    IF v_active.request_fingerprint_version = 'payment:v1'
       AND v_active.request_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('ok', true, 'recovered', true)
        || COALESCE(
          public.self_order_payment_request_public_payload(v_active.id),
          '{}'::jsonb
        );
    END IF;

    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  BEGIN
    SELECT p.*
    INTO v_pending_payment
    FROM public.payments p
    WHERE p.tenant_id = v_session.tenant_id
      AND p.order_id = v_order.id
      AND p.status = 'pending'
    ORDER BY p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  IF FOUND THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.tenant_id = v_session.tenant_id
      AND p.order_id = v_order.id
      AND p.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'self_order_payment_completed' USING ERRCODE = '22023';
  END IF;

  IF p_method = 'cash_call' THEN
    INSERT INTO public.self_order_payment_requests (
      tenant_id,
      branch_id,
      table_id,
      session_id,
      order_id,
      client_op_id,
      method,
      status,
      amount_snapshot,
      invoice_payload,
      request_fingerprint,
      request_fingerprint_version,
      expires_at
    )
    VALUES (
      v_session.tenant_id,
      v_session.branch_id,
      v_session.table_id,
      v_session.id,
      v_order.id,
      p_client_op_id,
      'cash_call',
      'cash_call',
      v_order.total_amount,
      v_invoice_payload,
      v_fingerprint,
      'payment:v1',
      now() + interval '15 minutes'
    )
    RETURNING * INTO v_existing;

    RETURN jsonb_build_object('ok', true)
      || public.self_order_payment_request_public_payload(v_existing.id);
  END IF;

  IF v_order.total_amount <= 0 THEN
    RAISE EXCEPTION 'self_order_vietqr_requires_positive_amount' USING ERRCODE = '22023';
  END IF;

  v_payment_code := NULLIF(btrim(COALESCE(v_order.payment_code, '')), '');
  IF v_payment_code IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT
    max(NULLIF(btrim(ss.value), '')) FILTER (
      WHERE ss.key = 'payment_vietqr_bank_code'
    ),
    max(NULLIF(btrim(ss.value), '')) FILTER (
      WHERE ss.key = 'payment_vietqr_account_no'
    ),
    max(NULLIF(btrim(ss.value), '')) FILTER (
      WHERE ss.key = 'payment_vietqr_account_name'
    )
  INTO v_bank_code, v_account_no, v_account_name
  FROM public.system_settings ss
  WHERE ss.tenant_id = v_order.tenant_id
    AND ss.key IN (
      'payment_vietqr_bank_code',
      'payment_vietqr_account_no',
      'payment_vietqr_account_name'
    );

  v_bank_code := upper(v_bank_code);
  IF v_bank_code IS NULL OR v_account_no IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_missing' USING ERRCODE = '22023';
  END IF;

  IF public.print_vietqr_bank_bin(v_bank_code) !~ '^[0-9]{6}$'
     OR char_length(v_account_no) > 50 THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_qr_payload := public.print_vietqr_emvco(
      v_bank_code,
      v_account_no,
      v_account_name,
      v_order.total_amount,
      v_payment_code
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END;

  IF v_qr_payload IS NULL THEN
    RAISE EXCEPTION 'self_order_vietqr_config_invalid' USING ERRCODE = '22023';
  END IF;

  v_config_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'bankCode', v_bank_code,
    'accountNo', v_account_no,
    'accountName', COALESCE(v_account_name, '')
  ));

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    provider_ref,
    provider_data,
    created_by
  )
  VALUES (
    v_session.tenant_id,
    v_session.branch_id,
    v_order.id,
    'vietqr',
    v_order.total_amount,
    'pending',
    v_payment_code,
    jsonb_build_object(
      'source', 'qr_self_order',
      'description', v_payment_code,
      'invoicePayload', v_invoice_payload
    ),
    v_session.approved_by
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.orders
  SET payment_status = 'pending',
      payment_method = 'vietqr',
      updated_at = now()
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id;

  INSERT INTO public.self_order_payment_requests (
    tenant_id,
    branch_id,
    table_id,
    session_id,
    order_id,
    payment_id,
    client_op_id,
    method,
    status,
    amount_snapshot,
    invoice_payload,
    request_fingerprint,
    request_fingerprint_version,
    payment_code_snapshot,
    qr_payload_snapshot,
    vietqr_config_snapshot,
    expires_at
  )
  VALUES (
    v_session.tenant_id,
    v_session.branch_id,
    v_session.table_id,
    v_session.id,
    v_order.id,
    v_payment_id,
    p_client_op_id,
    'vietqr',
    'vietqr_pending',
    v_order.total_amount,
    v_invoice_payload,
    v_fingerprint,
    'payment:v1',
    v_payment_code,
    v_qr_payload,
    v_config_snapshot,
    now() + interval '30 minutes'
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object('ok', true)
    || public.self_order_payment_request_public_payload(v_existing.id);
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_fill_payment_request_fingerprint
  ON public.self_order_payment_requests;
CREATE TRIGGER trg_self_order_fill_payment_request_fingerprint
  BEFORE INSERT ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_fill_payment_request_fingerprint();

UPDATE public.self_order_payment_requests pr
SET request_fingerprint = COALESCE(
      pr.request_fingerprint,
      public.self_order_payment_request_fingerprint(pr.method, pr.invoice_payload)
    ),
    request_fingerprint_version = COALESCE(
      pr.request_fingerprint_version,
      'legacy:v0'
    ),
    payment_code_snapshot = CASE
      WHEN pr.method = 'vietqr'
        THEN COALESCE(pr.payment_code_snapshot, o.payment_code)
      ELSE pr.payment_code_snapshot
    END,
    qr_payload_snapshot = CASE
      WHEN pr.method = 'vietqr' THEN COALESCE(
        pr.qr_payload_snapshot,
        public.print_vietqr_emvco(
          (
            SELECT ss.value
            FROM public.system_settings ss
            WHERE ss.tenant_id = pr.tenant_id
              AND ss.key = 'payment_vietqr_bank_code'
            LIMIT 1
          ),
          (
            SELECT ss.value
            FROM public.system_settings ss
            WHERE ss.tenant_id = pr.tenant_id
              AND ss.key = 'payment_vietqr_account_no'
            LIMIT 1
          ),
          (
            SELECT ss.value
            FROM public.system_settings ss
            WHERE ss.tenant_id = pr.tenant_id
              AND ss.key = 'payment_vietqr_account_name'
            LIMIT 1
          ),
          pr.amount_snapshot,
          COALESCE(pr.payment_code_snapshot, o.payment_code)
        )
      )
      ELSE pr.qr_payload_snapshot
    END,
    vietqr_config_snapshot = CASE
      WHEN pr.method = 'vietqr'
           AND COALESCE(pr.vietqr_config_snapshot, '{}'::jsonb) = '{}'::jsonb
        THEN jsonb_strip_nulls(jsonb_build_object(
          'bankCode', (
            SELECT upper(btrim(ss.value))
            FROM public.system_settings ss
            WHERE ss.tenant_id = pr.tenant_id
              AND ss.key = 'payment_vietqr_bank_code'
            LIMIT 1
          ),
          'accountNo', (
            SELECT btrim(ss.value)
            FROM public.system_settings ss
            WHERE ss.tenant_id = pr.tenant_id
              AND ss.key = 'payment_vietqr_account_no'
            LIMIT 1
          ),
          'accountName', (
            SELECT btrim(ss.value)
            FROM public.system_settings ss
            WHERE ss.tenant_id = pr.tenant_id
              AND ss.key = 'payment_vietqr_account_name'
            LIMIT 1
          )
        ))
      ELSE COALESCE(pr.vietqr_config_snapshot, '{}'::jsonb)
    END,
    expires_at = CASE
      WHEN pr.method = 'cash_call' AND pr.expires_at IS NULL
        THEN pr.created_at + interval '15 minutes'
      ELSE pr.expires_at
    END,
    completed_at = CASE
      WHEN pr.status = 'completed'
        THEN COALESCE(pr.completed_at, pr.updated_at, pr.created_at)
      ELSE pr.completed_at
    END,
    cancelled_at = CASE
      WHEN pr.status = 'cancelled'
        THEN COALESCE(pr.cancelled_at, pr.updated_at, pr.created_at)
      ELSE pr.cancelled_at
    END,
    expired_at = CASE
      WHEN pr.status = 'expired'
        THEN COALESCE(pr.expired_at, pr.updated_at, pr.created_at)
      ELSE pr.expired_at
    END
FROM public.orders o
WHERE o.id = pr.order_id
  AND o.tenant_id = pr.tenant_id;

ALTER TABLE public.self_order_payment_requests
  ALTER COLUMN request_fingerprint SET NOT NULL,
  ALTER COLUMN request_fingerprint_version SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests
    WHERE status IN ('cash_call', 'vietqr_pending')
    GROUP BY tenant_id, session_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'self_order_active_payment_request_duplicate';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests
    WHERE status IN ('cash_call', 'vietqr_pending')
      AND expires_at IS NULL
  ) THEN
    RAISE EXCEPTION 'self_order_active_payment_request_missing_expiry';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests
    WHERE status = 'vietqr_pending'
      AND (
        payment_code_snapshot IS NULL
        OR qr_payload_snapshot IS NULL
        OR COALESCE(vietqr_config_snapshot ->> 'bankCode', '') = ''
        OR COALESCE(vietqr_config_snapshot ->> 'accountNo', '') = ''
      )
  ) THEN
    RAISE EXCEPTION 'self_order_active_vietqr_request_incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_payment_requests_fingerprint_format'
      AND conrelid = 'public.self_order_payment_requests'::regclass
  ) THEN
    ALTER TABLE public.self_order_payment_requests
      ADD CONSTRAINT self_order_payment_requests_fingerprint_format
      CHECK (request_fingerprint ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_payment_requests_fingerprint_version_check'
      AND conrelid = 'public.self_order_payment_requests'::regclass
  ) THEN
    ALTER TABLE public.self_order_payment_requests
      ADD CONSTRAINT self_order_payment_requests_fingerprint_version_check
      CHECK (request_fingerprint_version IN ('legacy:v0', 'payment:v1'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_payment_requests_active_expiry_required'
      AND conrelid = 'public.self_order_payment_requests'::regclass
  ) THEN
    ALTER TABLE public.self_order_payment_requests
      ADD CONSTRAINT self_order_payment_requests_active_expiry_required
      CHECK (status NOT IN ('cash_call', 'vietqr_pending') OR expires_at IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_payment_requests_terminal_timestamp_check'
      AND conrelid = 'public.self_order_payment_requests'::regclass
  ) THEN
    ALTER TABLE public.self_order_payment_requests
      ADD CONSTRAINT self_order_payment_requests_terminal_timestamp_check
      CHECK (
        (status <> 'completed' OR completed_at IS NOT NULL)
        AND (status <> 'cancelled' OR cancelled_at IS NOT NULL)
        AND (status <> 'expired' OR expired_at IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_payment_requests_vietqr_code_check'
      AND conrelid = 'public.self_order_payment_requests'::regclass
  ) THEN
    ALTER TABLE public.self_order_payment_requests
      ADD CONSTRAINT self_order_payment_requests_vietqr_code_check
      CHECK (method <> 'vietqr' OR payment_code_snapshot IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_payment_requests_active_vietqr_snapshot_check'
      AND conrelid = 'public.self_order_payment_requests'::regclass
  ) THEN
    ALTER TABLE public.self_order_payment_requests
      ADD CONSTRAINT self_order_payment_requests_active_vietqr_snapshot_check
      CHECK (
        status <> 'vietqr_pending'
        OR (
          qr_payload_snapshot IS NOT NULL
          AND COALESCE(vietqr_config_snapshot ->> 'bankCode', '') <> ''
          AND COALESCE(vietqr_config_snapshot ->> 'accountNo', '') <> ''
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_payment_requests_cancel_reason_length'
      AND conrelid = 'public.self_order_payment_requests'::regclass
  ) THEN
    ALTER TABLE public.self_order_payment_requests
      ADD CONSTRAINT self_order_payment_requests_cancel_reason_length
      CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_one_active_per_session
  ON public.self_order_payment_requests (tenant_id, session_id)
  WHERE status IN ('cash_call', 'vietqr_pending');

CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_payment_id_key
  ON public.self_order_payment_requests (tenant_id, payment_id)
  WHERE payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.self_order_enforce_payment_request_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.table_id IS DISTINCT FROM NEW.table_id
     OR OLD.session_id IS DISTINCT FROM NEW.session_id
     OR OLD.order_id IS DISTINCT FROM NEW.order_id
     OR OLD.client_op_id IS DISTINCT FROM NEW.client_op_id
     OR OLD.method IS DISTINCT FROM NEW.method
     OR OLD.amount_snapshot IS DISTINCT FROM NEW.amount_snapshot
     OR OLD.invoice_payload IS DISTINCT FROM NEW.invoice_payload
     OR OLD.request_fingerprint IS DISTINCT FROM NEW.request_fingerprint
     OR OLD.request_fingerprint_version IS DISTINCT FROM NEW.request_fingerprint_version
     OR OLD.payment_code_snapshot IS DISTINCT FROM NEW.payment_code_snapshot
     OR OLD.qr_payload_snapshot IS DISTINCT FROM NEW.qr_payload_snapshot
     OR OLD.vietqr_config_snapshot IS DISTINCT FROM NEW.vietqr_config_snapshot
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'self_order_payment_request_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.payment_id IS DISTINCT FROM NEW.payment_id
     AND NOT (
       OLD.payment_id IS NULL
       AND NEW.payment_id IS NOT NULL
       AND OLD.status IN ('cash_call', 'vietqr_pending')
       AND NEW.status = 'completed'
     ) THEN
    RAISE EXCEPTION 'self_order_payment_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.cancel_reason IS DISTINCT FROM NEW.cancel_reason
     AND NOT (
       OLD.cancel_reason IS NULL
       AND NEW.cancel_reason IS NOT NULL
       AND OLD.status IN ('cash_call', 'vietqr_pending')
       AND NEW.status = 'cancelled'
     ) THEN
    RAISE EXCEPTION 'self_order_payment_cancel_reason_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       OLD.status IN ('cash_call', 'vietqr_pending')
       AND NEW.status IN ('completed', 'cancelled', 'expired')
     ) THEN
    RAISE EXCEPTION 'self_order_invalid_payment_request_transition' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'self_order_completed_request_missing_timestamp' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'self_order_cancelled_request_missing_timestamp' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'expired' AND NEW.expired_at IS NULL THEN
    RAISE EXCEPTION 'self_order_expired_request_missing_timestamp' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_request_invariants
  ON public.self_order_payment_requests;
CREATE TRIGGER trg_self_order_enforce_payment_request_invariants
  BEFORE UPDATE OF
    tenant_id,
    branch_id,
    table_id,
    session_id,
    order_id,
    payment_id,
    client_op_id,
    method,
    status,
    amount_snapshot,
    invoice_payload,
    request_fingerprint,
    request_fingerprint_version,
    payment_code_snapshot,
    qr_payload_snapshot,
    vietqr_config_snapshot,
    expires_at,
    completed_at,
    cancelled_at,
    expired_at,
    cancel_reason
  ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_payment_request_invariants();

CREATE OR REPLACE FUNCTION public.self_order_expire_payment_request(
  p_request_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request_ref record;
  v_request record;
  v_order record;
  v_session record;
  v_payment public.payments%ROWTYPE;
  v_payment_found boolean := false;
BEGIN
  SELECT pr.*
  INTO v_request_ref
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id;

  IF NOT FOUND
     OR v_request_ref.status NOT IN ('cash_call', 'vietqr_pending')
     OR v_request_ref.expires_at > now() THEN
    RETURN false;
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_request_ref.order_id
    AND o.tenant_id = v_request_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_order_missing' USING ERRCODE = '23503';
  END IF;

  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_request_ref.session_id
    AND s.tenant_id = v_request_ref.tenant_id
    AND s.order_id = v_request_ref.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_session_missing' USING ERRCODE = '23503';
  END IF;

  BEGIN
    SELECT p.*
    INTO v_payment
    FROM public.payments p
    WHERE p.tenant_id = v_request_ref.tenant_id
      AND p.order_id = v_request_ref.order_id
      AND (
        p.id = v_request_ref.payment_id
        OR (
          v_request_ref.payment_id IS NULL
          AND v_request_ref.method = 'cash_call'
          AND p.method = 'cash'
          AND p.status = 'completed'
        )
      )
    ORDER BY
      CASE WHEN p.id = v_request_ref.payment_id THEN 0 ELSE 1 END,
      p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
    v_payment_found := FOUND;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id
    AND pr.tenant_id = v_request_ref.tenant_id
    AND pr.session_id = v_request_ref.session_id
    AND pr.order_id = v_request_ref.order_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.status NOT IN ('cash_call', 'vietqr_pending')
     OR v_request.expires_at > now() THEN
    RETURN false;
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR (v_payment_found AND v_payment.status = 'completed') THEN
    UPDATE public.self_order_payment_requests
    SET status = 'completed',
        payment_id = COALESCE(
          v_request.payment_id,
          CASE WHEN v_payment_found THEN v_payment.id ELSE NULL END
        ),
        completed_at = COALESCE(
          CASE WHEN v_payment_found THEN v_payment.paid_at ELSE NULL END,
          now()
        )
    WHERE id = v_request.id
      AND status IN ('cash_call', 'vietqr_pending');
    RETURN false;
  END IF;

  UPDATE public.self_order_payment_requests
  SET status = 'expired',
      expired_at = now()
  WHERE id = v_request.id
    AND status IN ('cash_call', 'vietqr_pending');

  IF v_payment_found AND v_payment.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'failed',
        updated_at = now()
    WHERE id = v_payment.id
      AND status = 'pending';
  END IF;

  IF v_request.method = 'vietqr' THEN
    UPDATE public.orders o
    SET payment_status = 'unpaid',
        payment_method = NULL,
        updated_at = now()
    WHERE o.id = v_request.order_id
      AND o.tenant_id = v_request.tenant_id
      AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.tenant_id = v_request.tenant_id
          AND p.order_id = v_request.order_id
          AND p.status IN ('pending', 'completed')
      );
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_reconcile_expired_payment_requests(
  p_tenant_id bigint,
  p_branch_id bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_candidate record;
  v_count integer := 0;
BEGIN
  FOR v_candidate IN
    SELECT pr.id, pr.order_id, pr.session_id
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = p_tenant_id
      AND pr.branch_id = p_branch_id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at <= now()
    ORDER BY pr.order_id, pr.id
  LOOP
    BEGIN
      PERFORM 1
      FROM public.orders o
      WHERE o.id = v_candidate.order_id
        AND o.tenant_id = p_tenant_id
      FOR UPDATE SKIP LOCKED;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      IF NOT pg_try_advisory_xact_lock(v_candidate.order_id) THEN
        RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
      END IF;

      IF public.self_order_expire_payment_request(v_candidate.id) THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN serialization_failure THEN
      RAISE NOTICE 'Skipped busy self-order payment request %', v_candidate.id;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_append_active_batch(
  p_session_id bigint,
  p_batch_id bigint,
  p_client_op_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_session_ref record;
  v_session record;
  v_order record;
  v_request record;
  v_request_found boolean := false;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT s.*
  INTO v_session_ref
  FROM public.self_order_sessions s
  WHERE s.id = p_session_id;

  IF NOT FOUND
     OR v_session_ref.status <> 'active'
     OR v_session_ref.order_id IS NULL THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_session_ref.order_id
    AND o.tenant_id = v_session_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_order_not_appendable' USING ERRCODE = '22023';
  END IF;

  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_session_ref.id
    AND s.tenant_id = v_session_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.status <> 'active'
     OR v_session.order_id IS DISTINCT FROM v_order.id THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_session.approved_by IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_actor' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.tables t
  WHERE t.id = v_session.table_id
    AND t.tenant_id = v_session.tenant_id
    AND t.branch_id = v_session.branch_id
    AND t.self_order_enabled = true
    AND t.self_order_token = v_session.token_snapshot
    AND t.self_order_token_rotated_at IS NOT DISTINCT FROM v_session.token_rotated_at_snapshot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_token_disabled' USING ERRCODE = '42501';
  END IF;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_session.tenant_id
    AND pr.session_id = v_session.id
    AND pr.status IN ('cash_call', 'vietqr_pending')
  ORDER BY pr.id DESC
  LIMIT 1;
  v_request_found := FOUND;

  IF v_request_found AND v_request.expires_at <= now() THEN
    PERFORM public.self_order_expire_payment_request(v_request.id);
    SELECT pr.*
    INTO v_request
    FROM public.self_order_payment_requests pr
    WHERE pr.id = v_request.id;
    v_request_found := FOUND;
  END IF;

  IF v_request_found AND v_request.status IN ('cash_call', 'vietqr_pending') THEN
    RAISE EXCEPTION 'self_order_active_payment_intent' USING ERRCODE = '55P03';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.tenant_id = v_session.tenant_id
      AND p.order_id = v_order.id
      AND p.status IN ('pending', 'completed')
  ) THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  IF v_order.branch_id <> v_session.branch_id
     OR v_order.table_id IS DISTINCT FROM v_session.table_id
     OR v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_order_not_appendable' USING ERRCODE = '22023';
  END IF;

  PERFORM public.self_order_set_actor_claims(
    v_session.approved_by,
    v_session.tenant_id
  );
  v_result := public.append_order_items(
    v_session.order_id,
    p_items,
    p_client_op_id
  );

  UPDATE public.self_order_batches
  SET status = 'auto_accepted',
      order_id = v_session.order_id,
      accepted_by = v_session.approved_by,
      accepted_at = now(),
      failure_reason = NULL
  WHERE id = p_batch_id
    AND tenant_id = v_session.tenant_id
    AND session_id = v_session.id
    AND status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_pending' USING ERRCODE = '40001';
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'session_status', 'active',
    'batch_id', p_batch_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_cancel_pending_payment_and_add(
  p_token text,
  p_client_op_id uuid,
  p_items jsonb,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION 'self_order_payment_cancel_staff_required'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_cancel_payment_request(
  p_request_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request_ref public.self_order_payment_requests%ROWTYPE;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_session public.self_order_sessions%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_payment_found boolean := false;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.*
  INTO v_request_ref
  FROM public.self_order_payment_requests pr
  WHERE pr.id = p_request_id
    AND pr.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_request_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_request_ref.order_id
    AND o.tenant_id = v_request_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_order_missing' USING ERRCODE = '23503';
  END IF;

  IF NOT pg_try_advisory_xact_lock(v_order.id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_request_ref.session_id
    AND s.tenant_id = v_request_ref.tenant_id
    AND s.order_id = v_request_ref.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_session_missing' USING ERRCODE = '23503';
  END IF;

  BEGIN
    SELECT p.*
    INTO v_payment
    FROM public.payments p
    WHERE p.tenant_id = v_request_ref.tenant_id
      AND p.order_id = v_request_ref.order_id
      AND (
        p.id = v_request_ref.payment_id
        OR (
          p.status = 'completed'
          AND (
            (v_request_ref.method = 'cash_call' AND p.method = 'cash')
            OR (v_request_ref.method = 'vietqr' AND p.method = 'vietqr')
          )
        )
      )
    ORDER BY
      CASE WHEN p.status = 'completed' THEN 0 ELSE 1 END,
      CASE WHEN p.id = v_request_ref.payment_id THEN 0 ELSE 1 END,
      p.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
    v_payment_found := FOUND;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  SELECT pr.*
  INTO v_request
  FROM public.self_order_payment_requests pr
  WHERE pr.id = v_request_ref.id
    AND pr.tenant_id = v_request_ref.tenant_id
    AND pr.session_id = v_request_ref.session_id
    AND pr.order_id = v_request_ref.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status NOT IN ('cash_call', 'vietqr_pending') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'paymentCompleted', (
        v_request.status = 'completed'
        OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
        OR (v_payment_found AND v_payment.status = 'completed')
      )
    )
      || COALESCE(
        public.self_order_payment_request_public_payload(v_request.id),
        '{}'::jsonb
      );
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR (v_payment_found AND v_payment.status = 'completed') THEN
    UPDATE public.self_order_payment_requests
    SET status = 'completed',
        payment_id = COALESCE(
          v_request.payment_id,
          CASE WHEN v_payment_found THEN v_payment.id ELSE NULL END
        ),
        completed_at = COALESCE(
          CASE WHEN v_payment_found THEN v_payment.paid_at ELSE NULL END,
          now()
        )
    WHERE id = v_request.id;

    RETURN jsonb_build_object('ok', true, 'paymentCompleted', true)
      || public.self_order_payment_request_public_payload(v_request.id);
  END IF;

  UPDATE public.self_order_payment_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = v_reason
  WHERE id = v_request.id
    AND status IN ('cash_call', 'vietqr_pending');

  IF v_payment_found AND v_payment.status = 'pending' THEN
    UPDATE public.payments
    SET status = 'failed',
        updated_at = now()
    WHERE id = v_payment.id
      AND tenant_id = v_request.tenant_id
      AND status = 'pending';
  END IF;

  IF v_request.method = 'vietqr' THEN
    UPDATE public.orders o
    SET payment_status = 'unpaid',
        payment_method = NULL,
        updated_at = now()
    WHERE o.id = v_request.order_id
      AND o.tenant_id = v_request.tenant_id
      AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.tenant_id = v_request.tenant_id
          AND p.order_id = v_request.order_id
          AND p.status IN ('pending', 'completed')
      );
  END IF;

  RETURN jsonb_build_object('ok', true)
    || public.self_order_payment_request_public_payload(v_request.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_sync_payment_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_status_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_status_changed := true;
  ELSIF TG_OP = 'UPDATE' THEN
    v_status_changed := OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF NEW.status = 'completed' AND v_status_changed THEN
    UPDATE public.self_order_payment_requests pr
    SET status = 'completed',
        payment_id = COALESCE(pr.payment_id, NEW.id),
        completed_at = COALESCE(NEW.paid_at, now())
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.order_id = NEW.order_id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND (
        pr.payment_id = NEW.id
        OR (
          pr.payment_id IS NULL
          AND pr.method = 'cash_call'
          AND NEW.method = 'cash'
        )
        OR (
          pr.method = 'vietqr'
          AND NEW.method = 'vietqr'
        )
      );
  ELSIF NEW.status = 'failed' AND v_status_changed THEN
    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, 'payment_failed')
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.payment_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending');

    IF FOUND THEN
      UPDATE public.orders o
      SET payment_status = 'unpaid',
          payment_method = NULL,
          updated_at = now()
      WHERE o.id = NEW.order_id
        AND o.tenant_id = NEW.tenant_id
        AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
        AND NOT EXISTS (
          SELECT 1
          FROM public.payments p
          WHERE p.tenant_id = NEW.tenant_id
            AND p.order_id = NEW.order_id
            AND p.status IN ('pending', 'completed')
        );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_sync_payment_request
  ON public.payments;
DROP TRIGGER IF EXISTS trg_self_order_sync_payment_request_insert
  ON public.payments;
DROP TRIGGER IF EXISTS trg_self_order_sync_payment_request_update
  ON public.payments;

CREATE TRIGGER trg_self_order_sync_payment_request_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.self_order_sync_payment_request();

CREATE TRIGGER trg_self_order_sync_payment_request_update
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.self_order_sync_payment_request();

CREATE OR REPLACE FUNCTION public.self_order_close_session_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_reason text;
  v_payment_id bigint;
  v_paid_at timestamptz;
BEGIN
  IF NEW.payment_status = 'paid' THEN
    v_reason := 'payment_completed';

    SELECT p.id, p.paid_at
    INTO v_payment_id, v_paid_at
    FROM public.payments p
    WHERE p.tenant_id = NEW.tenant_id
      AND p.order_id = NEW.id
      AND p.status = 'completed'
    ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
    LIMIT 1;

    UPDATE public.self_order_payment_requests pr
    SET status = 'completed',
        payment_id = COALESCE(pr.payment_id, v_payment_id),
        completed_at = COALESCE(v_paid_at, now())
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending');
  ELSIF NEW.status IN ('completed', 'cancelled') THEN
    v_reason := 'order_' || NEW.status;

    UPDATE public.self_order_payment_requests pr
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(pr.cancel_reason, v_reason)
    WHERE pr.tenant_id = NEW.tenant_id
      AND pr.order_id = NEW.id
      AND pr.status IN ('cash_call', 'vietqr_pending');
  ELSE
    RETURN NULL;
  END IF;

  UPDATE public.self_order_sessions
  SET status = 'closed',
      closed_at = COALESCE(closed_at, now()),
      close_reason = COALESCE(close_reason, v_reason)
  WHERE tenant_id = NEW.tenant_id
    AND order_id = NEW.id
    AND status = 'active';

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.self_order_get_snapshot(text) SET SCHEMA private;
ALTER FUNCTION private.self_order_get_snapshot(text)
  RENAME TO self_order_get_snapshot_base;

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session record;
  v_request record;
  v_payload jsonb;
  v_payment_payload jsonb := 'null'::jsonb;
  v_session_found boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT t.id AS table_id, t.tenant_id
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF FOUND THEN
    SELECT s.id, s.order_id
    INTO v_session
    FROM public.self_order_sessions s
    WHERE s.tenant_id = v_table.tenant_id
      AND s.table_id = v_table.table_id
      AND s.status = 'active'
      AND s.order_id IS NOT NULL
    ORDER BY s.id DESC
    LIMIT 1;
    v_session_found := FOUND;

    IF v_session_found THEN
      SELECT pr.id, pr.expires_at
      INTO v_request
      FROM public.self_order_payment_requests pr
      WHERE pr.tenant_id = v_table.tenant_id
        AND pr.session_id = v_session.id
        AND pr.status IN ('cash_call', 'vietqr_pending')
      ORDER BY pr.id DESC
      LIMIT 1;

      IF FOUND AND v_request.expires_at <= now() THEN
        PERFORM public.self_order_expire_payment_request(v_request.id);
      END IF;
    END IF;
  END IF;

  v_payload := private.self_order_get_snapshot_base(p_token);

  IF v_session_found THEN
    SELECT public.self_order_payment_request_public_payload(pr.id)
    INTO v_payment_payload
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_table.tenant_id
      AND pr.session_id = v_session.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at > now()
    ORDER BY pr.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      v_payment_payload := 'null'::jsonb;
    END IF;
  END IF;

  RETURN jsonb_set(
    v_payload,
    ARRAY['paymentRequest'],
    COALESCE(v_payment_payload, 'null'::jsonb),
    true
  );
END;
$$;

ALTER FUNCTION public.self_order_list_staff_queue(bigint) SET SCHEMA private;
ALTER FUNCTION private.self_order_list_staff_queue(bigint)
  RENAME TO self_order_list_staff_queue_base;

CREATE OR REPLACE FUNCTION public.self_order_list_staff_queue(p_branch_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_payload jsonb;
  v_pending_batches jsonb;
  v_payment_requests jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL OR NOT public.has_permission(p_branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  PERFORM public.self_order_reconcile_expired_payment_requests(
    v_tenant,
    p_branch_id
  );

  v_payload := private.self_order_list_staff_queue_base(p_branch_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', b.id,
      'sessionId', b.session_id,
      'tableId', b.table_id,
      'tableNumber', t.number,
      'status', b.status,
      'items', b.cart_payload,
      'customerNote', b.customer_note,
      'createdAt', b.created_at,
      'canonicalOrderId', s.order_id,
      'canonicalOrderNumber', o.order_number,
      'approvalMode', CASE WHEN s.order_id IS NULL THEN 'create' ELSE 'append' END
    ))
    ORDER BY b.created_at
  ), '[]'::jsonb)
  INTO v_pending_batches
  FROM public.self_order_batches b
  JOIN public.tables t
    ON t.id = b.table_id
   AND t.tenant_id = b.tenant_id
  JOIN public.self_order_sessions s
    ON s.id = b.session_id
   AND s.tenant_id = b.tenant_id
  LEFT JOIN public.orders o
    ON o.id = s.order_id
   AND o.tenant_id = s.tenant_id
  WHERE b.tenant_id = v_tenant
    AND b.branch_id = p_branch_id
    AND b.status = 'pending_approval';

  SELECT COALESCE(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', pr.id,
      'clientOpId', pr.client_op_id,
      'tableId', pr.table_id,
      'tableNumber', t.number,
      'orderId', pr.order_id,
      'orderNumber', o.order_number,
      'method', pr.method,
      'status', pr.status,
      'amount', pr.amount_snapshot,
      'paymentCode', pr.payment_code_snapshot,
      'createdAt', pr.created_at,
      'expiresAt', pr.expires_at
    ))
    ORDER BY pr.created_at
  ), '[]'::jsonb)
  INTO v_payment_requests
  FROM public.self_order_payment_requests pr
  JOIN public.tables t
    ON t.id = pr.table_id
   AND t.tenant_id = pr.tenant_id
  JOIN public.orders o
    ON o.id = pr.order_id
   AND o.tenant_id = pr.tenant_id
  WHERE pr.tenant_id = v_tenant
    AND pr.branch_id = p_branch_id
    AND pr.status IN ('cash_call', 'vietqr_pending')
    AND pr.expires_at > now();

  v_payload := jsonb_set(
    v_payload,
    ARRAY['pendingBatches'],
    v_pending_batches,
    true
  );

  RETURN jsonb_set(
    v_payload,
    ARRAY['paymentRequests'],
    v_payment_requests,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_payment_request_fingerprint(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_fill_payment_request_fingerprint()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_enforce_payment_request_invariants()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_active_payment_lock(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_payment_request_public_payload(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_expire_payment_request(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_reconcile_expired_payment_requests(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_sync_payment_request()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_close_session_from_order()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.self_order_get_snapshot_base(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.self_order_list_staff_queue_base(bigint)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_cancel_pending_payment_and_add(text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_cancel_pending_payment_and_add(text, uuid, jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_get_snapshot(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.self_order_cancel_payment_request(bigint, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_order_list_staff_queue(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_order_cancel_payment_request(bigint, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_list_staff_queue(bigint)
  TO authenticated, service_role;
