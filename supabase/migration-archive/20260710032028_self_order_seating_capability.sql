ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS self_order_capability_version smallint NOT NULL DEFAULT 1;

ALTER TABLE public.tables
  DROP CONSTRAINT IF EXISTS tables_self_order_capability_version_check;
ALTER TABLE public.tables
  ADD CONSTRAINT tables_self_order_capability_version_check
  CHECK (self_order_capability_version IN (1, 2));

CREATE OR REPLACE FUNCTION public.self_order_random_token(p_bytes integer)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_token text;
BEGIN
  IF p_bytes IS NULL OR p_bytes < 16 OR p_bytes > 64 THEN
    RAISE EXCEPTION 'self_order_invalid_random_token_size' USING ERRCODE = '22023';
  END IF;

  v_token := encode(extensions.gen_random_bytes(p_bytes), 'base64');
  v_token := replace(replace(replace(replace(replace(
    v_token,
    '+', '-'
  ), '/', '_'), '=', ''), E'\n', ''), E'\r', '');
  RETURN v_token;
END;
$$;

ALTER TABLE public.self_order_sessions
  ADD COLUMN IF NOT EXISTS realtime_topic_token text
  DEFAULT public.self_order_random_token(24);

ALTER TABLE public.self_order_sessions
  ALTER COLUMN realtime_topic_token SET NOT NULL;
ALTER TABLE public.self_order_sessions
  ALTER COLUMN realtime_topic_token DROP DEFAULT;

ALTER TABLE public.self_order_sessions
  DROP CONSTRAINT IF EXISTS self_order_sessions_realtime_topic_token_format;
ALTER TABLE public.self_order_sessions
  ADD CONSTRAINT self_order_sessions_realtime_topic_token_format
  CHECK (
    char_length(realtime_topic_token) BETWEEN 22 AND 128
    AND realtime_topic_token ~ '^[A-Za-z0-9_-]+$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS self_order_sessions_realtime_topic_token_key
  ON public.self_order_sessions (realtime_topic_token);

CREATE OR REPLACE FUNCTION public.self_order_fill_realtime_topic_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.realtime_topic_token IS NULL THEN
    NEW.realtime_topic_token := public.self_order_random_token(24);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_fill_realtime_topic_token
  ON public.self_order_sessions;
CREATE TRIGGER trg_self_order_fill_realtime_topic_token
  BEFORE INSERT ON public.self_order_sessions
  FOR EACH ROW EXECUTE FUNCTION public.self_order_fill_realtime_topic_token();

CREATE TABLE IF NOT EXISTS public.self_order_session_devices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id bigint NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  session_id bigint NOT NULL REFERENCES public.self_order_sessions(id) ON DELETE CASCADE,
  device_token_hash text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  request_batch_id bigint,
  pairing_code_hash text,
  pairing_code_salt text,
  pairing_code_expires_at timestamptz,
  pairing_attempts integer NOT NULL DEFAULT 0,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id),
  rejected_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id),
  revoked_at timestamptz,
  revoked_reason text,
  expired_at timestamptz,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT self_order_session_devices_device_hash_format
    CHECK (device_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT self_order_session_devices_kind_check
    CHECK (kind IN ('origin', 'join')),
  CONSTRAINT self_order_session_devices_status_check
    CHECK (status IN (
      'origin_pending',
      'join_pending',
      'approved',
      'rejected',
      'revoked',
      'expired'
    )),
  CONSTRAINT self_order_session_devices_kind_status_check
    CHECK (
      (kind = 'origin' AND status <> 'join_pending')
      OR (kind = 'join' AND status <> 'origin_pending')
    ),
  CONSTRAINT self_order_session_devices_pairing_attempts_check
    CHECK (pairing_attempts BETWEEN 0 AND 3),
  CONSTRAINT self_order_session_devices_pairing_material_check
    CHECK (
      status NOT IN ('origin_pending', 'join_pending')
      OR (
        pairing_code_hash IS NOT NULL
        AND pairing_code_hash ~ '^[0-9a-f]{64}$'
        AND pairing_code_salt IS NOT NULL
        AND pairing_code_salt ~ '^[0-9a-f]{32}$'
        AND pairing_code_expires_at IS NOT NULL
      )
    ),
  CONSTRAINT self_order_session_devices_approval_check
    CHECK (
      status <> 'approved'
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
  CONSTRAINT self_order_session_devices_rejection_check
    CHECK (
      status <> 'rejected'
      OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL)
    ),
  CONSTRAINT self_order_session_devices_revocation_check
    CHECK (
      status <> 'revoked'
      OR revoked_at IS NOT NULL
    ),
  CONSTRAINT self_order_session_devices_expiry_check
    CHECK (
      status <> 'expired'
      OR expired_at IS NOT NULL
    ),
  CONSTRAINT self_order_session_devices_reason_length
    CHECK (revoked_reason IS NULL OR char_length(revoked_reason) <= 200),
  CONSTRAINT self_order_session_devices_expiry_order
    CHECK (expires_at > created_at)
);

ALTER TABLE public.self_order_session_devices
  DROP CONSTRAINT IF EXISTS self_order_session_devices_request_batch_id_fkey;
ALTER TABLE public.self_order_session_devices
  ADD CONSTRAINT self_order_session_devices_request_batch_id_fkey
  FOREIGN KEY (request_batch_id)
  REFERENCES public.self_order_batches(id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX IF NOT EXISTS self_order_session_devices_session_hash_key
  ON public.self_order_session_devices (tenant_id, session_id, device_token_hash);

CREATE INDEX IF NOT EXISTS idx_self_order_session_devices_staff_queue
  ON public.self_order_session_devices (
    tenant_id,
    branch_id,
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_self_order_session_devices_expiry
  ON public.self_order_session_devices (expires_at)
  WHERE status IN ('origin_pending', 'join_pending', 'approved');

ALTER TABLE public.self_order_session_devices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.self_order_batches
  ADD COLUMN IF NOT EXISTS session_device_id bigint;

ALTER TABLE public.self_order_batches
  DROP CONSTRAINT IF EXISTS self_order_batches_session_device_id_fkey;
ALTER TABLE public.self_order_batches
  ADD CONSTRAINT self_order_batches_session_device_id_fkey
  FOREIGN KEY (session_device_id)
  REFERENCES public.self_order_session_devices(id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX IF NOT EXISTS self_order_batches_one_pending_per_device
  ON public.self_order_batches (tenant_id, session_id, session_device_id)
  WHERE status = 'pending_approval' AND session_device_id IS NOT NULL;

ALTER TABLE public.self_order_payment_requests
  ADD COLUMN IF NOT EXISTS session_device_id bigint;

ALTER TABLE public.self_order_payment_requests
  DROP CONSTRAINT IF EXISTS self_order_payment_requests_session_device_id_fkey;
ALTER TABLE public.self_order_payment_requests
  ADD CONSTRAINT self_order_payment_requests_session_device_id_fkey
  FOREIGN KEY (session_device_id)
  REFERENCES public.self_order_session_devices(id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS public.self_order_rate_buckets (
  purpose text NOT NULL,
  scope_type text NOT NULL,
  scope_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (purpose, scope_type, scope_hash, window_start),
  CONSTRAINT self_order_rate_buckets_purpose_check
    CHECK (purpose IN ('origin', 'join', 'batch', 'payment')),
  CONSTRAINT self_order_rate_buckets_scope_type_check
    CHECK (scope_type IN ('token', 'ip', 'session', 'device')),
  CONSTRAINT self_order_rate_buckets_scope_hash_format
    CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT self_order_rate_buckets_hits_check CHECK (hits > 0),
  CONSTRAINT self_order_rate_buckets_expiry_check CHECK (expires_at > window_start)
);

CREATE INDEX IF NOT EXISTS idx_self_order_rate_buckets_expiry
  ON public.self_order_rate_buckets (expires_at);

ALTER TABLE public.self_order_rate_buckets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.self_order_pairing_code_hash(
  p_code text,
  p_salt text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT encode(
    extensions.digest(
      convert_to(COALESCE(p_salt, '') || ':' || COALESCE(p_code, ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.self_order_new_pairing_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_bytes bytea := extensions.gen_random_bytes(4);
  v_number bigint;
BEGIN
  v_number := (
    get_byte(v_bytes, 0)::bigint * 16777216
    + get_byte(v_bytes, 1)::bigint * 65536
    + get_byte(v_bytes, 2)::bigint * 256
    + get_byte(v_bytes, 3)::bigint
  ) % 1000000;
  RETURN lpad(v_number::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_enforce_session_device_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.table_id IS DISTINCT FROM NEW.table_id
     OR OLD.session_id IS DISTINCT FROM NEW.session_id
     OR OLD.device_token_hash IS DISTINCT FROM NEW.device_token_hash
     OR OLD.kind IS DISTINCT FROM NEW.kind THEN
    RAISE EXCEPTION 'self_order_device_identity_immutable' USING ERRCODE = '22023';
  END IF;

  IF OLD.request_batch_id IS DISTINCT FROM NEW.request_batch_id
     AND NOT (
       OLD.request_batch_id IS NULL
       AND NEW.request_batch_id IS NOT NULL
       AND OLD.status IN ('origin_pending', 'join_pending')
     ) THEN
    RAISE EXCEPTION 'self_order_device_batch_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.request_batch_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.self_order_batches b
       WHERE b.id = NEW.request_batch_id
         AND b.tenant_id = NEW.tenant_id
         AND b.branch_id = NEW.branch_id
         AND b.table_id = NEW.table_id
         AND b.session_id = NEW.session_id
         AND b.session_device_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'self_order_device_batch_scope_mismatch' USING ERRCODE = '23503';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (OLD.status IN ('origin_pending', 'join_pending')
        AND NEW.status IN ('approved', 'rejected', 'revoked', 'expired'))
       OR (OLD.status = 'approved' AND NEW.status IN ('revoked', 'expired'))
     ) THEN
    RAISE EXCEPTION 'self_order_invalid_device_transition' USING ERRCODE = '22023';
  END IF;

  IF OLD.status = 'approved'
     AND OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'self_order_device_expiry_immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.pairing_attempts < OLD.pairing_attempts
     OR NEW.pairing_attempts > OLD.pairing_attempts + 1 THEN
    RAISE EXCEPTION 'self_order_invalid_pairing_attempt_count' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_enforce_session_device_invariants
  ON public.self_order_session_devices;
CREATE TRIGGER trg_self_order_enforce_session_device_invariants
  BEFORE UPDATE ON public.self_order_session_devices
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_session_device_invariants();

DROP TRIGGER IF EXISTS trg_self_order_session_devices_updated_at
  ON public.self_order_session_devices;
CREATE TRIGGER trg_self_order_session_devices_updated_at
  BEFORE UPDATE ON public.self_order_session_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_self_order_rate_buckets_updated_at
  ON public.self_order_rate_buckets;
CREATE TRIGGER trg_self_order_rate_buckets_updated_at
  BEFORE UPDATE ON public.self_order_rate_buckets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.self_order_enforce_batch_device_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.session_device_id IS NOT NULL
     AND OLD.session_device_id IS DISTINCT FROM NEW.session_device_id THEN
    RAISE EXCEPTION 'self_order_batch_device_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.session_device_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.self_order_session_devices d
       WHERE d.id = NEW.session_device_id
         AND d.tenant_id = NEW.tenant_id
         AND d.branch_id = NEW.branch_id
         AND d.table_id = NEW.table_id
         AND d.session_id = NEW.session_id
     ) THEN
    RAISE EXCEPTION 'self_order_batch_device_scope_mismatch' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_enforce_batch_device_binding_insert
  ON public.self_order_batches;
DROP TRIGGER IF EXISTS trg_self_order_enforce_batch_device_binding_update
  ON public.self_order_batches;
CREATE TRIGGER trg_self_order_enforce_batch_device_binding_insert
  BEFORE INSERT ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_batch_device_binding();
CREATE TRIGGER trg_self_order_enforce_batch_device_binding_update
  BEFORE UPDATE OF session_device_id ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_batch_device_binding();

CREATE OR REPLACE FUNCTION public.self_order_enforce_payment_device_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.session_device_id IS NOT NULL
     AND OLD.session_device_id IS DISTINCT FROM NEW.session_device_id THEN
    RAISE EXCEPTION 'self_order_payment_device_binding_immutable' USING ERRCODE = '22023';
  END IF;

  IF NEW.session_device_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.self_order_session_devices d
       WHERE d.id = NEW.session_device_id
         AND d.tenant_id = NEW.tenant_id
         AND d.branch_id = NEW.branch_id
         AND d.table_id = NEW.table_id
         AND d.session_id = NEW.session_id
     ) THEN
    RAISE EXCEPTION 'self_order_payment_device_scope_mismatch' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_device_binding_insert
  ON public.self_order_payment_requests;
DROP TRIGGER IF EXISTS trg_self_order_enforce_payment_device_binding_update
  ON public.self_order_payment_requests;
CREATE TRIGGER trg_self_order_enforce_payment_device_binding_insert
  BEFORE INSERT ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_payment_device_binding();
CREATE TRIGGER trg_self_order_enforce_payment_device_binding_update
  BEFORE UPDATE OF session_device_id ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_payment_device_binding();

CREATE OR REPLACE FUNCTION public.self_order_scope_hash(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT encode(
    extensions.digest(convert_to(COALESCE(p_value, ''), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.self_order_take_rate_bucket(
  p_purpose text,
  p_scope_type text,
  p_scope_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_window_start timestamptz;
  v_hits integer;
  v_retry_after_seconds integer;
BEGIN
  IF p_scope_hash IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope_hash !~ '^[0-9a-f]{64}$'
     OR p_limit < 1
     OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'self_order_invalid_rate_limit_input' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  DELETE FROM public.self_order_rate_buckets r
  WHERE r.ctid IN (
    SELECT stale.ctid
    FROM public.self_order_rate_buckets stale
    WHERE stale.expires_at <= now()
    ORDER BY stale.expires_at
    LIMIT 100
  );

  INSERT INTO public.self_order_rate_buckets (
    purpose,
    scope_type,
    scope_hash,
    window_start,
    hits,
    expires_at
  )
  VALUES (
    p_purpose,
    p_scope_type,
    p_scope_hash,
    v_window_start,
    1,
    v_window_start + make_interval(secs => p_window_seconds * 2)
  )
  ON CONFLICT (purpose, scope_type, scope_hash, window_start)
  DO UPDATE SET hits = self_order_rate_buckets.hits + 1
  RETURNING hits INTO v_hits;

  IF v_hits > p_limit THEN
    v_retry_after_seconds := GREATEST(
      1,
      ceil(extract(epoch FROM (
        v_window_start
        + make_interval(secs => p_window_seconds)
        - clock_timestamp()
      )))::integer
    );
    RAISE EXCEPTION 'self_order_rate_limited'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'retryAfterSeconds', v_retry_after_seconds
            )::text;
  END IF;

  RETURN v_hits;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_consume_rate_limits(
  p_purpose text,
  p_token text,
  p_ip_hash text,
  p_tenant_id bigint,
  p_table_id bigint,
  p_session_id bigint,
  p_device_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_token_hash text;
  v_ip_scope_hash text;
  v_session_hash text;
  v_token_limit integer;
  v_ip_limit integer;
  v_session_limit integer;
  v_device_limit integer;
  v_window_seconds integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$')
     OR p_token IS NULL
     OR p_token = ''
     OR p_tenant_id IS NULL
     OR p_table_id IS NULL
     OR p_device_hash IS NULL
     OR p_device_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'self_order_invalid_rate_identity' USING ERRCODE = '22023';
  END IF;

  CASE p_purpose
    WHEN 'origin' THEN
      v_token_limit := 10;
      v_ip_limit := 10;
      v_session_limit := 10;
      v_device_limit := 3;
      v_window_seconds := 900;
    WHEN 'join' THEN
      v_token_limit := 10;
      v_ip_limit := 10;
      v_session_limit := 10;
      v_device_limit := 3;
      v_window_seconds := 900;
    WHEN 'batch' THEN
      v_token_limit := 20;
      v_ip_limit := 30;
      v_session_limit := 20;
      v_device_limit := 10;
      v_window_seconds := 600;
    WHEN 'payment' THEN
      v_token_limit := 10;
      v_ip_limit := 15;
      v_session_limit := 5;
      v_device_limit := 5;
      v_window_seconds := 600;
    ELSE
      RAISE EXCEPTION 'self_order_invalid_rate_purpose' USING ERRCODE = '22023';
  END CASE;

  v_token_hash := public.self_order_scope_hash(
    p_tenant_id::text || ':' || p_table_id::text || ':' || p_token
  );
  v_ip_scope_hash := CASE
    WHEN p_ip_hash IS NULL THEN NULL
    ELSE public.self_order_scope_hash(v_token_hash || ':' || p_ip_hash)
  END;
  v_session_hash := CASE
    WHEN p_session_id IS NULL THEN NULL
    ELSE public.self_order_scope_hash(p_session_id::text)
  END;

  PERFORM public.self_order_take_rate_bucket(
    p_purpose,
    'token',
    v_token_hash,
    v_token_limit,
    v_window_seconds
  );
  IF p_ip_hash IS NOT NULL THEN
    PERFORM public.self_order_take_rate_bucket(
      p_purpose,
      'ip',
      v_ip_scope_hash,
      v_ip_limit,
      v_window_seconds
    );
  END IF;
  IF v_session_hash IS NOT NULL THEN
    PERFORM public.self_order_take_rate_bucket(
      p_purpose,
      'session',
      v_session_hash,
      v_session_limit,
      v_window_seconds
    );
  END IF;
  PERFORM public.self_order_take_rate_bucket(
    p_purpose,
    'device',
    p_device_hash,
    v_device_limit,
    v_window_seconds
  );

  RETURN jsonb_build_object(
    'ok', true,
    'windowSeconds', v_window_seconds
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_create_pending_device(
  p_session_id bigint,
  p_device_hash text,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_session public.self_order_sessions%ROWTYPE;
  v_device_id bigint;
  v_code text;
  v_salt text;
  v_pairing_expires_at timestamptz := now() + interval '5 minutes';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_device_hash IS NULL
     OR p_device_hash !~ '^[0-9a-f]{64}$'
     OR p_kind IS NULL
     OR p_kind NOT IN ('origin', 'join') THEN
    RAISE EXCEPTION 'self_order_invalid_device_request' USING ERRCODE = '22023';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  JOIN public.tables t
    ON t.id = s.table_id
   AND t.tenant_id = s.tenant_id
   AND t.self_order_capability_version = 2
  WHERE s.id = p_session_id
    AND s.status IN ('pending_approval', 'active')
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  UPDATE public.self_order_session_devices
  SET status = 'expired',
      expired_at = now(),
      revoked_reason = 'device_capability_expired',
      pairing_code_hash = NULL,
      pairing_code_salt = NULL,
      pairing_code_expires_at = NULL
  WHERE tenant_id = v_session.tenant_id
    AND session_id = v_session.id
    AND status IN ('origin_pending', 'join_pending', 'approved')
    AND expires_at <= now();

  IF (
    SELECT count(*)
    FROM public.self_order_session_devices d
    WHERE d.tenant_id = v_session.tenant_id
      AND d.session_id = v_session.id
      AND d.status IN ('origin_pending', 'join_pending', 'approved')
      AND d.expires_at > now()
  ) >= 7 THEN
    RAISE EXCEPTION 'self_order_device_limit_reached' USING ERRCODE = '54000';
  END IF;

  IF p_kind = 'join' AND (
    SELECT count(*)
    FROM public.self_order_session_devices d
    WHERE d.tenant_id = v_session.tenant_id
      AND d.session_id = v_session.id
      AND d.status = 'approved'
      AND d.expires_at > now()
  ) >= 4 THEN
    RAISE EXCEPTION 'self_order_approved_device_limit_reached' USING ERRCODE = '54000';
  END IF;

  v_code := public.self_order_new_pairing_code();
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO public.self_order_session_devices (
    tenant_id,
    branch_id,
    table_id,
    session_id,
    device_token_hash,
    kind,
    status,
    pairing_code_hash,
    pairing_code_salt,
    pairing_code_expires_at,
    expires_at
  )
  VALUES (
    v_session.tenant_id,
    v_session.branch_id,
    v_session.table_id,
    v_session.id,
    p_device_hash,
    p_kind,
    CASE WHEN p_kind = 'origin' THEN 'origin_pending' ELSE 'join_pending' END,
    public.self_order_pairing_code_hash(v_code, v_salt),
    v_salt,
    v_pairing_expires_at,
    now() + interval '15 minutes'
  )
  RETURNING id INTO v_device_id;

  RETURN jsonb_build_object(
    'deviceId', v_device_id,
    'status', CASE WHEN p_kind = 'origin' THEN 'origin_pending' ELSE 'join_pending' END,
    'pairingCode', v_code,
    'pairingExpiresAt', v_pairing_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_refresh_pairing_code(
  p_device_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_device public.self_order_session_devices%ROWTYPE;
  v_code text;
  v_salt text;
  v_pairing_expires_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = p_device_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_device.status NOT IN ('origin_pending', 'join_pending')
     OR v_device.expires_at <= now() THEN
    RAISE EXCEPTION 'self_order_device_not_pending' USING ERRCODE = '22023';
  END IF;

  v_pairing_expires_at := LEAST(
    now() + interval '5 minutes',
    v_device.expires_at
  );
  v_code := public.self_order_new_pairing_code();
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  UPDATE public.self_order_session_devices
  SET pairing_code_hash = public.self_order_pairing_code_hash(v_code, v_salt),
      pairing_code_salt = v_salt,
      pairing_code_expires_at = v_pairing_expires_at
  WHERE id = v_device.id;

  RETURN jsonb_build_object(
    'deviceId', v_device.id,
    'status', v_device.status,
    'pairingCode', v_code,
    'pairingExpiresAt', v_pairing_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_guard_capability_version_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.self_order_capability_version IS NOT DISTINCT FROM NEW.self_order_capability_version THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.self_order_capability_flip', true)
       IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'self_order_capability_version_rpc_required' USING ERRCODE = '42501';
  END IF;
  IF NOT pg_try_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(OLD.id::text)
  ) THEN
    RAISE EXCEPTION 'self_order_operation_in_progress' USING ERRCODE = '55P03';
  END IF;
  IF auth.uid() IS NULL
     OR public.auth_tenant_id() IS DISTINCT FROM OLD.tenant_id
     OR NOT public.has_permission(OLD.branch_id, 'settings:branch') THEN
    RAISE EXCEPTION 'permission denied: settings:branch' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
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

DROP TRIGGER IF EXISTS trg_self_order_guard_capability_version_change
  ON public.tables;
CREATE TRIGGER trg_self_order_guard_capability_version_change
  BEFORE UPDATE OF self_order_capability_version ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.self_order_guard_capability_version_change();

CREATE OR REPLACE FUNCTION public.set_table_self_order_capability_version(
  p_table_id bigint,
  p_version smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_table public.tables%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_version IS NULL OR p_version NOT IN (1, 2) THEN
    RAISE EXCEPTION 'self_order_invalid_capability_version' USING ERRCODE = '22023';
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

  PERFORM set_config(
    'app.self_order_capability_flip',
    v_table.id::text,
    true
  );

  UPDATE public.tables
  SET self_order_capability_version = p_version
  WHERE id = v_table.id
    AND tenant_id = v_table.tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tableId', v_table.id,
    'capabilityVersion', p_version
  );
END;
$$;

ALTER FUNCTION public.self_order_get_snapshot(text) SET SCHEMA private;
ALTER FUNCTION private.self_order_get_snapshot(text)
  RENAME TO self_order_get_snapshot_v1_base;

ALTER FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text)
  SET SCHEMA private;
ALTER FUNCTION private.self_order_submit_batch(text, uuid, jsonb, text)
  RENAME TO self_order_submit_batch_v1_base;

ALTER FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb)
  SET SCHEMA private;
ALTER FUNCTION private.self_order_create_payment_request(text, uuid, text, jsonb)
  RENAME TO self_order_create_payment_request_v1_base;

ALTER FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid)
  SET SCHEMA private;
ALTER FUNCTION private.self_order_approve_batch(bigint, bigint, bigint, uuid)
  RENAME TO self_order_approve_batch_v1_base;

ALTER FUNCTION public.self_order_reject_batch(bigint, text)
  SET SCHEMA private;
ALTER FUNCTION private.self_order_reject_batch(bigint, text)
  RENAME TO self_order_reject_batch_v1_base;

CREATE OR REPLACE FUNCTION public.self_order_get_public_context_v2(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_has_open_session boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    t.id AS table_id,
    t.tenant_id,
    t.branch_id,
    t.number AS table_number,
    t.self_order_capability_version,
    b.name AS branch_name
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

  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.self_order_sessions s
    WHERE s.tenant_id = v_table.tenant_id
      AND s.table_id = v_table.table_id
      AND s.status IN ('pending_approval', 'active')
  ) INTO v_has_open_session;

  RETURN jsonb_build_object(
    'ok', true,
    'access', 'public',
    'capabilityVersion', v_table.self_order_capability_version,
    'seatingAccess', CASE
      WHEN v_has_open_session THEN 'join_required'
      ELSE 'available'
    END,
    'branch', jsonb_build_object('name', v_table.branch_name),
    'table', jsonb_build_object('number', v_table.table_number),
    'session', NULL,
    'order', NULL,
    'batches', '[]'::jsonb,
    'paymentRequest', NULL,
    'menu', public.self_order_menu_payload(v_table.tenant_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_version smallint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT t.self_order_capability_version
  INTO v_version
  FROM public.tables t
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
  LIMIT 1;

  IF FOUND AND v_version = 2 THEN
    RETURN public.self_order_get_public_context_v2(p_token);
  END IF;
  RETURN private.self_order_get_snapshot_v1_base(p_token);
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
  v_table_id bigint;
  v_version smallint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  SELECT t.id
  INTO v_table_id
  FROM public.tables t
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
  LIMIT 1;

  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('self-order-table'),
      hashtext(v_table_id::text)
    );

    SELECT t.self_order_capability_version
    INTO v_version
    FROM public.tables t
    WHERE t.id = v_table_id
      AND t.self_order_token = p_token
      AND t.self_order_enabled = true
    LIMIT 1;

    IF FOUND AND v_version = 2 THEN
      RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN private.self_order_submit_batch_v1_base(
    p_token,
    p_client_op_id,
    p_items,
    p_customer_note
  );
END;
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
  v_version smallint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  SELECT t.self_order_capability_version
  INTO v_version
  FROM public.tables t
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
  LIMIT 1;
  IF FOUND AND v_version = 2 THEN
    RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
  END IF;
  RETURN private.self_order_create_payment_request_v1_base(
    p_token,
    p_client_op_id,
    p_method,
    p_invoice_payload
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
  v_version smallint;
BEGIN
  SELECT t.self_order_capability_version
  INTO v_version
  FROM public.self_order_batches b
  JOIN public.tables t
    ON t.id = b.table_id
   AND t.tenant_id = b.tenant_id
  WHERE b.id = p_batch_id
    AND b.tenant_id = public.auth_tenant_id();
  IF FOUND AND v_version = 2 THEN
    RAISE EXCEPTION 'self_order_pairing_required' USING ERRCODE = '42501';
  END IF;
  RETURN private.self_order_approve_batch_v1_base(
    p_batch_id,
    p_target_order_id,
    p_pos_session_id,
    p_idempotency_key
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
  v_version smallint;
BEGIN
  SELECT t.self_order_capability_version
  INTO v_version
  FROM public.self_order_batches b
  JOIN public.tables t
    ON t.id = b.table_id
   AND t.tenant_id = b.tenant_id
  WHERE b.id = p_batch_id
    AND b.tenant_id = public.auth_tenant_id();
  IF FOUND AND v_version = 2 THEN
    RAISE EXCEPTION 'self_order_pairing_required' USING ERRCODE = '42501';
  END IF;
  RETURN private.self_order_reject_batch_v1_base(p_batch_id, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot_v2(
  p_token text,
  p_device_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session public.self_order_sessions%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_context jsonb;
  v_payload jsonb;
  v_pending_batch jsonb := 'null'::jsonb;
  v_session_id bigint;
  v_order_id bigint;
  v_terminal_device_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_device_hash IS NULL OR p_device_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'self_order_invalid_device_identity' USING ERRCODE = '22023';
  END IF;

  v_context := public.self_order_get_public_context_v2(p_token);
  IF COALESCE((v_context ->> 'ok')::boolean, false) = false THEN
    RETURN v_context;
  END IF;

  SELECT t.id AS table_id, t.tenant_id, t.self_order_capability_version
  INTO v_table
  FROM public.tables t
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND OR v_table.self_order_capability_version <> 2 THEN
    RETURN v_context;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.table_id
    AND s.status IN ('pending_approval', 'active')
    AND s.token_snapshot = p_token
  ORDER BY s.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT d.status
    INTO v_terminal_device_status
    FROM public.self_order_sessions s
    JOIN public.self_order_session_devices d
      ON d.tenant_id = s.tenant_id
     AND d.session_id = s.id
     AND d.device_token_hash = p_device_hash
    WHERE s.id = (
      SELECT latest.id
      FROM public.self_order_sessions latest
      WHERE latest.tenant_id = v_table.tenant_id
        AND latest.table_id = v_table.table_id
        AND latest.token_snapshot = p_token
      ORDER BY latest.id DESC
      LIMIT 1
    );

    IF FOUND
       AND v_terminal_device_status IN ('rejected', 'revoked', 'expired') THEN
      RETURN v_context || jsonb_build_object(
        'deviceAccess', v_terminal_device_status
      );
    END IF;
    RETURN v_context;
  END IF;
  v_session_id := v_session.id;
  v_order_id := v_session.order_id;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.tenant_id = v_session.tenant_id
    AND d.session_id = v_session.id
    AND d.device_token_hash = p_device_hash;

  IF NOT FOUND THEN
    RETURN v_context;
  END IF;

  IF v_device.status IN ('rejected', 'revoked', 'expired') THEN
    RETURN v_context || jsonb_build_object(
      'deviceAccess', v_device.status
    );
  END IF;
  IF v_device.expires_at <= now() THEN
    RETURN v_context || jsonb_build_object('deviceAccess', 'expired');
  END IF;

  IF v_device.status IN ('origin_pending', 'join_pending') THEN
    IF v_order_id IS NOT NULL THEN
      PERFORM 1
      FROM public.orders o
      WHERE o.id = v_order_id
        AND o.tenant_id = v_session.tenant_id
      FOR SHARE;
      IF NOT FOUND THEN
        RETURN v_context;
      END IF;
    END IF;

    SELECT s.*
    INTO v_session
    FROM public.self_order_sessions s
    WHERE s.id = v_session_id
      AND s.tenant_id = v_table.tenant_id
      AND s.status IN ('pending_approval', 'active')
      AND s.order_id IS NOT DISTINCT FROM v_order_id
    FOR SHARE;
    IF NOT FOUND THEN
      RETURN v_context;
    END IF;

    SELECT d.*
    INTO v_device
    FROM public.self_order_session_devices d
    WHERE d.tenant_id = v_session.tenant_id
      AND d.session_id = v_session.id
      AND d.device_token_hash = p_device_hash
      AND d.status IN ('origin_pending', 'join_pending')
      AND d.expires_at > now()
    FOR SHARE;
    IF NOT FOUND THEN
      RETURN v_context;
    END IF;

    SELECT jsonb_build_object(
      'id', b.id,
      'status', b.status,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'menuItemId', CASE
            WHEN (elem ->> 'menu_item_id') ~ '^[0-9]+$'
              THEN (elem ->> 'menu_item_id')::bigint
            ELSE NULL
          END,
          'itemName', COALESCE(NULLIF(elem ->> 'item_name', ''), '?'),
          'variantId', CASE
            WHEN (elem ->> 'variant_id') ~ '^[0-9]+$'
              THEN (elem ->> 'variant_id')::bigint
            ELSE NULL
          END,
          'variantName', NULLIF(elem ->> 'variant_name', ''),
          'quantity', CASE
            WHEN (elem ->> 'quantity') ~ '^[0-9]+$'
              THEN GREATEST(1, LEAST(99, (elem ->> 'quantity')::integer))
            ELSE 1
          END,
          'unitPrice', CASE
            WHEN (elem ->> 'unit_price') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN (elem ->> 'unit_price')::numeric
            ELSE 0
          END,
          'modifiers', CASE
            WHEN jsonb_typeof(elem -> 'modifiers') = 'array'
              THEN elem -> 'modifiers'
            ELSE '[]'::jsonb
          END,
          'sides', CASE
            WHEN jsonb_typeof(elem -> 'sides') = 'array'
              THEN elem -> 'sides'
            ELSE '[]'::jsonb
          END,
          'note', NULLIF(elem ->> 'note', '')
        ) ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.cart_payload) = 'array' THEN b.cart_payload
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS item(elem, ord)
      ),
      'customerNote', b.customer_note,
      'createdAt', b.created_at
    )
    INTO v_pending_batch
    FROM public.self_order_batches b
    WHERE b.tenant_id = v_device.tenant_id
      AND b.session_id = v_device.session_id
      AND b.session_device_id = v_device.id
      AND b.status = 'pending_approval'
    ORDER BY b.id DESC
    LIMIT 1;

    RETURN v_context || jsonb_build_object(
      'access', v_device.status,
      'deviceRequest', jsonb_build_object(
        'deviceId', v_device.id,
        'kind', v_device.kind,
        'status', v_device.status,
        'pairingExpiresAt', v_device.pairing_code_expires_at,
        'expiresAt', v_device.expires_at
      ),
      'pendingBatch', COALESCE(v_pending_batch, 'null'::jsonb)
    );
  END IF;

  IF v_device.status <> 'approved'
     OR v_session.status <> 'active' THEN
    RETURN v_context;
  END IF;

  v_payload := private.self_order_get_snapshot_v1_base(p_token);

  IF v_order_id IS NULL THEN
    RETURN v_context;
  END IF;
  PERFORM 1
  FROM public.orders o
  WHERE o.id = v_order_id
    AND o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_session.branch_id
    AND o.table_id IS NOT DISTINCT FROM v_session.table_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN v_context;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_session_id
    AND s.tenant_id = v_table.tenant_id
    AND s.status = 'active'
    AND s.order_id = v_order_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN v_context;
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.tenant_id = v_session.tenant_id
    AND d.session_id = v_session.id
    AND d.device_token_hash = p_device_hash
    AND d.status = 'approved'
    AND d.expires_at > now()
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN v_context || jsonb_build_object('deviceAccess', 'expired');
  END IF;

  v_payload := jsonb_set(
    v_payload,
    ARRAY['realtimeTopic'],
    to_jsonb(('self-order:seat:' || v_session.realtime_topic_token)::text),
    true
  );

  RETURN v_payload || jsonb_build_object(
    'access', 'approved',
    'capabilityVersion', 2,
    'seatingAccess', 'approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_submit_batch_v2(
  p_token text,
  p_device_hash text,
  p_ip_hash text,
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
  v_table public.tables%ROWTYPE;
  v_session_ref public.self_order_sessions%ROWTYPE;
  v_session public.self_order_sessions%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_existing record;
  v_order public.orders%ROWTYPE;
  v_batch public.self_order_batches%ROWTYPE;
  v_items jsonb;
  v_customer_note text := NULLIF(btrim(COALESCE(p_customer_note, '')), '');
  v_fingerprint text;
  v_pairing jsonb;
  v_result jsonb;
  v_device_found boolean := false;
  v_prior_device_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL
     OR p_device_hash IS NULL
     OR p_device_hash !~ '^[0-9a-f]{64}$'
     OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$')
     OR p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_self_order_request' USING ERRCODE = '22023';
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
    AND t.self_order_capability_version = 2
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.id = v_table.id
    AND t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
    AND t.self_order_capability_version = 2;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  SELECT
    b.*,
    d.id AS bound_device_id,
    d.kind AS device_kind,
    d.status AS device_status,
    d.expires_at AS device_expires_at,
    d.pairing_code_expires_at AS device_pairing_expires_at
  INTO v_existing
  FROM public.self_order_batches b
  JOIN public.self_order_session_devices d
    ON d.id = b.session_device_id
   AND d.tenant_id = b.tenant_id
   AND d.session_id = b.session_id
  JOIN public.self_order_sessions s
    ON s.id = b.session_id
   AND s.tenant_id = b.tenant_id
  WHERE b.tenant_id = v_table.tenant_id
    AND b.table_id = v_table.id
    AND b.client_op_id = p_client_op_id
    AND d.device_token_hash = p_device_hash
    AND s.token_snapshot = p_token
  ORDER BY s.id DESC
  LIMIT 1
  FOR UPDATE OF b, d;

  IF FOUND THEN
    IF v_existing.request_fingerprint_version = 'batch:v1'
       AND v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;

    IF v_existing.device_status IN ('origin_pending', 'join_pending') THEN
      RETURN jsonb_build_object(
        'ok', true,
        'status', v_existing.status,
        'batchId', v_existing.id,
        'access', CASE
          WHEN v_existing.device_expires_at <= now() THEN 'expired'
          ELSE v_existing.device_status
        END,
        'idempotent', true,
        'pairingRefreshRequired', v_existing.device_expires_at > now(),
        'deviceRequest', jsonb_build_object(
          'deviceId', v_existing.bound_device_id,
          'kind', v_existing.device_kind,
          'status', v_existing.device_status,
          'pairingExpiresAt', v_existing.device_pairing_expires_at,
          'expiresAt', v_existing.device_expires_at
        )
      );
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
      'ok', true,
      'status', v_existing.status,
      'batchId', v_existing.id,
      'orderId', v_existing.order_id,
      'access', CASE
        WHEN v_existing.device_status = 'approved'
             AND v_existing.device_expires_at > now() THEN 'approved'
        ELSE 'expired'
      END,
      'idempotent', true
    ));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_batches b
    JOIN public.self_order_session_devices d
      ON d.id = b.session_device_id
     AND d.tenant_id = b.tenant_id
     AND d.session_id = b.session_id
    JOIN public.self_order_sessions s
      ON s.id = b.session_id
     AND s.tenant_id = b.tenant_id
    WHERE b.tenant_id = v_table.tenant_id
      AND b.table_id = v_table.id
      AND b.client_op_id = p_client_op_id
      AND s.token_snapshot = p_token
      AND d.device_token_hash <> p_device_hash
  ) THEN
    RAISE EXCEPTION 'self_order_idempotency_device_conflict' USING ERRCODE = '22023';
  END IF;

  SELECT s.*
  INTO v_session_ref
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.status IN ('pending_approval', 'active')
  ORDER BY s.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT d.status
    INTO v_prior_device_status
    FROM public.self_order_sessions s
    JOIN public.self_order_session_devices d
      ON d.tenant_id = s.tenant_id
     AND d.session_id = s.id
     AND d.device_token_hash = p_device_hash
    WHERE s.id = (
      SELECT latest.id
      FROM public.self_order_sessions latest
      WHERE latest.tenant_id = v_table.tenant_id
        AND latest.table_id = v_table.id
        AND latest.token_snapshot = p_token
      ORDER BY latest.id DESC
      LIMIT 1
    );

    IF FOUND AND v_prior_device_status IN ('rejected', 'revoked') THEN
      RAISE EXCEPTION 'self_order_device_%', v_prior_device_status
        USING ERRCODE = '42501';
    END IF;
    IF p_ip_hash IS NULL THEN
      RAISE EXCEPTION 'self_order_trusted_ip_required' USING ERRCODE = '42501';
    END IF;
    PERFORM public.self_order_consume_rate_limits(
      'origin',
      p_token,
      p_ip_hash,
      v_table.tenant_id,
      v_table.id,
      NULL,
      p_device_hash
    );
    v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);

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

    v_pairing := public.self_order_create_pending_device(
      v_session.id,
      p_device_hash,
      'origin'
    );

    INSERT INTO public.self_order_batches (
      tenant_id,
      branch_id,
      table_id,
      session_id,
      session_device_id,
      client_op_id,
      status,
      cart_payload,
      customer_note,
      request_fingerprint,
      request_fingerprint_version
    )
    VALUES (
      v_session.tenant_id,
      v_session.branch_id,
      v_session.table_id,
      v_session.id,
      (v_pairing ->> 'deviceId')::bigint,
      p_client_op_id,
      'pending_approval',
      v_items,
      v_customer_note,
      v_fingerprint,
      'batch:v1'
    )
    RETURNING * INTO v_batch;

    UPDATE public.self_order_session_devices
    SET request_batch_id = v_batch.id
    WHERE id = v_batch.session_device_id
      AND status = 'origin_pending';

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'pending_approval',
      'batchId', v_batch.id,
      'access', 'origin_pending',
      'deviceRequest', v_pairing || jsonb_build_object('kind', 'origin')
    );
  END IF;

  IF v_session_ref.status = 'pending_approval' THEN
    SELECT s.*
    INTO v_session
    FROM public.self_order_sessions s
    WHERE s.id = v_session_ref.id
      AND s.tenant_id = v_session_ref.tenant_id
    FOR UPDATE;

    UPDATE public.self_order_session_devices
    SET status = 'expired',
        expired_at = now(),
        revoked_reason = 'device_capability_expired',
        pairing_code_hash = NULL,
        pairing_code_salt = NULL,
        pairing_code_expires_at = NULL
    WHERE tenant_id = v_session.tenant_id
      AND session_id = v_session.id
      AND status IN ('origin_pending', 'join_pending', 'approved')
      AND expires_at <= now();

    IF NOT EXISTS (
      SELECT 1
      FROM public.self_order_session_devices d
      WHERE d.tenant_id = v_session.tenant_id
        AND d.session_id = v_session.id
        AND d.kind = 'origin'
        AND d.status IN ('origin_pending', 'approved')
        AND d.expires_at > now()
    ) THEN
      UPDATE public.self_order_batches
      SET status = 'failed',
          failure_reason = 'origin_device_expired'
      WHERE tenant_id = v_session.tenant_id
        AND session_id = v_session.id
        AND status = 'pending_approval';

      UPDATE public.self_order_sessions
      SET status = 'revoked',
          closed_at = now(),
          close_reason = 'origin_device_expired'
      WHERE id = v_session.id
        AND status = 'pending_approval';

      RETURN jsonb_build_object(
        'ok', false,
        'code', 'self_order_session_expired',
        'retry', true
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_join_required'
    );
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
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.tenant_id = v_session.tenant_id
    AND d.session_id = v_session.id
    AND d.device_token_hash = p_device_hash;
  v_device_found := FOUND;

  IF v_device_found AND v_device.expires_at <= now() THEN
    RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
  END IF;

  IF v_device_found
     AND v_device.status = 'approved'
     AND v_device.expires_at > now() THEN
    PERFORM public.self_order_consume_rate_limits(
      'batch',
      p_token,
      p_ip_hash,
      v_table.tenant_id,
      v_table.id,
      v_session.id,
      p_device_hash
    );
    v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);

    INSERT INTO public.self_order_batches (
      tenant_id,
      branch_id,
      table_id,
      session_id,
      session_device_id,
      client_op_id,
      status,
      cart_payload,
      customer_note,
      request_fingerprint,
      request_fingerprint_version
    )
    VALUES (
      v_session.tenant_id,
      v_session.branch_id,
      v_session.table_id,
      v_session.id,
      v_device.id,
      p_client_op_id,
      'pending_approval',
      v_items,
      v_customer_note,
      v_fingerprint,
      'batch:v1'
    )
    RETURNING * INTO v_batch;

    v_result := public.self_order_append_active_batch(
      v_session.id,
      v_batch.id,
      p_client_op_id,
      v_items
    );

    SELECT d.*
    INTO v_device
    FROM public.self_order_session_devices d
    WHERE d.id = v_batch.session_device_id
      AND d.tenant_id = v_batch.tenant_id
      AND d.session_id = v_batch.session_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_device.status <> 'approved'
       OR v_device.expires_at <= now() THEN
      RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.self_order_session_devices
    SET last_seen_at = now()
    WHERE id = v_device.id;

    RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'status', 'auto_accepted',
      'batchId', v_batch.id,
      'access', 'approved'
    );
  END IF;

  IF v_device_found
     AND v_device.status IN ('rejected', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
  END IF;

  IF p_ip_hash IS NULL THEN
    RAISE EXCEPTION 'self_order_trusted_ip_required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.self_order_consume_rate_limits(
    'join',
    p_token,
    p_ip_hash,
    v_table.tenant_id,
    v_table.id,
    v_session.id,
    p_device_hash
  );

  IF NOT v_device_found THEN
    v_pairing := public.self_order_create_pending_device(
      v_session.id,
      p_device_hash,
      'join'
    );
    SELECT d.*
    INTO v_device
    FROM public.self_order_session_devices d
    WHERE d.id = (v_pairing ->> 'deviceId')::bigint;
  ELSE
    v_pairing := public.self_order_refresh_pairing_code(v_device.id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_batches b
    WHERE b.tenant_id = v_session.tenant_id
      AND b.session_id = v_session.id
      AND b.session_device_id = v_device.id
      AND b.status = 'pending_approval'
  ) THEN
    RAISE EXCEPTION 'self_order_device_batch_pending' USING ERRCODE = '55P03';
  END IF;

  v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);
  INSERT INTO public.self_order_batches (
    tenant_id,
    branch_id,
    table_id,
    session_id,
    session_device_id,
    client_op_id,
    status,
    cart_payload,
    customer_note,
    request_fingerprint,
    request_fingerprint_version
  )
  VALUES (
    v_session.tenant_id,
    v_session.branch_id,
    v_session.table_id,
    v_session.id,
    v_device.id,
    p_client_op_id,
    'pending_approval',
    v_items,
    v_customer_note,
    v_fingerprint,
    'batch:v1'
  )
  RETURNING * INTO v_batch;

  UPDATE public.self_order_session_devices
  SET request_batch_id = v_batch.id
  WHERE id = v_device.id
    AND request_batch_id IS NULL
    AND status = 'join_pending';

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'pending_approval',
    'batchId', v_batch.id,
    'access', 'join_pending',
    'deviceRequest', v_pairing || jsonb_build_object('kind', 'join')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_request_device_join_v2(
  p_token text,
  p_device_hash text,
  p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_session public.self_order_sessions%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_pairing jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_device_hash IS NULL
     OR p_device_hash !~ '^[0-9a-f]{64}$'
     OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'self_order_invalid_device_identity' USING ERRCODE = '22023';
  END IF;

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
    AND t.self_order_capability_version = 2
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  WHERE t.id = v_table.id
    AND t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
    AND t.self_order_capability_version = 2;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.token_snapshot = p_token
    AND s.status IN ('pending_approval', 'active')
  ORDER BY s.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  UPDATE public.self_order_session_devices
  SET status = 'expired',
      expired_at = now(),
      revoked_reason = 'device_capability_expired',
      pairing_code_hash = NULL,
      pairing_code_salt = NULL,
      pairing_code_expires_at = NULL
  WHERE tenant_id = v_session.tenant_id
    AND session_id = v_session.id
    AND status IN ('origin_pending', 'join_pending', 'approved')
    AND expires_at <= now();

  IF v_session.status = 'pending_approval' AND NOT EXISTS (
    SELECT 1
    FROM public.self_order_session_devices d
    WHERE d.tenant_id = v_session.tenant_id
      AND d.session_id = v_session.id
      AND d.kind = 'origin'
      AND d.status IN ('origin_pending', 'approved')
      AND d.expires_at > now()
  ) THEN
    UPDATE public.self_order_batches
    SET status = 'failed',
        failure_reason = 'origin_device_expired'
    WHERE tenant_id = v_session.tenant_id
      AND session_id = v_session.id
      AND status = 'pending_approval';

    UPDATE public.self_order_sessions
    SET status = 'revoked',
        closed_at = now(),
        close_reason = 'origin_device_expired'
    WHERE id = v_session.id
      AND status = 'pending_approval';

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_session_expired',
      'retry', true
    );
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.tenant_id = v_session.tenant_id
    AND d.session_id = v_session.id
    AND d.device_token_hash = p_device_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_device.status = 'approved' AND v_device.expires_at > now() THEN
      UPDATE public.self_order_session_devices
      SET last_seen_at = now()
      WHERE id = v_device.id;

      RETURN jsonb_build_object(
        'ok', true,
        'access', 'approved',
        'idempotent', true,
        'deviceRequest', jsonb_build_object(
          'deviceId', v_device.id,
          'kind', v_device.kind,
          'status', 'approved',
          'expiresAt', v_device.expires_at
        )
      );
    END IF;

    IF v_device.status NOT IN ('origin_pending', 'join_pending')
       OR v_device.expires_at <= now() THEN
      RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
    END IF;

    IF p_ip_hash IS NULL THEN
      RAISE EXCEPTION 'self_order_trusted_ip_required' USING ERRCODE = '42501';
    END IF;

    PERFORM public.self_order_consume_rate_limits(
      CASE WHEN v_device.kind = 'origin' THEN 'origin' ELSE 'join' END,
      p_token,
      p_ip_hash,
      v_table.tenant_id,
      v_table.id,
      v_session.id,
      p_device_hash
    );
    v_pairing := public.self_order_refresh_pairing_code(v_device.id);

    RETURN jsonb_build_object(
      'ok', true,
      'access', v_device.status,
      'idempotent', true,
      'deviceRequest', v_pairing || jsonb_build_object('kind', v_device.kind)
    );
  END IF;

  IF p_ip_hash IS NULL THEN
    RAISE EXCEPTION 'self_order_trusted_ip_required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.self_order_consume_rate_limits(
    'join',
    p_token,
    p_ip_hash,
    v_table.tenant_id,
    v_table.id,
    v_session.id,
    p_device_hash
  );
  v_pairing := public.self_order_create_pending_device(
    v_session.id,
    p_device_hash,
    'join'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'access', 'join_pending',
    'deviceRequest', v_pairing || jsonb_build_object('kind', 'join')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_refresh_pairing_code_v2(
  p_token text,
  p_device_hash text,
  p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_session public.self_order_sessions%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_pairing jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_device_hash IS NULL
     OR p_device_hash !~ '^[0-9a-f]{64}$'
     OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'self_order_invalid_device_identity' USING ERRCODE = '22023';
  END IF;

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
    AND t.self_order_capability_version = 2
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-table'),
    hashtext(v_table.id::text)
  );

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.token_snapshot = p_token
    AND s.status IN ('pending_approval', 'active')
  ORDER BY s.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.tenant_id = v_session.tenant_id
    AND d.session_id = v_session.id
    AND d.device_token_hash = p_device_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_device.status NOT IN ('origin_pending', 'join_pending')
     OR v_device.expires_at <= now() THEN
    RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
  END IF;

  IF p_ip_hash IS NULL THEN
    RAISE EXCEPTION 'self_order_trusted_ip_required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.self_order_consume_rate_limits(
    CASE WHEN v_device.kind = 'origin' THEN 'origin' ELSE 'join' END,
    p_token,
    p_ip_hash,
    v_table.tenant_id,
    v_table.id,
    v_session.id,
    p_device_hash
  );
  v_pairing := public.self_order_refresh_pairing_code(v_device.id);

  RETURN jsonb_build_object(
    'ok', true,
    'access', v_device.status,
    'deviceRequest', v_pairing || jsonb_build_object('kind', v_device.kind)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_create_payment_request_v2(
  p_token text,
  p_device_hash text,
  p_ip_hash text,
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
  v_session public.self_order_sessions%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_existing record;
  v_request public.self_order_payment_requests%ROWTYPE;
  v_invoice_payload jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_device_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL
     OR p_device_hash IS NULL
     OR p_device_hash !~ '^[0-9a-f]{64}$'
     OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid_self_order_request' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash_call', 'vietqr') THEN
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
    AND t.self_order_capability_version = 2
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  SELECT
    pr.*,
    d.status AS device_status,
    d.expires_at AS device_expires_at,
    s.status AS session_status
  INTO v_existing
  FROM public.self_order_payment_requests pr
  JOIN public.self_order_session_devices d
    ON d.id = pr.session_device_id
   AND d.tenant_id = pr.tenant_id
   AND d.session_id = pr.session_id
  JOIN public.self_order_sessions s
    ON s.id = pr.session_id
   AND s.tenant_id = pr.tenant_id
  WHERE pr.tenant_id = v_table.tenant_id
    AND pr.table_id = v_table.id
    AND pr.client_op_id = p_client_op_id
    AND d.device_token_hash = p_device_hash
    AND s.token_snapshot = p_token
  ORDER BY pr.id DESC
  LIMIT 1
  FOR SHARE OF d;

  IF FOUND THEN
    IF v_existing.request_fingerprint_version = 'payment:v1'
       AND v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'self_order_idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    IF v_existing.device_status IN ('rejected', 'revoked')
       OR NOT (
         (
           v_existing.session_status = 'closed'
           AND v_existing.device_status IN ('approved', 'expired')
         )
         OR (
           v_existing.device_status = 'approved'
           AND v_existing.device_expires_at > now()
         )
       ) THEN
      RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'access', 'approved',
      'idempotent', true
    ) || COALESCE(
      public.self_order_payment_request_public_payload(v_existing.id),
      '{}'::jsonb
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    JOIN public.self_order_session_devices d
      ON d.id = pr.session_device_id
     AND d.tenant_id = pr.tenant_id
     AND d.session_id = pr.session_id
    JOIN public.self_order_sessions s
      ON s.id = pr.session_id
     AND s.tenant_id = pr.tenant_id
    WHERE pr.tenant_id = v_table.tenant_id
      AND pr.table_id = v_table.id
      AND pr.client_op_id = p_client_op_id
      AND s.token_snapshot = p_token
      AND d.device_token_hash <> p_device_hash
  ) THEN
    RAISE EXCEPTION 'self_order_idempotency_device_conflict' USING ERRCODE = '22023';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.token_snapshot = p_token
    AND s.status = 'active'
    AND s.order_id IS NOT NULL
    AND s.approved_by IS NOT NULL
  ORDER BY s.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.tenant_id = v_session.tenant_id
    AND d.session_id = v_session.id
    AND d.device_token_hash = p_device_hash;

  IF NOT FOUND
     OR v_device.status <> 'approved'
     OR v_device.expires_at <= now() THEN
    RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
  END IF;
  v_device_id := v_device.id;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_session.tenant_id
      AND pr.session_id = v_session.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
      AND pr.expires_at > now()
      AND pr.session_device_id IS DISTINCT FROM v_device.id
  ) THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  PERFORM public.self_order_consume_rate_limits(
    'payment',
    p_token,
    p_ip_hash,
    v_table.tenant_id,
    v_table.id,
    v_session.id,
    p_device_hash
  );

  v_result := private.self_order_create_payment_request_v1_base(
    p_token,
    p_client_op_id,
    p_method,
    v_invoice_payload
  );

  BEGIN
    SELECT pr.*
    INTO v_request
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_session.tenant_id
      AND pr.session_id = v_session.id
      AND (
        pr.client_op_id = p_client_op_id
        OR (
          pr.status IN ('cash_call', 'vietqr_pending')
          AND pr.request_fingerprint_version = 'payment:v1'
          AND pr.request_fingerprint = v_fingerprint
        )
      )
    ORDER BY (pr.client_op_id = p_client_op_id) DESC, pr.id DESC
    LIMIT 1
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_payment_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = v_device_id
    AND d.tenant_id = v_session.tenant_id
    AND d.session_id = v_session.id
  FOR UPDATE;

  IF NOT FOUND
     OR v_device.status <> 'approved'
     OR v_device.expires_at <= now() THEN
    RAISE EXCEPTION 'self_order_capability_required' USING ERRCODE = '42501';
  END IF;

  IF v_request.session_device_id IS NULL THEN
    UPDATE public.self_order_payment_requests
    SET session_device_id = v_device.id
    WHERE id = v_request.id
      AND tenant_id = v_request.tenant_id
      AND session_device_id IS NULL;
  ELSIF v_request.session_device_id <> v_device.id THEN
    RAISE EXCEPTION 'self_order_payment_device_conflict' USING ERRCODE = '42501';
  END IF;

  UPDATE public.self_order_session_devices
  SET last_seen_at = now()
  WHERE id = v_device.id;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'access', 'approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_approve_batch_v2(
  p_batch_id bigint,
  p_pairing_code text,
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
  v_ref record;
  v_session public.self_order_sessions%ROWTYPE;
  v_batch public.self_order_batches%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_code text := btrim(COALESCE(p_pairing_code, ''));
  v_code_valid boolean;
  v_next_attempts integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    b.id AS batch_id,
    b.tenant_id,
    b.branch_id,
    b.session_id,
    b.status AS batch_status,
    b.order_id AS batch_order_id,
    b.session_device_id AS device_id,
    s.order_id AS session_order_id,
    d.status AS device_status,
    t.self_order_capability_version
  INTO v_ref
  FROM public.self_order_batches b
  JOIN public.self_order_sessions s
    ON s.id = b.session_id
   AND s.tenant_id = b.tenant_id
  JOIN public.tables t
    ON t.id = b.table_id
   AND t.tenant_id = b.tenant_id
  LEFT JOIN public.self_order_session_devices d
    ON d.id = b.session_device_id
   AND d.tenant_id = b.tenant_id
   AND d.session_id = b.session_id
  WHERE b.id = p_batch_id
    AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;
  IF v_ref.self_order_capability_version <> 2 OR v_ref.device_id IS NULL THEN
    RAISE EXCEPTION 'self_order_pairing_not_available' USING ERRCODE = '22023';
  END IF;

  IF v_ref.batch_status IN ('accepted', 'auto_accepted') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_ref.batch_status,
      'batchId', v_ref.batch_id,
      'deviceId', v_ref.device_id,
      'orderId', v_ref.batch_order_id,
      'idempotent', true
    );
  END IF;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = v_ref.device_id
    AND d.tenant_id = v_ref.tenant_id
    AND d.session_id = v_ref.session_id;

  IF NOT FOUND OR v_device.status NOT IN ('origin_pending', 'join_pending') THEN
    RAISE EXCEPTION 'self_order_device_not_pending' USING ERRCODE = '22023';
  END IF;

  v_code_valid := COALESCE(
    v_code ~ '^[0-9]{6}$'
    AND v_device.pairing_code_expires_at > now()
    AND public.self_order_pairing_code_hash(
      v_code,
      v_device.pairing_code_salt
    ) = v_device.pairing_code_hash,
    false
  );

  IF v_code_valid IS DISTINCT FROM true THEN
    IF v_ref.session_order_id IS NOT NULL THEN
      PERFORM 1
      FROM public.orders o
      WHERE o.id = v_ref.session_order_id
        AND o.tenant_id = v_ref.tenant_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
      END IF;
      IF NOT pg_try_advisory_xact_lock(v_ref.session_order_id) THEN
        RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
      END IF;
    END IF;

    SELECT s.*
    INTO v_session
    FROM public.self_order_sessions s
    WHERE s.id = v_ref.session_id
      AND s.tenant_id = v_ref.tenant_id
    FOR UPDATE;

    SELECT b.*
    INTO v_batch
    FROM public.self_order_batches b
    WHERE b.id = v_ref.batch_id
      AND b.tenant_id = v_ref.tenant_id
      AND b.session_id = v_ref.session_id
    FOR UPDATE;

    SELECT d.*
    INTO v_device
    FROM public.self_order_session_devices d
    WHERE d.id = v_ref.device_id
      AND d.tenant_id = v_ref.tenant_id
      AND d.session_id = v_ref.session_id
    FOR UPDATE;

    IF v_batch.status IN ('accepted', 'auto_accepted') THEN
      RETURN jsonb_build_object(
        'ok', true,
        'status', v_batch.status,
        'batchId', v_batch.id,
        'deviceId', v_device.id,
        'orderId', v_batch.order_id,
        'idempotent', true
      );
    END IF;
    IF v_batch.status <> 'pending_approval'
       OR v_device.status NOT IN ('origin_pending', 'join_pending') THEN
      RAISE EXCEPTION 'self_order_device_not_pending' USING ERRCODE = '22023';
    END IF;

    IF v_device.expires_at <= now() THEN
      UPDATE public.self_order_session_devices
      SET status = 'expired',
          expired_at = now(),
          revoked_reason = 'device_capability_expired',
          pairing_code_hash = NULL,
          pairing_code_salt = NULL,
          pairing_code_expires_at = NULL
      WHERE id = v_device.id;

      UPDATE public.self_order_batches
      SET status = 'rejected',
          rejected_by = v_uid,
          rejected_at = now(),
          failure_reason = 'device_capability_expired'
      WHERE id = v_batch.id
        AND status = 'pending_approval';

      IF v_session.status = 'pending_approval' AND v_device.kind = 'origin' THEN
        UPDATE public.self_order_sessions
        SET status = 'revoked',
            closed_at = now(),
            close_reason = 'device_capability_expired'
        WHERE id = v_session.id
          AND status = 'pending_approval';
      END IF;

      RETURN jsonb_build_object(
        'ok', false,
        'code', 'self_order_capability_expired',
        'batchId', v_batch.id,
        'deviceId', v_device.id
      );
    END IF;

    IF v_device.pairing_code_expires_at <= now() THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'self_order_pairing_code_expired',
        'refreshRequired', true,
        'batchId', v_batch.id,
        'deviceId', v_device.id
      );
    END IF;

    v_code_valid := COALESCE(
      v_code ~ '^[0-9]{6}$'
      AND public.self_order_pairing_code_hash(
        v_code,
        v_device.pairing_code_salt
      ) = v_device.pairing_code_hash,
      false
    );

    IF v_code_valid IS TRUE THEN
      RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
    END IF;

    v_next_attempts := LEAST(v_device.pairing_attempts + 1, 3);
    UPDATE public.self_order_session_devices
    SET pairing_attempts = v_next_attempts,
        status = CASE WHEN v_next_attempts = 3 THEN 'rejected' ELSE status END,
        rejected_by = CASE WHEN v_next_attempts = 3 THEN v_uid ELSE rejected_by END,
        rejected_at = CASE WHEN v_next_attempts = 3 THEN now() ELSE rejected_at END,
        revoked_reason = CASE
          WHEN v_next_attempts = 3 THEN 'pairing_attempts_exhausted'
          ELSE revoked_reason
        END,
        pairing_code_hash = CASE
          WHEN v_next_attempts = 3 THEN NULL ELSE pairing_code_hash
        END,
        pairing_code_salt = CASE
          WHEN v_next_attempts = 3 THEN NULL ELSE pairing_code_salt
        END,
        pairing_code_expires_at = CASE
          WHEN v_next_attempts = 3 THEN NULL ELSE pairing_code_expires_at
        END
    WHERE id = v_device.id;

    IF v_next_attempts = 3 THEN
      UPDATE public.self_order_batches
      SET status = 'rejected',
          rejected_by = v_uid,
          rejected_at = now(),
          failure_reason = 'pairing_attempts_exhausted'
      WHERE id = v_batch.id
        AND status = 'pending_approval';

      IF v_session.status = 'pending_approval' AND v_device.kind = 'origin' THEN
        UPDATE public.self_order_sessions
        SET status = 'revoked',
            closed_at = now(),
            close_reason = 'pairing_attempts_exhausted'
        WHERE id = v_session.id
          AND status = 'pending_approval';
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_pairing_code_invalid',
      'batchId', v_batch.id,
      'deviceId', v_device.id,
      'attemptsRemaining', 3 - v_next_attempts
    );
  END IF;

  v_result := private.self_order_approve_batch_v1_base(
    p_batch_id,
    p_target_order_id,
    p_pos_session_id,
    p_idempotency_key
  );

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_ref.session_id
    AND s.tenant_id = v_ref.tenant_id
  FOR UPDATE;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = v_ref.device_id
    AND d.tenant_id = v_ref.tenant_id
    AND d.session_id = v_ref.session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_device_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_device.status = 'approved' THEN
    RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'batchId', p_batch_id,
      'deviceId', v_device.id,
      'idempotent', true
    );
  END IF;
  IF v_device.kind = 'join' AND (
    SELECT count(*)
    FROM public.self_order_session_devices d
    WHERE d.tenant_id = v_session.tenant_id
      AND d.session_id = v_session.id
      AND d.status = 'approved'
      AND d.expires_at > now()
  ) >= 4 THEN
    RAISE EXCEPTION 'self_order_approved_device_limit_reached' USING ERRCODE = '54000';
  END IF;
  IF v_device.status NOT IN ('origin_pending', 'join_pending')
     OR v_device.expires_at <= now()
     OR v_device.pairing_code_expires_at <= now()
     OR v_code !~ '^[0-9]{6}$'
     OR public.self_order_pairing_code_hash(
       v_code,
       v_device.pairing_code_salt
     ) IS DISTINCT FROM v_device.pairing_code_hash THEN
    RAISE EXCEPTION 'self_order_pairing_changed' USING ERRCODE = '40001';
  END IF;

  UPDATE public.self_order_session_devices
  SET status = 'approved',
      approved_by = v_uid,
      approved_at = now(),
      expires_at = now() + interval '12 hours',
      last_seen_at = now(),
      pairing_code_hash = NULL,
      pairing_code_salt = NULL,
      pairing_code_expires_at = NULL
  WHERE id = v_device.id
    AND status IN ('origin_pending', 'join_pending');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'batchId', p_batch_id,
    'deviceId', v_device.id,
    'access', 'approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_approve_device_join_v2(
  p_device_id bigint,
  p_pairing_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_ref record;
  v_session public.self_order_sessions%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_code text := btrim(COALESCE(p_pairing_code, ''));
  v_next_attempts integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    d.id AS device_id,
    d.tenant_id,
    d.branch_id,
    d.table_id,
    d.session_id,
    d.status AS device_status,
    d.expires_at,
    d.request_batch_id,
    s.order_id,
    t.self_order_capability_version
  INTO v_ref
  FROM public.self_order_session_devices d
  JOIN public.self_order_sessions s
    ON s.id = d.session_id
   AND s.tenant_id = d.tenant_id
  JOIN public.tables t
    ON t.id = d.table_id
   AND t.tenant_id = d.tenant_id
  WHERE d.id = p_device_id
    AND d.tenant_id = v_tenant
    AND d.kind = 'join';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_device_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;
  IF v_ref.self_order_capability_version <> 2 THEN
    RAISE EXCEPTION 'self_order_pairing_not_available' USING ERRCODE = '22023';
  END IF;
  IF v_ref.device_status = 'approved' AND v_ref.expires_at > now() THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'approved',
      'deviceId', v_ref.device_id,
      'idempotent', true
    );
  END IF;
  IF v_ref.request_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_batch_approval_required' USING ERRCODE = '22023';
  END IF;
  IF v_ref.order_id IS NULL THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_ref.order_id
    AND o.tenant_id = v_ref.tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
  END IF;
  IF v_order.branch_id <> v_ref.branch_id
     OR v_order.table_id IS DISTINCT FROM v_ref.table_id
     OR v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_ref.order_id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_ref.session_id
    AND s.tenant_id = v_ref.tenant_id
  FOR UPDATE;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = v_ref.device_id
    AND d.tenant_id = v_ref.tenant_id
    AND d.session_id = v_ref.session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_device_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_device.status = 'approved' AND v_device.expires_at > now() THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'approved',
      'deviceId', v_device.id,
      'idempotent', true
    );
  END IF;
  IF v_session.status <> 'active'
     OR v_session.order_id IS DISTINCT FROM v_ref.order_id
     OR v_session.approved_by IS NULL
     OR v_device.status <> 'join_pending'
     OR v_device.request_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_device_not_pending' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.self_order_session_devices d
    WHERE d.tenant_id = v_session.tenant_id
      AND d.session_id = v_session.id
      AND d.status = 'approved'
      AND d.expires_at > now()
  ) >= 4 THEN
    RAISE EXCEPTION 'self_order_approved_device_limit_reached' USING ERRCODE = '54000';
  END IF;

  IF v_device.expires_at <= now() THEN
    UPDATE public.self_order_session_devices
    SET status = 'expired',
        expired_at = now(),
        revoked_reason = 'device_capability_expired',
        pairing_code_hash = NULL,
        pairing_code_salt = NULL,
        pairing_code_expires_at = NULL
    WHERE id = v_device.id;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_capability_expired',
      'deviceId', v_device.id
    );
  END IF;

  IF v_device.pairing_code_expires_at <= now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_pairing_code_expired',
      'refreshRequired', true,
      'deviceId', v_device.id
    );
  END IF;

  IF v_code !~ '^[0-9]{6}$'
     OR public.self_order_pairing_code_hash(
       v_code,
       v_device.pairing_code_salt
     ) IS DISTINCT FROM v_device.pairing_code_hash THEN
    v_next_attempts := LEAST(v_device.pairing_attempts + 1, 3);
    UPDATE public.self_order_session_devices
    SET pairing_attempts = v_next_attempts,
        status = CASE WHEN v_next_attempts = 3 THEN 'rejected' ELSE status END,
        rejected_by = CASE WHEN v_next_attempts = 3 THEN v_uid ELSE rejected_by END,
        rejected_at = CASE WHEN v_next_attempts = 3 THEN now() ELSE rejected_at END,
        revoked_reason = CASE
          WHEN v_next_attempts = 3 THEN 'pairing_attempts_exhausted'
          ELSE revoked_reason
        END,
        pairing_code_hash = CASE
          WHEN v_next_attempts = 3 THEN NULL ELSE pairing_code_hash
        END,
        pairing_code_salt = CASE
          WHEN v_next_attempts = 3 THEN NULL ELSE pairing_code_salt
        END,
        pairing_code_expires_at = CASE
          WHEN v_next_attempts = 3 THEN NULL ELSE pairing_code_expires_at
        END
    WHERE id = v_device.id;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'self_order_pairing_code_invalid',
      'deviceId', v_device.id,
      'attemptsRemaining', 3 - v_next_attempts
    );
  END IF;

  UPDATE public.self_order_session_devices
  SET status = 'approved',
      approved_by = v_uid,
      approved_at = now(),
      expires_at = now() + interval '12 hours',
      last_seen_at = now(),
      pairing_code_hash = NULL,
      pairing_code_salt = NULL,
      pairing_code_expires_at = NULL
  WHERE id = v_device.id
    AND status = 'join_pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'deviceId', v_device.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_reject_batch_v2(
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
  v_ref record;
  v_session public.self_order_sessions%ROWTYPE;
  v_batch public.self_order_batches%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'self_order_reason_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT
    b.id AS batch_id,
    b.tenant_id,
    b.branch_id,
    b.session_id,
    b.session_device_id AS device_id,
    b.status AS batch_status,
    s.order_id,
    t.self_order_capability_version
  INTO v_ref
  FROM public.self_order_batches b
  JOIN public.self_order_sessions s
    ON s.id = b.session_id
   AND s.tenant_id = b.tenant_id
  JOIN public.tables t
    ON t.id = b.table_id
   AND t.tenant_id = b.tenant_id
  WHERE b.id = p_batch_id
    AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;
  IF v_ref.self_order_capability_version <> 2 OR v_ref.device_id IS NULL THEN
    RAISE EXCEPTION 'self_order_pairing_not_available' USING ERRCODE = '22023';
  END IF;
  IF v_ref.batch_status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'rejected',
      'batchId', v_ref.batch_id,
      'deviceId', v_ref.device_id,
      'idempotent', true
    );
  END IF;

  IF v_ref.order_id IS NOT NULL THEN
    PERFORM 1
    FROM public.orders o
    WHERE o.id = v_ref.order_id
      AND o.tenant_id = v_ref.tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
    END IF;
    IF NOT pg_try_advisory_xact_lock(v_ref.order_id) THEN
      RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
    END IF;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_ref.session_id
    AND s.tenant_id = v_ref.tenant_id
  FOR UPDATE;

  SELECT b.*
  INTO v_batch
  FROM public.self_order_batches b
  WHERE b.id = v_ref.batch_id
    AND b.tenant_id = v_ref.tenant_id
    AND b.session_id = v_ref.session_id
  FOR UPDATE;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = v_ref.device_id
    AND d.tenant_id = v_ref.tenant_id
    AND d.session_id = v_ref.session_id
  FOR UPDATE;

  IF v_batch.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'rejected',
      'batchId', v_batch.id,
      'deviceId', v_device.id,
      'idempotent', true
    );
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
    AND status = 'pending_approval';

  IF v_device.status IN ('origin_pending', 'join_pending') THEN
    UPDATE public.self_order_session_devices
    SET status = 'rejected',
        rejected_by = v_uid,
        rejected_at = now(),
        revoked_reason = COALESCE(v_reason, 'staff_rejected'),
        pairing_code_hash = NULL,
        pairing_code_salt = NULL,
        pairing_code_expires_at = NULL
    WHERE id = v_device.id
      AND status IN ('origin_pending', 'join_pending');
  END IF;

  IF v_session.status = 'pending_approval' AND v_device.kind = 'origin' THEN
    UPDATE public.self_order_batches
    SET status = 'rejected',
        rejected_by = v_uid,
        rejected_at = now(),
        failure_reason = COALESCE(v_reason, 'initial_session_rejected')
    WHERE tenant_id = v_session.tenant_id
      AND session_id = v_session.id
      AND status = 'pending_approval';

    UPDATE public.self_order_sessions
    SET status = 'revoked',
        closed_at = now(),
        close_reason = COALESCE(v_reason, 'staff_rejected')
    WHERE id = v_session.id
      AND status = 'pending_approval';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'rejected',
    'batchId', v_batch.id,
    'deviceId', v_device.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_reject_device_join_v2(
  p_device_id bigint,
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
  v_ref record;
  v_session public.self_order_sessions%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'self_order_reason_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT
    d.id AS device_id,
    d.tenant_id,
    d.branch_id,
    d.session_id,
    d.status AS device_status,
    s.order_id,
    t.self_order_capability_version
  INTO v_ref
  FROM public.self_order_session_devices d
  JOIN public.self_order_sessions s
    ON s.id = d.session_id
   AND s.tenant_id = d.tenant_id
  JOIN public.tables t
    ON t.id = d.table_id
   AND t.tenant_id = d.tenant_id
  WHERE d.id = p_device_id
    AND d.tenant_id = v_tenant
    AND d.kind = 'join';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_device_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;
  IF v_ref.self_order_capability_version <> 2 THEN
    RAISE EXCEPTION 'self_order_pairing_not_available' USING ERRCODE = '22023';
  END IF;
  IF v_ref.device_status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'rejected',
      'deviceId', v_ref.device_id,
      'idempotent', true
    );
  END IF;

  IF v_ref.order_id IS NOT NULL THEN
    PERFORM 1
    FROM public.orders o
    WHERE o.id = v_ref.order_id
      AND o.tenant_id = v_ref.tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
    END IF;
    IF NOT pg_try_advisory_xact_lock(v_ref.order_id) THEN
      RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
    END IF;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_ref.session_id
    AND s.tenant_id = v_ref.tenant_id
  FOR UPDATE;

  PERFORM 1
  FROM public.self_order_batches b
  WHERE b.tenant_id = v_ref.tenant_id
    AND b.session_id = v_ref.session_id
    AND b.session_device_id = v_ref.device_id
    AND b.status = 'pending_approval'
  FOR UPDATE;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = v_ref.device_id
    AND d.tenant_id = v_ref.tenant_id
    AND d.session_id = v_ref.session_id
  FOR UPDATE;

  IF v_device.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'rejected',
      'deviceId', v_device.id,
      'idempotent', true
    );
  END IF;
  IF v_device.status <> 'join_pending' THEN
    RAISE EXCEPTION 'self_order_device_not_pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.self_order_session_devices
  SET status = 'rejected',
      rejected_by = v_uid,
      rejected_at = now(),
      revoked_reason = COALESCE(v_reason, 'staff_rejected'),
      pairing_code_hash = NULL,
      pairing_code_salt = NULL,
      pairing_code_expires_at = NULL
  WHERE id = v_device.id
    AND status = 'join_pending';

  UPDATE public.self_order_batches
  SET status = 'rejected',
      rejected_by = v_uid,
      rejected_at = now(),
      failure_reason = COALESCE(v_reason, 'staff_rejected')
  WHERE tenant_id = v_device.tenant_id
    AND session_id = v_device.session_id
    AND session_device_id = v_device.id
    AND status = 'pending_approval';

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'rejected',
    'deviceId', v_device.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_revoke_session_device_v2(
  p_device_id bigint,
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
  v_ref record;
  v_session public.self_order_sessions%ROWTYPE;
  v_device public.self_order_session_devices%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'self_order_reason_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT
    d.id AS device_id,
    d.tenant_id,
    d.branch_id,
    d.session_id,
    d.status AS device_status,
    s.order_id,
    t.self_order_capability_version
  INTO v_ref
  FROM public.self_order_session_devices d
  JOIN public.self_order_sessions s
    ON s.id = d.session_id
   AND s.tenant_id = d.tenant_id
  JOIN public.tables t
    ON t.id = d.table_id
   AND t.tenant_id = d.tenant_id
  WHERE d.id = p_device_id
    AND d.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_device_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_ref.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;
  IF v_ref.self_order_capability_version <> 2 THEN
    RAISE EXCEPTION 'self_order_pairing_not_available' USING ERRCODE = '22023';
  END IF;
  IF v_ref.device_status = 'revoked' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'revoked',
      'deviceId', v_ref.device_id,
      'idempotent', true
    );
  END IF;
  IF v_ref.order_id IS NULL THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.orders o
  WHERE o.id = v_ref.order_id
    AND o.tenant_id = v_ref.tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_ref.order_id) THEN
    RAISE EXCEPTION 'self_order_retry' USING ERRCODE = '40001';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_ref.session_id
    AND s.tenant_id = v_ref.tenant_id
  FOR UPDATE;

  SELECT d.*
  INTO v_device
  FROM public.self_order_session_devices d
  WHERE d.id = v_ref.device_id
    AND d.tenant_id = v_ref.tenant_id
    AND d.session_id = v_ref.session_id
  FOR UPDATE;

  IF v_device.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'revoked',
      'deviceId', v_device.id,
      'idempotent', true
    );
  END IF;
  IF v_session.status <> 'active'
     OR v_session.order_id IS DISTINCT FROM v_ref.order_id
     OR v_device.status <> 'approved' THEN
    RAISE EXCEPTION 'self_order_device_not_approved' USING ERRCODE = '22023';
  END IF;

  UPDATE public.self_order_session_devices
  SET status = 'revoked',
      revoked_by = v_uid,
      revoked_at = now(),
      revoked_reason = COALESCE(v_reason, 'staff_revoked')
  WHERE id = v_device.id
    AND status = 'approved';

  UPDATE public.self_order_sessions
  SET realtime_topic_token = public.self_order_random_token(24)
  WHERE id = v_session.id
    AND tenant_id = v_session.tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'revoked',
    'deviceId', v_device.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_terminalize_session_devices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.status IN ('pending_approval', 'active')
     AND NEW.status IN ('closed', 'revoked') THEN
    UPDATE public.self_order_batches
    SET status = 'failed',
        failure_reason = COALESCE(NEW.close_reason, 'session_terminal')
    WHERE tenant_id = NEW.tenant_id
      AND session_id = NEW.id
      AND status = 'pending_approval';

    UPDATE public.self_order_session_devices
    SET status = CASE
          WHEN NEW.status = 'revoked' THEN 'revoked'
          ELSE 'expired'
        END,
        revoked_at = CASE WHEN NEW.status = 'revoked' THEN now() ELSE revoked_at END,
        expired_at = CASE WHEN NEW.status = 'closed' THEN now() ELSE expired_at END,
        revoked_reason = COALESCE(NEW.close_reason, 'session_terminal'),
        pairing_code_hash = NULL,
        pairing_code_salt = NULL,
        pairing_code_expires_at = NULL
    WHERE tenant_id = NEW.tenant_id
      AND session_id = NEW.id
      AND status IN ('origin_pending', 'join_pending', 'approved');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_terminalize_session_devices
  ON public.self_order_sessions;
CREATE TRIGGER trg_self_order_terminalize_session_devices
  AFTER UPDATE OF status ON public.self_order_sessions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.self_order_terminalize_session_devices();

CREATE OR REPLACE FUNCTION public.self_order_close_session_on_order_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.table_id IS NOT DISTINCT FROM NEW.table_id THEN
    RETURN NULL;
  END IF;

  UPDATE public.self_order_sessions s
  SET status = 'closed',
      closed_at = COALESCE(s.closed_at, now()),
      close_reason = COALESCE(s.close_reason, 'order_table_transferred')
  WHERE s.tenant_id = NEW.tenant_id
    AND s.order_id = NEW.id
    AND s.status = 'active'
    AND s.table_id IS DISTINCT FROM NEW.table_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_close_session_on_order_transfer
  ON public.orders;
CREATE TRIGGER trg_self_order_close_session_on_order_transfer
  AFTER UPDATE OF table_id ON public.orders
  FOR EACH ROW
  WHEN (OLD.table_id IS DISTINCT FROM NEW.table_id)
  EXECUTE FUNCTION public.self_order_close_session_on_order_transfer();

UPDATE public.self_order_sessions s
SET status = 'closed',
    closed_at = COALESCE(s.closed_at, now()),
    close_reason = COALESCE(s.close_reason, 'order_table_transferred')
FROM public.orders o
WHERE o.id = s.order_id
  AND o.tenant_id = s.tenant_id
  AND s.status = 'active'
  AND s.table_id IS DISTINCT FROM o.table_id;

CREATE OR REPLACE FUNCTION public.self_order_list_staff_queue_v2(
  p_branch_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_payload jsonb;
  v_pending_batches jsonb;
  v_device_requests jsonb;
  v_approved_devices jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL OR NOT public.has_permission(p_branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  v_payload := public.self_order_list_staff_queue(p_branch_id);

  SELECT COALESCE(jsonb_agg(
    (
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
        'approvalMode', CASE
          WHEN s.order_id IS NULL THEN 'create'
          ELSE 'append'
        END
      ))
      || jsonb_build_object(
        'capabilityVersion', t.self_order_capability_version,
        'sessionDeviceId', b.session_device_id
      )
    )
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
      'deviceId', d.id,
      'sessionId', d.session_id,
      'tableId', d.table_id,
      'tableNumber', t.number,
      'kind', d.kind,
      'status', d.status,
      'batchId', d.request_batch_id,
      'createdAt', d.created_at,
      'pairingExpiresAt', d.pairing_code_expires_at,
      'expiresAt', d.expires_at
    ))
    ORDER BY d.created_at
  ), '[]'::jsonb)
  INTO v_device_requests
  FROM public.self_order_session_devices d
  JOIN public.tables t
    ON t.id = d.table_id
   AND t.tenant_id = d.tenant_id
   AND t.self_order_capability_version = 2
  JOIN public.self_order_sessions s
    ON s.id = d.session_id
   AND s.tenant_id = d.tenant_id
   AND s.status IN ('pending_approval', 'active')
  WHERE d.tenant_id = v_tenant
    AND d.branch_id = p_branch_id
    AND d.status IN ('origin_pending', 'join_pending')
    AND d.expires_at > now();

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'deviceId', d.id,
      'sessionId', d.session_id,
      'tableId', d.table_id,
      'tableNumber', t.number,
      'kind', d.kind,
      'status', 'approved',
      'approvedAt', d.approved_at,
      'expiresAt', d.expires_at,
      'lastSeenAt', d.last_seen_at
    )
    ORDER BY d.approved_at, d.id
  ), '[]'::jsonb)
  INTO v_approved_devices
  FROM public.self_order_session_devices d
  JOIN public.tables t
    ON t.id = d.table_id
   AND t.tenant_id = d.tenant_id
   AND t.self_order_capability_version = 2
  JOIN public.self_order_sessions s
    ON s.id = d.session_id
   AND s.tenant_id = d.tenant_id
   AND s.status = 'active'
  WHERE d.tenant_id = v_tenant
    AND d.branch_id = p_branch_id
    AND d.status = 'approved'
    AND d.expires_at > now();

  v_payload := jsonb_set(
    v_payload,
    ARRAY['pendingBatches'],
    v_pending_batches,
    true
  );

  v_payload := jsonb_set(
    v_payload,
    ARRAY['deviceRequests'],
    v_device_requests,
    true
  );

  RETURN jsonb_set(
    v_payload,
    ARRAY['approvedDevices'],
    v_approved_devices,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_broadcast_session_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row jsonb;
  v_session_id bigint;
  v_version smallint;
  v_token text;
  v_topic_token text;
  v_topic text;
  v_payload jsonb;
BEGIN
  v_row := to_jsonb(NEW);
  v_session_id := COALESCE(
    NULLIF(v_row ->> 'session_id', '')::bigint,
    NULLIF(v_row ->> 'id', '')::bigint
  );

  SELECT
    t.self_order_capability_version,
    t.self_order_token,
    s.realtime_topic_token
  INTO v_version, v_token, v_topic_token
  FROM public.self_order_sessions s
  JOIN public.tables t
    ON t.id = s.table_id
   AND t.tenant_id = s.tenant_id
  WHERE s.id = v_session_id
  LIMIT 1;

  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_version = 2 THEN
    v_topic := 'self-order:seat:' || v_topic_token;
    v_payload := jsonb_build_object('changedAt', now());
  ELSE
    v_topic := 'self-order:' || v_token;
    v_payload := jsonb_build_object(
      'sessionId', v_session_id,
      'changedAt', now()
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'realtime'
      AND p.proname = 'send'
  ) THEN
    BEGIN
      PERFORM realtime.send(
        v_payload,
        'session_changed',
        v_topic,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[self_order_broadcast_session_changed] broadcast skipped: %', SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_sessions_broadcast
  ON public.self_order_sessions;
DROP TRIGGER IF EXISTS trg_self_order_batches_broadcast
  ON public.self_order_batches;
DROP TRIGGER IF EXISTS trg_self_order_payment_requests_broadcast
  ON public.self_order_payment_requests;
DROP TRIGGER IF EXISTS trg_self_order_session_devices_broadcast
  ON public.self_order_session_devices;

CREATE TRIGGER trg_self_order_sessions_broadcast
  AFTER INSERT OR UPDATE ON public.self_order_sessions
  FOR EACH ROW EXECUTE FUNCTION public.self_order_broadcast_session_changed();
CREATE TRIGGER trg_self_order_batches_broadcast
  AFTER INSERT OR UPDATE ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.self_order_broadcast_session_changed();
CREATE TRIGGER trg_self_order_payment_requests_broadcast
  AFTER INSERT OR UPDATE ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_broadcast_session_changed();
CREATE TRIGGER trg_self_order_session_devices_broadcast
  AFTER INSERT OR UPDATE ON public.self_order_session_devices
  FOR EACH ROW EXECUTE FUNCTION public.self_order_broadcast_session_changed();

REVOKE ALL ON TABLE public.self_order_session_devices
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.self_order_rate_buckets
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.self_order_session_devices TO service_role;
GRANT ALL ON TABLE public.self_order_rate_buckets TO service_role;

REVOKE ALL ON SEQUENCE public.self_order_session_devices_id_seq
  FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.self_order_session_devices_id_seq
  TO service_role;

REVOKE ALL ON FUNCTION private.self_order_get_snapshot_v1_base(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.self_order_submit_batch_v1_base(text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.self_order_create_payment_request_v1_base(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.self_order_approve_batch_v1_base(bigint, bigint, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.self_order_reject_batch_v1_base(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.self_order_random_token(integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_fill_realtime_topic_token()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_pairing_code_hash(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_new_pairing_code()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_enforce_session_device_invariants()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_enforce_batch_device_binding()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_enforce_payment_device_binding()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_scope_hash(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_take_rate_bucket(text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_consume_rate_limits(text, text, text, bigint, bigint, bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_create_pending_device(bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_refresh_pairing_code(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_guard_capability_version_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_terminalize_session_devices()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_close_session_on_order_transfer()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_broadcast_session_changed()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_reject_batch(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.self_order_get_public_context_v2(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_get_snapshot_v2(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_submit_batch_v2(text, text, text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_request_device_join_v2(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_refresh_pairing_code_v2(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_create_payment_request_v2(text, text, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_table_self_order_capability_version(bigint, smallint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_approve_batch_v2(bigint, text, bigint, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_approve_device_join_v2(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_reject_batch_v2(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_reject_device_join_v2(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_revoke_session_device_v2(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_list_staff_queue_v2(bigint)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.self_order_get_snapshot(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_reject_batch(bigint, text)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.self_order_get_public_context_v2(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_get_snapshot_v2(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_submit_batch_v2(text, text, text, uuid, jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_request_device_join_v2(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_refresh_pairing_code_v2(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_create_payment_request_v2(text, text, text, uuid, text, jsonb)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.set_table_self_order_capability_version(bigint, smallint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_approve_batch_v2(bigint, text, bigint, bigint, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_approve_device_join_v2(bigint, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_reject_batch_v2(bigint, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_reject_device_join_v2(bigint, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_revoke_session_device_v2(bigint, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.self_order_list_staff_queue_v2(bigint)
  TO authenticated, service_role;
