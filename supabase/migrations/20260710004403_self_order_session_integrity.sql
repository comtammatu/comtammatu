CREATE OR REPLACE FUNCTION public.self_order_batch_request_fingerprint(
  p_items jsonb,
  p_customer_note text
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
          'version', 'batch:v1',
          'items', p_items,
          'customerNote', NULLIF(btrim(COALESCE(p_customer_note, '')), '')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

ALTER TABLE public.self_order_batches
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS request_fingerprint_version text;

CREATE OR REPLACE FUNCTION public.self_order_fill_batch_request_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.request_fingerprint IS NULL THEN
    NEW.request_fingerprint := public.self_order_batch_request_fingerprint(
      NEW.cart_payload,
      NEW.customer_note
    );
    NEW.request_fingerprint_version := 'legacy:v0';
  ELSIF NEW.request_fingerprint_version IS NULL THEN
    NEW.request_fingerprint_version := 'batch:v1';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_fill_batch_request_fingerprint
  ON public.self_order_batches;
CREATE TRIGGER trg_self_order_fill_batch_request_fingerprint
  BEFORE INSERT ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.self_order_fill_batch_request_fingerprint();

UPDATE public.self_order_batches
SET request_fingerprint = COALESCE(
      request_fingerprint,
      public.self_order_batch_request_fingerprint(cart_payload, customer_note)
    ),
    request_fingerprint_version = COALESCE(
      request_fingerprint_version,
      'legacy:v0'
    )
WHERE request_fingerprint IS NULL
   OR request_fingerprint_version IS NULL;

ALTER TABLE public.self_order_batches
  ALTER COLUMN request_fingerprint SET NOT NULL,
  ALTER COLUMN request_fingerprint_version SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_batches_request_fingerprint_format'
      AND conrelid = 'public.self_order_batches'::regclass
  ) THEN
    ALTER TABLE public.self_order_batches
      ADD CONSTRAINT self_order_batches_request_fingerprint_format
      CHECK (request_fingerprint ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_batches_request_fingerprint_version_check'
      AND conrelid = 'public.self_order_batches'::regclass
  ) THEN
    ALTER TABLE public.self_order_batches
      ADD CONSTRAINT self_order_batches_request_fingerprint_version_check
      CHECK (request_fingerprint_version IN ('legacy:v0', 'batch:v1'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_sessions
    WHERE status IN ('closed', 'revoked')
      AND closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'self_order_terminal_session_missing_closed_at';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_sessions
    WHERE status = 'active'
      AND (order_id IS NULL OR approved_by IS NULL OR approved_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'self_order_active_session_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_sessions
    WHERE status = 'pending_approval'
      AND (order_id IS NOT NULL OR approved_by IS NOT NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'self_order_pending_session_prebound';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_batches
    WHERE status IN ('accepted', 'auto_accepted')
      AND (order_id IS NULL OR accepted_by IS NULL OR accepted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'self_order_accepted_batch_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_batches
    WHERE status = 'rejected'
      AND (rejected_by IS NULL OR rejected_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'self_order_rejected_batch_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_sessions
    WHERE order_id IS NOT NULL
    GROUP BY tenant_id, order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'self_order_session_order_duplicate';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_sessions_terminal_closed_at_check'
      AND conrelid = 'public.self_order_sessions'::regclass
  ) THEN
    ALTER TABLE public.self_order_sessions
      ADD CONSTRAINT self_order_sessions_terminal_closed_at_check
      CHECK (status NOT IN ('closed', 'revoked') OR closed_at IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_sessions_active_approval_check'
      AND conrelid = 'public.self_order_sessions'::regclass
  ) THEN
    ALTER TABLE public.self_order_sessions
      ADD CONSTRAINT self_order_sessions_active_approval_check
      CHECK (
        status <> 'active'
        OR (order_id IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_sessions_pending_unbound_check'
      AND conrelid = 'public.self_order_sessions'::regclass
  ) THEN
    ALTER TABLE public.self_order_sessions
      ADD CONSTRAINT self_order_sessions_pending_unbound_check
      CHECK (
        status <> 'pending_approval'
        OR (order_id IS NULL AND approved_by IS NULL AND approved_at IS NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_batches_acceptance_check'
      AND conrelid = 'public.self_order_batches'::regclass
  ) THEN
    ALTER TABLE public.self_order_batches
      ADD CONSTRAINT self_order_batches_acceptance_check
      CHECK (
        status NOT IN ('accepted', 'auto_accepted')
        OR (order_id IS NOT NULL AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'self_order_batches_rejection_check'
      AND conrelid = 'public.self_order_batches'::regclass
  ) THEN
    ALTER TABLE public.self_order_batches
      ADD CONSTRAINT self_order_batches_rejection_check
      CHECK (
        status <> 'rejected'
        OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS self_order_sessions_tenant_order_key
  ON public.self_order_sessions (tenant_id, order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.self_order_sessions
  DROP CONSTRAINT IF EXISTS self_order_sessions_order_id_fkey;
ALTER TABLE public.self_order_sessions
  ADD CONSTRAINT self_order_sessions_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.self_order_batches
  DROP CONSTRAINT IF EXISTS self_order_batches_order_id_fkey;
ALTER TABLE public.self_order_batches
  ADD CONSTRAINT self_order_batches_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.self_order_enforce_session_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.table_id IS DISTINCT FROM NEW.table_id THEN
    RAISE EXCEPTION 'self_order_session_identity_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.token_snapshot IS DISTINCT FROM NEW.token_snapshot
     OR OLD.token_rotated_at_snapshot IS DISTINCT FROM NEW.token_rotated_at_snapshot THEN
    RAISE EXCEPTION 'self_order_token_snapshot_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.order_id IS DISTINCT FROM NEW.order_id
     AND NOT (
       OLD.order_id IS NULL
       AND NEW.order_id IS NOT NULL
       AND OLD.status = 'pending_approval'
       AND NEW.status = 'active'
     ) THEN
    RAISE EXCEPTION 'self_order_order_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF (
    OLD.approved_by IS DISTINCT FROM NEW.approved_by
    OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
  ) AND NOT (
    OLD.approved_by IS NULL
    AND OLD.approved_at IS NULL
    AND NEW.approved_by IS NOT NULL
    AND NEW.approved_at IS NOT NULL
    AND OLD.status = 'pending_approval'
    AND NEW.status = 'active'
  ) THEN
    RAISE EXCEPTION 'self_order_approval_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (OLD.status = 'pending_approval' AND NEW.status IN ('active', 'revoked'))
       OR (OLD.status = 'active' AND NEW.status = 'closed')
     ) THEN
    RAISE EXCEPTION 'self_order_invalid_session_transition' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'active'
     AND (NEW.order_id IS NULL OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'self_order_active_session_incomplete' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('closed', 'revoked') AND NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'self_order_terminal_session_missing_closed_at' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_enforce_session_invariants
  ON public.self_order_sessions;
CREATE TRIGGER trg_self_order_enforce_session_invariants
  BEFORE UPDATE OF
    tenant_id,
    branch_id,
    table_id,
    status,
    order_id,
    token_snapshot,
    token_rotated_at_snapshot,
    approved_by,
    approved_at
  ON public.self_order_sessions
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_session_invariants();

CREATE OR REPLACE FUNCTION public.self_order_enforce_batch_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.table_id IS DISTINCT FROM NEW.table_id
     OR OLD.session_id IS DISTINCT FROM NEW.session_id
     OR OLD.client_op_id IS DISTINCT FROM NEW.client_op_id
     OR OLD.cart_payload IS DISTINCT FROM NEW.cart_payload
     OR OLD.customer_note IS DISTINCT FROM NEW.customer_note
     OR OLD.request_fingerprint IS DISTINCT FROM NEW.request_fingerprint
     OR OLD.request_fingerprint_version IS DISTINCT FROM NEW.request_fingerprint_version THEN
    RAISE EXCEPTION 'self_order_batch_request_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.order_id IS DISTINCT FROM NEW.order_id
     AND NOT (
       OLD.order_id IS NULL
       AND NEW.order_id IS NOT NULL
       AND OLD.status = 'pending_approval'
       AND NEW.status IN ('accepted', 'auto_accepted')
     ) THEN
    RAISE EXCEPTION 'self_order_batch_order_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF (
    OLD.accepted_by IS DISTINCT FROM NEW.accepted_by
    OR OLD.accepted_at IS DISTINCT FROM NEW.accepted_at
  ) AND NOT (
    OLD.accepted_by IS NULL
    AND OLD.accepted_at IS NULL
    AND NEW.accepted_by IS NOT NULL
    AND NEW.accepted_at IS NOT NULL
    AND OLD.status = 'pending_approval'
    AND NEW.status IN ('accepted', 'auto_accepted')
  ) THEN
    RAISE EXCEPTION 'self_order_batch_acceptance_immutable' USING ERRCODE = '22023';
  END IF;

  IF (
    OLD.rejected_by IS DISTINCT FROM NEW.rejected_by
    OR OLD.rejected_at IS DISTINCT FROM NEW.rejected_at
  ) AND NOT (
    OLD.rejected_by IS NULL
    AND OLD.rejected_at IS NULL
    AND NEW.rejected_by IS NOT NULL
    AND NEW.rejected_at IS NOT NULL
    AND OLD.status = 'pending_approval'
    AND NEW.status = 'rejected'
  ) THEN
    RAISE EXCEPTION 'self_order_batch_rejection_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       OLD.status = 'pending_approval'
       AND NEW.status IN ('accepted', 'auto_accepted', 'rejected', 'failed')
     ) THEN
    RAISE EXCEPTION 'self_order_invalid_batch_transition' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_enforce_batch_transition
  ON public.self_order_batches;
CREATE TRIGGER trg_self_order_enforce_batch_transition
  BEFORE UPDATE OF
    status,
    tenant_id,
    branch_id,
    table_id,
    session_id,
    client_op_id,
    cart_payload,
    customer_note,
    request_fingerprint,
    request_fingerprint_version,
    order_id,
    accepted_by,
    accepted_at,
    rejected_by,
    rejected_at
  ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_batch_transition();

CREATE OR REPLACE FUNCTION public.self_order_guard_table_token_rotation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(OLD.id::text)
  ) THEN
    RAISE EXCEPTION 'self_order_operation_in_progress' USING ERRCODE = '55P03';
  END IF;

  IF (
    OLD.self_order_token IS DISTINCT FROM NEW.self_order_token
    OR OLD.self_order_token_rotated_at IS DISTINCT FROM NEW.self_order_token_rotated_at
  ) AND EXISTS (
    SELECT 1
    FROM public.self_order_sessions s
    WHERE s.tenant_id = OLD.tenant_id
      AND s.table_id = OLD.id
      AND s.status IN ('pending_approval', 'active')
  ) THEN
    RAISE EXCEPTION 'self_order_open_session_exists' USING ERRCODE = '55P03';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_guard_table_token_rotation
  ON public.tables;
CREATE TRIGGER trg_self_order_guard_table_token_rotation
  BEFORE UPDATE OF self_order_token, self_order_token_rotated_at ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.self_order_guard_table_token_rotation();

CREATE OR REPLACE FUNCTION public.rotate_table_self_order_qr(p_table_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_table record;
  v_token text;
  v_rotated_at timestamptz := now();
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(p_table_id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  WHERE t.id = p_table_id
    AND t.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_table_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_table.branch_id, 'settings:branch') THEN
    RAISE EXCEPTION 'permission denied: settings:branch' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_sessions s
    WHERE s.tenant_id = v_table.tenant_id
      AND s.table_id = v_table.id
      AND s.status IN ('pending_approval', 'active')
  ) THEN
    RAISE EXCEPTION 'self_order_open_session_exists' USING ERRCODE = '55P03';
  END IF;

  v_token := translate(
    encode(extensions.gen_random_bytes(24), 'base64'),
    '+/=',
    '-_'
  );

  UPDATE public.tables
  SET self_order_token = v_token,
      self_order_enabled = true,
      self_order_token_rotated_at = v_rotated_at
  WHERE id = v_table.id
    AND tenant_id = v_table.tenant_id;

  RETURN jsonb_build_object(
    'token', v_token,
    'enabled', true,
    'rotatedAt', v_rotated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_submit_batch(
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
DECLARE
  v_table record;
  v_table_id bigint;
  v_session_ref record;
  v_session record;
  v_batch record;
  v_items jsonb;
  v_customer_note text := NULLIF(btrim(COALESCE(p_customer_note, '')), '');
  v_fingerprint text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_cart_payload' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := public.self_order_batch_request_fingerprint(
    p_items,
    v_customer_note
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

  v_table_id := v_table.id;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table_id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.id = v_table_id
    AND t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  SELECT b.*
  INTO v_batch
  FROM public.self_order_batches b
  JOIN public.self_order_sessions s
    ON s.id = b.session_id
   AND s.tenant_id = b.tenant_id
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.token_snapshot = v_table.self_order_token
    AND s.token_rotated_at_snapshot IS NOT DISTINCT FROM v_table.self_order_token_rotated_at
    AND b.client_op_id = p_client_op_id
  ORDER BY s.id DESC
  LIMIT 1
  FOR UPDATE OF b;

  IF FOUND THEN
    IF v_batch.request_fingerprint_version = 'batch:v1'
       AND v_batch.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
      'ok', true,
      'status', v_batch.status,
      'batchId', v_batch.id,
      'orderId', v_batch.order_id,
      'idempotent', true
    ));
  END IF;

  PERFORM 1
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.status = 'revoked'
    AND s.token_snapshot = v_table.self_order_token
    AND s.token_rotated_at_snapshot IS NOT DISTINCT FROM v_table.self_order_token_rotated_at
  ORDER BY s.id DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'self_order_session_revoked' USING ERRCODE = '22023';
  END IF;

  LOOP
    SELECT *
    INTO v_session_ref
    FROM public.self_order_sessions s
    WHERE s.tenant_id = v_table.tenant_id
      AND s.table_id = v_table.id
      AND s.status IN ('pending_approval', 'active')
    ORDER BY s.id DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_session_ref.status = 'active' THEN
        IF v_session_ref.order_id IS NULL THEN
          RAISE EXCEPTION 'self_order_active_session_incomplete' USING ERRCODE = '23514';
        END IF;
        PERFORM 1
        FROM public.orders o
        WHERE o.id = v_session_ref.order_id
          AND o.tenant_id = v_session_ref.tenant_id
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'self_order_order_not_appendable' USING ERRCODE = '22023';
        END IF;
        IF NOT pg_try_advisory_xact_lock(v_session_ref.order_id) THEN
          RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
        END IF;
      END IF;

      SELECT *
      INTO v_session
      FROM public.self_order_sessions s
      WHERE s.id = v_session_ref.id
        AND s.tenant_id = v_session_ref.tenant_id
      FOR UPDATE;

      IF NOT FOUND
         OR v_session.status IS DISTINCT FROM v_session_ref.status
         OR v_session.order_id IS DISTINCT FROM v_session_ref.order_id THEN
        RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
      END IF;

      IF v_session.token_snapshot IS DISTINCT FROM v_table.self_order_token
         OR v_session.token_rotated_at_snapshot IS DISTINCT FROM v_table.self_order_token_rotated_at THEN
        RAISE EXCEPTION 'self_order_token_rotated' USING ERRCODE = '55P03';
      END IF;

      IF v_session.status = 'pending_approval'
         AND NOT EXISTS (
           SELECT 1
           FROM public.self_order_batches b
           WHERE b.tenant_id = v_session.tenant_id
             AND b.session_id = v_session.id
             AND b.status = 'pending_approval'
         ) THEN
        UPDATE public.self_order_sessions
        SET status = 'revoked',
            closed_at = COALESCE(closed_at, now()),
            close_reason = COALESCE(close_reason, 'orphan_pending_no_batch')
        WHERE id = v_session.id
          AND tenant_id = v_session.tenant_id
          AND status = 'pending_approval';
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'session_revoked'
        );
      END IF;
      EXIT;
    END IF;

    BEGIN
      INSERT INTO public.self_order_sessions (
        tenant_id,
        branch_id,
        table_id,
        status,
        token_snapshot,
        token_rotated_at_snapshot
      )
      VALUES (
        v_table.tenant_id,
        v_table.branch_id,
        v_table.id,
        'pending_approval',
        v_table.self_order_token,
        v_table.self_order_token_rotated_at
      )
      RETURNING * INTO v_session;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  SELECT *
  INTO v_batch
  FROM public.self_order_batches b
  WHERE b.tenant_id = v_session.tenant_id
    AND b.session_id = v_session.id
    AND b.client_op_id = p_client_op_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_batch.request_fingerprint_version = 'batch:v1'
       AND v_batch.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
      'ok', true,
      'status', v_batch.status,
      'batchId', v_batch.id,
      'orderId', v_batch.order_id,
      'idempotent', true
    ));
  END IF;

  v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);

  INSERT INTO public.self_order_batches (
    tenant_id,
    branch_id,
    table_id,
    session_id,
    client_op_id,
    status,
    cart_payload,
    customer_note,
    request_fingerprint,
    request_fingerprint_version
  )
  VALUES (
    v_table.tenant_id,
    v_table.branch_id,
    v_table.id,
    v_session.id,
    p_client_op_id,
    'pending_approval',
    v_items,
    v_customer_note,
    v_fingerprint,
    'batch:v1'
  )
  RETURNING * INTO v_batch;

  IF v_session.status = 'active' THEN
    RETURN public.self_order_append_active_batch(
      v_session.id,
      v_batch.id,
      p_client_op_id,
      v_items
    ) || jsonb_build_object('ok', true, 'status', 'auto_accepted');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'pending_approval',
    'batchId', v_batch.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_approve_batch(
  p_batch_id bigint,
  p_target_order_id bigint DEFAULT NULL,
  p_pos_session_id bigint DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_batch_ref record;
  v_batch record;
  v_session_ref record;
  v_session record;
  v_order record;
  v_result jsonb;
  v_order_id bigint;
  v_lock_order_id bigint;
  v_pos_session_id bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT b.id, b.session_id, b.tenant_id, b.branch_id
  INTO v_batch_ref
  FROM public.self_order_batches b
  WHERE b.id = p_batch_id
    AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_batch_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT ps.id
  INTO v_pos_session_id
  FROM public.pos_sessions ps
  WHERE ps.tenant_id = v_batch_ref.tenant_id
    AND ps.branch_id = v_batch_ref.branch_id
    AND ps.status = 'open'
    AND (p_pos_session_id IS NULL OR ps.id = p_pos_session_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_pos_session_closed' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.*
  INTO v_session_ref
  FROM public.self_order_sessions s
  WHERE s.id = v_batch_ref.session_id
    AND s.tenant_id = v_batch_ref.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_lock_order_id := COALESCE(v_session_ref.order_id, p_target_order_id);
  IF v_lock_order_id IS NOT NULL THEN
    PERFORM 1
    FROM public.orders o
    WHERE o.id = v_lock_order_id
      AND o.tenant_id = v_batch_ref.tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
    END IF;
    IF NOT pg_try_advisory_xact_lock(v_lock_order_id) THEN
      RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
    END IF;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_session_ref.id
    AND s.tenant_id = v_session_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_batch
  FROM public.self_order_batches b
  WHERE b.id = v_batch_ref.id
    AND b.tenant_id = v_batch_ref.tenant_id
    AND b.session_id = v_session.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status IN ('accepted', 'auto_accepted') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_batch.status,
      'orderId', v_batch.order_id,
      'idempotent', true
    );
  END IF;

  IF v_session.status IS DISTINCT FROM v_session_ref.status
     OR v_session.order_id IS DISTINCT FROM v_session_ref.order_id THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'self_order_batch_not_pending' USING ERRCODE = '22023';
  END IF;

  IF v_session.status IN ('closed', 'revoked') THEN
    RAISE EXCEPTION 'self_order_session_terminal' USING ERRCODE = '22023';
  END IF;

  IF v_session.order_id IS NOT NULL THEN
    IF v_session.status <> 'active' THEN
      RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
    END IF;
    IF p_target_order_id IS NOT NULL AND p_target_order_id <> v_session.order_id THEN
      RAISE EXCEPTION 'self_order_order_conflict' USING ERRCODE = '22023';
    END IF;
    v_order_id := v_session.order_id;
  ELSE
    v_order_id := p_target_order_id;
  END IF;

  IF v_order_id IS NULL THEN
    v_result := public.create_order(
      v_batch.tenant_id,
      v_batch.branch_id,
      v_uid,
      v_batch.cart_payload,
      'dine_in',
      v_batch.table_id,
      v_pos_session_id,
      v_batch.customer_note,
      v_batch.client_op_id
    );
    v_order_id := NULLIF(v_result ->> 'order_id', '')::bigint;
  ELSE
    SELECT *
    INTO v_order
    FROM public.orders o
    WHERE o.id = v_order_id
      AND o.tenant_id = v_batch.tenant_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_order.branch_id <> v_batch.branch_id
       OR v_order.table_id IS DISTINCT FROM v_batch.table_id
       OR v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
       OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
       OR v_order.merged_into_order_id IS NOT NULL
       OR (v_order.pos_session_id IS NOT NULL AND v_order.pos_session_id <> v_pos_session_id) THEN
      RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
    END IF;

    IF public.self_order_active_payment_lock(v_order.id) IS NOT NULL THEN
      RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
    END IF;

    v_result := public.append_order_items(
      v_order_id,
      v_batch.cart_payload,
      v_batch.client_op_id
    );
  END IF;

  IF v_session.order_id IS NULL THEN
    BEGIN
      UPDATE public.self_order_sessions
      SET status = 'active',
          order_id = v_order_id,
          approved_by = v_uid,
          approved_at = COALESCE(approved_at, now()),
          close_reason = NULL,
          closed_at = NULL
      WHERE id = v_session.id
        AND tenant_id = v_session.tenant_id
        AND status = 'pending_approval';
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'self_order_order_conflict' USING ERRCODE = '22023';
    END;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'self_order_session_not_pending' USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.self_order_batches
  SET status = 'accepted',
      order_id = v_order_id,
      accepted_by = v_uid,
      accepted_at = now(),
      failure_reason = NULL
  WHERE id = v_batch.id
    AND tenant_id = v_batch.tenant_id
    AND status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_pending' USING ERRCODE = '40001';
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'orderId', v_order_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_reject_batch(
  p_batch_id bigint,
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
  v_batch_ref record;
  v_batch record;
  v_session record;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT b.id, b.session_id, b.tenant_id, b.branch_id
  INTO v_batch_ref
  FROM public.self_order_batches b
  WHERE b.id = p_batch_id
    AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_batch_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_batch_ref.session_id
    AND s.tenant_id = v_batch_ref.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_batch
  FROM public.self_order_batches b
  WHERE b.id = v_batch_ref.id
    AND b.tenant_id = v_batch_ref.tenant_id
    AND b.session_id = v_session.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'self_order_batch_not_pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.self_order_batches
  SET status = 'rejected',
      rejected_by = v_uid,
      rejected_at = now(),
      failure_reason = v_reason
  WHERE id = v_batch.id
    AND tenant_id = v_batch.tenant_id
    AND status = 'pending_approval';

  IF v_session.status = 'pending_approval' THEN
    UPDATE public.self_order_batches
    SET status = 'rejected',
        rejected_by = v_uid,
        rejected_at = now(),
        failure_reason = COALESCE(v_reason, 'initial_session_rejected')
    WHERE tenant_id = v_batch.tenant_id
      AND session_id = v_batch.session_id
      AND id <> v_batch.id
      AND status = 'pending_approval';

    UPDATE public.self_order_sessions
    SET status = 'revoked',
        closed_at = now(),
        close_reason = COALESCE(v_reason, 'staff_rejected')
    WHERE id = v_session.id
      AND tenant_id = v_session.tenant_id
      AND status = 'pending_approval';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_batch_request_fingerprint(jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_fill_batch_request_fingerprint()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_enforce_session_invariants()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_enforce_batch_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_guard_table_token_rotation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_table_self_order_qr(bigint)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_order_reject_batch(bigint, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.self_order_batch_request_fingerprint(jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_table_self_order_qr(bigint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_reject_batch(bigint, text)
  TO authenticated, service_role;
