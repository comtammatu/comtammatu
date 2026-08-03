-- QR Feedback Wave 1: QR codes, submissions, rate buckets, RPC, RLS, ACL.
-- No phone, photos, Telegram, AI, or reports.

-- ─── Supporting uniqueness for composite FKs ───────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_id_tenant_unique'
      AND conrelid = 'public.branches'::regclass
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_id_tenant_unique UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tables_id_tenant_branch_unique'
      AND conrelid = 'public.tables'::regclass
  ) THEN
    ALTER TABLE public.tables
      ADD CONSTRAINT tables_id_tenant_branch_unique UNIQUE (id, tenant_id, branch_id);
  END IF;
END $$;

-- ─── feedback_qr_codes ─────────────────────────────────────────────────────

CREATE TABLE public.feedback_qr_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL,
  table_id BIGINT NULL,
  token TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ NULL,
  CONSTRAINT feedback_qr_codes_token_chk CHECK (token ~ '^[A-Za-z0-9_-]{14}$'),
  CONSTRAINT feedback_qr_codes_label_chk CHECK (char_length(label) BETWEEN 1 AND 200),
  CONSTRAINT feedback_qr_codes_branch_tenant_fkey
    FOREIGN KEY (branch_id, tenant_id)
    REFERENCES public.branches (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT feedback_qr_codes_table_scope_fkey
    FOREIGN KEY (table_id, tenant_id, branch_id)
    REFERENCES public.tables (id, tenant_id, branch_id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX uidx_feedback_qr_codes_token
  ON public.feedback_qr_codes (token);

CREATE UNIQUE INDEX uidx_feedback_qr_codes_one_active_table
  ON public.feedback_qr_codes (tenant_id, branch_id, table_id)
  WHERE is_active AND table_id IS NOT NULL;

CREATE INDEX idx_feedback_qr_codes_tenant_branch_active
  ON public.feedback_qr_codes (tenant_id, branch_id, is_active);

CREATE TRIGGER trg_feedback_qr_codes_updated_at
  BEFORE UPDATE ON public.feedback_qr_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.feedback_qr_codes IS
  'QR tokens for customer feedback. table_id NULL = branch-wide QR.';

-- ─── feedbacks ─────────────────────────────────────────────────────────────

CREATE TABLE public.feedbacks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL,
  qr_code_id BIGINT NOT NULL REFERENCES public.feedback_qr_codes (id),
  client_submission_id UUID NOT NULL,
  rating SMALLINT NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedbacks_rating_chk CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT feedbacks_comment_chk CHECK (
    comment IS NULL OR char_length(comment) BETWEEN 1 AND 2000
  ),
  CONSTRAINT feedbacks_branch_tenant_fkey
    FOREIGN KEY (branch_id, tenant_id)
    REFERENCES public.branches (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT feedbacks_client_submission_unique
    UNIQUE (qr_code_id, client_submission_id)
);

CREATE INDEX idx_feedbacks_tenant_branch_created
  ON public.feedbacks (tenant_id, branch_id, created_at DESC);

COMMENT ON TABLE public.feedbacks IS
  'Customer feedback submissions. INSERT is RPC-only via submit_feedback().';

-- ─── feedback_rate_buckets ─────────────────────────────────────────────────

CREATE TABLE public.feedback_rate_buckets (
  scope_type TEXT NOT NULL,
  scope_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_rate_buckets_pkey
    PRIMARY KEY (scope_type, scope_hash, window_start),
  CONSTRAINT feedback_rate_buckets_scope_type_chk
    CHECK (scope_type = ANY (ARRAY['token'::text, 'token_ip'::text])),
  CONSTRAINT feedback_rate_buckets_scope_hash_chk
    CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT feedback_rate_buckets_hits_chk CHECK (hits > 0),
  CONSTRAINT feedback_rate_buckets_expiry_chk CHECK (expires_at > window_start)
);

CREATE INDEX idx_feedback_rate_buckets_expiry
  ON public.feedback_rate_buckets (expires_at);

CREATE TRIGGER trg_feedback_rate_buckets_updated_at
  BEFORE UPDATE ON public.feedback_rate_buckets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ─── rate helper ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.feedback_take_rate_bucket(
  p_scope_type TEXT,
  p_scope_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_hits INTEGER;
  v_retry_after_seconds INTEGER;
BEGIN
  IF p_scope_type NOT IN ('token', 'token_ip')
     OR p_scope_hash IS NULL
     OR p_scope_hash !~ '^[0-9a-f]{64}$'
     OR p_limit < 1
     OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'feedback_invalid_rate_limit_input' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  DELETE FROM public.feedback_rate_buckets r
  WHERE r.ctid IN (
    SELECT stale.ctid
    FROM public.feedback_rate_buckets stale
    WHERE stale.expires_at <= now()
    ORDER BY stale.expires_at
    LIMIT 100
  );

  INSERT INTO public.feedback_rate_buckets (
    scope_type, scope_hash, window_start, hits, expires_at
  )
  VALUES (
    p_scope_type,
    p_scope_hash,
    v_window_start,
    1,
    v_window_start + make_interval(secs => p_window_seconds * 2)
  )
  ON CONFLICT (scope_type, scope_hash, window_start)
  DO UPDATE SET hits = public.feedback_rate_buckets.hits + 1
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
    RAISE EXCEPTION 'feedback_rate_limited'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'retryAfterSeconds', v_retry_after_seconds
            )::text;
  END IF;

  RETURN v_hits;
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_take_rate_bucket(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.feedback_take_rate_bucket(TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_take_rate_bucket(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- ─── submit_feedback RPC ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_token TEXT,
  p_client_submission_id UUID,
  p_rating SMALLINT,
  p_comment TEXT,
  p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_qr public.feedback_qr_codes%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_comment TEXT;
  v_token_hash TEXT;
  v_token_ip_hash TEXT;
  v_existing_id BIGINT;
  v_feedback_id BIGINT;
  v_window_seconds INTEGER := 1800;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{14}$' THEN
    RAISE EXCEPTION 'feedback_token_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_client_submission_id IS NULL THEN
    RAISE EXCEPTION 'feedback_client_submission_required' USING ERRCODE = '22023';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'feedback_rating_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'feedback_ip_hash_invalid' USING ERRCODE = '22023';
  END IF;

  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');
  IF v_comment IS NOT NULL AND char_length(v_comment) > 2000 THEN
    RAISE EXCEPTION 'feedback_comment_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_qr
  FROM public.feedback_qr_codes q
  WHERE q.token = p_token
  FOR UPDATE;

  IF NOT FOUND OR NOT v_qr.is_active THEN
    RAISE EXCEPTION 'feedback_token_invalid' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_branch
  FROM public.branches b
  WHERE b.id = v_qr.branch_id
    AND b.tenant_id = v_qr.tenant_id
  FOR SHARE;

  IF NOT FOUND
     OR NOT COALESCE(v_branch.is_active, false)
     OR v_branch.branch_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'feedback_branch_inactive' USING ERRCODE = 'P0002';
  END IF;

  SELECT f.id
  INTO v_existing_id
  FROM public.feedbacks f
  WHERE f.qr_code_id = v_qr.id
    AND f.client_submission_id = p_client_submission_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'feedbackId', v_existing_id,
      'duplicate', true
    );
  END IF;

  v_token_hash := public.self_order_scope_hash(
    v_qr.tenant_id::text || ':' || v_qr.id::text || ':' || p_token
  );

  PERFORM public.feedback_take_rate_bucket('token', v_token_hash, 100, v_window_seconds);

  IF p_ip_hash IS NOT NULL THEN
    v_token_ip_hash := public.self_order_scope_hash(v_token_hash || ':' || p_ip_hash);
    PERFORM public.feedback_take_rate_bucket('token_ip', v_token_ip_hash, 5, v_window_seconds);
  END IF;

  INSERT INTO public.feedbacks (
    tenant_id,
    branch_id,
    qr_code_id,
    client_submission_id,
    rating,
    comment
  )
  VALUES (
    v_qr.tenant_id,
    v_qr.branch_id,
    v_qr.id,
    p_client_submission_id,
    p_rating,
    v_comment
  )
  ON CONFLICT (qr_code_id, client_submission_id)
  DO NOTHING
  RETURNING id INTO v_feedback_id;

  IF v_feedback_id IS NULL THEN
    SELECT f.id
    INTO v_feedback_id
    FROM public.feedbacks f
    WHERE f.qr_code_id = v_qr.id
      AND f.client_submission_id = p_client_submission_id;

    RETURN jsonb_build_object(
      'ok', true,
      'feedbackId', v_feedback_id,
      'duplicate', true
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'feedbackId', v_feedback_id,
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, UUID, SMALLINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, UUID, SMALLINT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, UUID, SMALLINT, TEXT, TEXT) TO service_role;

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.feedback_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feedback_qr_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.feedbacks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.feedback_rate_buckets FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.feedback_qr_codes TO authenticated;
GRANT SELECT ON TABLE public.feedbacks TO authenticated;
GRANT ALL ON TABLE public.feedback_qr_codes TO service_role;
GRANT ALL ON TABLE public.feedbacks TO service_role;
GRANT ALL ON TABLE public.feedback_rate_buckets TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

CREATE POLICY feedback_qr_codes_select
  ON public.feedback_qr_codes
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:view')
  );

CREATE POLICY feedback_qr_codes_insert
  ON public.feedback_qr_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:manage_qr')
  );

CREATE POLICY feedback_qr_codes_update
  ON public.feedback_qr_codes
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:manage_qr')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:manage_qr')
  );

CREATE POLICY feedbacks_select
  ON public.feedbacks
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'feedback:view')
  );

-- No authenticated INSERT/UPDATE/DELETE on feedbacks — RPC only via service_role.
-- No authenticated access to feedback_rate_buckets.

-- ─── Permission catalog + templates + backfill ─────────────────────────────

INSERT INTO public.permission_keys (key, module, description, scope, is_delegable_to_staff)
VALUES
  ('feedback:view', 'feedback', 'Xem phản hồi khách hàng', 'branch', true),
  ('feedback:manage_qr', 'feedback', 'Tạo/xoay/vô hiệu hoá mã QR phản hồi', 'branch', true)
ON CONFLICT (key) DO UPDATE
SET
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

UPDATE public.role_templates
SET
  permission_keys = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['feedback:view', 'feedback:manage_qr'])
      ORDER BY 1
    )
  ),
  updated_at = now()
WHERE position_code IN ('owner', 'branch_manager')
  AND NOT (
    permission_keys @> ARRAY['feedback:view']::text[]
    AND permission_keys @> ARRAY['feedback:manage_qr']::text[]
  );

-- Owner grants: tenant-wide (branch_id NULL) for each feedback key.
INSERT INTO public.staff_permissions (
  user_id, tenant_id, branch_id, permission_key, granted_at, valid_from
)
SELECT pr.id, pr.tenant_id, NULL, k.key, now(), now()
FROM public.profiles pr
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
CROSS JOIN (VALUES ('feedback:view'), ('feedback:manage_qr')) AS k(key)
WHERE pr.is_active
  AND po.code = 'owner'
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions sp
    WHERE sp.user_id = pr.id
      AND sp.permission_key = k.key
      AND sp.branch_id IS NULL
  );

-- Branch managers: branch-scoped grants on their assigned branch.
INSERT INTO public.staff_permissions (
  user_id, tenant_id, branch_id, permission_key, granted_at, valid_from
)
SELECT pr.id, pr.tenant_id, pr.branch_id, k.key, now(), now()
FROM public.profiles pr
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
CROSS JOIN (VALUES ('feedback:view'), ('feedback:manage_qr')) AS k(key)
WHERE pr.is_active
  AND po.code = 'branch_manager'
  AND pr.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions sp
    WHERE sp.user_id = pr.id
      AND sp.permission_key = k.key
      AND sp.branch_id IS NOT DISTINCT FROM pr.branch_id
  );
