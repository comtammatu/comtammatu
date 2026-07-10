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
    CHECK (purpose IN ('batch', 'payment')),
  CONSTRAINT self_order_rate_buckets_scope_type_check
    CHECK (scope_type IN ('token', 'ip')),
  CONSTRAINT self_order_rate_buckets_scope_hash_format
    CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT self_order_rate_buckets_hits_check CHECK (hits > 0),
  CONSTRAINT self_order_rate_buckets_expiry_check CHECK (expires_at > window_start)
);

DELETE FROM public.self_order_rate_buckets
WHERE purpose NOT IN ('batch', 'payment')
   OR scope_type NOT IN ('token', 'ip');

ALTER TABLE public.self_order_rate_buckets
  DROP CONSTRAINT IF EXISTS self_order_rate_buckets_purpose_check,
  DROP CONSTRAINT IF EXISTS self_order_rate_buckets_scope_type_check;
ALTER TABLE public.self_order_rate_buckets
  ADD CONSTRAINT self_order_rate_buckets_purpose_check
    CHECK (purpose IN ('batch', 'payment')),
  ADD CONSTRAINT self_order_rate_buckets_scope_type_check
    CHECK (scope_type IN ('token', 'ip'));

CREATE INDEX IF NOT EXISTS idx_self_order_rate_buckets_expiry
  ON public.self_order_rate_buckets (expires_at);

ALTER TABLE public.self_order_rate_buckets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_self_order_rate_buckets_updated_at
  ON public.self_order_rate_buckets;
CREATE TRIGGER trg_self_order_rate_buckets_updated_at
  BEFORE UPDATE ON public.self_order_rate_buckets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

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
  IF p_purpose NOT IN ('batch', 'payment')
     OR p_scope_type NOT IN ('token', 'ip')
     OR p_scope_hash IS NULL
     OR p_scope_hash !~ '^[0-9a-f]{64}$'
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
  p_table_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_token_hash text;
  v_ip_scope_hash text;
  v_token_limit integer;
  v_ip_limit integer;
  v_window_seconds integer := 600;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_purpose NOT IN ('batch', 'payment')
     OR p_token IS NULL
     OR p_token = ''
     OR p_tenant_id IS NULL
     OR p_table_id IS NULL
     OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'self_order_invalid_rate_identity' USING ERRCODE = '22023';
  END IF;

  IF p_purpose = 'batch' THEN
    v_token_limit := 20;
    v_ip_limit := 30;
  ELSE
    v_token_limit := 10;
    v_ip_limit := 15;
  END IF;

  v_token_hash := public.self_order_scope_hash(
    p_tenant_id::text || ':' || p_table_id::text || ':' || p_token
  );
  v_ip_scope_hash := CASE
    WHEN p_ip_hash IS NULL THEN NULL
    ELSE public.self_order_scope_hash(v_token_hash || ':' || p_ip_hash)
  END;

  PERFORM public.self_order_take_rate_bucket(
    p_purpose,
    'token',
    v_token_hash,
    v_token_limit,
    v_window_seconds
  );
  IF v_ip_scope_hash IS NOT NULL THEN
    PERFORM public.self_order_take_rate_bucket(
      p_purpose,
      'ip',
      v_ip_scope_hash,
      v_ip_limit,
      v_window_seconds
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'windowSeconds', v_window_seconds);
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.self_order_rate_buckets
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_scope_hash(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_take_rate_bucket(text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.self_order_consume_rate_limits(text, text, text, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_consume_rate_limits(text, text, text, bigint, bigint)
  TO service_role;
