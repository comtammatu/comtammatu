-- =============================================================
-- Auth v2 — Phase 2.3: Temporal validity on staff_permissions
--
-- Schema
--   + staff_permissions.valid_from  TIMESTAMPTZ NOT NULL DEFAULT now()
--   + staff_permissions.valid_until TIMESTAMPTZ NULL  (NULL = permanent)
--   + CHECK (valid_until IS NULL OR valid_until > valid_from)
--
-- Helpers (updated)
--   has_permission(branch, key)     → filters where now() within validity window
--   has_permission_any(key)         → same
--
-- RPCs (updated)
--   grant_permission(...,  p_valid_from, p_valid_until)
--   apply_template_to_user(..., p_valid_from, p_valid_until)
--
-- Expired rows are KEPT (audit trail). They're simply ignored by has_permission().
-- =============================================================

-- ═════════════════════════════════════════════════════
-- 1. Schema
-- ═════════════════════════════════════════════════════
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS valid_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- Backfill: existing rows get valid_from = granted_at (so they remain active).
UPDATE public.staff_permissions
SET valid_from = granted_at
WHERE valid_from > granted_at;

-- Window integrity
ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_validity_check;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_validity_check
  CHECK (valid_until IS NULL OR valid_until > valid_from);

-- Hot-path: covers (user, key, branch) + valid_until for range filter.
-- (Partial index with now() not allowed — planner requires IMMUTABLE predicate.)
CREATE INDEX IF NOT EXISTS idx_staff_permissions_validity
  ON public.staff_permissions (user_id, permission_key, branch_id, valid_until);

COMMENT ON COLUMN public.staff_permissions.valid_from IS
  'Grant effective from this instant (TIMESTAMPTZ). Defaults to now() on insert.';
COMMENT ON COLUMN public.staff_permissions.valid_until IS
  'Grant expires at this instant (TIMESTAMPTZ). NULL = permanent.';

-- ═════════════════════════════════════════════════════
-- 2. Update RLS helpers to filter by validity window
-- ═════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id BIGINT, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    -- Owner bypass
    EXISTS (
      SELECT 1 FROM public.profiles pr
      LEFT JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid()
        AND (pr.role::text = 'owner' OR po.code = 'owner')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;

CREATE OR REPLACE FUNCTION public.has_permission_any(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles pr
      LEFT JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid()
        AND (pr.role::text = 'owner' OR po.code = 'owner')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;

-- ═════════════════════════════════════════════════════
-- 3. grant_permission — add validity window params
-- ═════════════════════════════════════════════════════

-- Drop old 4-arg signature first (clean replacement)
DROP FUNCTION IF EXISTS public.grant_permission(UUID, BIGINT, TEXT, BIGINT);

CREATE OR REPLACE FUNCTION public.grant_permission(
  p_target_user     UUID,
  p_branch_id       BIGINT,
  p_permission_key  TEXT,
  p_source_template BIGINT     DEFAULT NULL,
  p_valid_from      TIMESTAMPTZ DEFAULT NULL,
  p_valid_until     TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_grant_id  BIGINT;
  v_from      TIMESTAMPTZ := COALESCE(p_valid_from, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'actor_no_profile' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF public._auth_v2_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permission_keys WHERE key = p_permission_key) THEN
    RAISE EXCEPTION 'unknown_permission_key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= v_from THEN
    RAISE EXCEPTION 'invalid_validity_window: valid_until must be after valid_from' USING ERRCODE = '22023';
  END IF;

  -- Upsert semantics:
  --   Existing row for same (user, branch, key) → UPDATE validity if longer,
  --   else leave alone. This keeps audit meaningful: re-granting extends the
  --   window rather than creating duplicates.
  SELECT id INTO v_grant_id
  FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (p_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_branch_id
    )
  LIMIT 1;

  IF v_grant_id IS NULL THEN
    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, p_branch_id, p_permission_key, p_source_template, auth.uid(),
      v_from, p_valid_until
    )
    RETURNING id INTO v_grant_id;

    INSERT INTO public.permission_audit_log (
      tenant_id, actor_user_id, target_user_id, branch_id,
      permission_key, action, source_template_id, metadata
    ) VALUES (
      v_tenant_id, auth.uid(), p_target_user, p_branch_id,
      p_permission_key, 'grant', p_source_template,
      jsonb_build_object(
        'valid_from',  v_from,
        'valid_until', p_valid_until
      )
    );
  ELSE
    -- Extend validity if new window is broader (or change explicit)
    UPDATE public.staff_permissions
    SET valid_from  = LEAST(valid_from, v_from),
        valid_until = CASE
          WHEN p_valid_until IS NULL THEN NULL  -- make permanent
          WHEN valid_until  IS NULL THEN valid_until  -- already permanent, keep
          ELSE GREATEST(valid_until, p_valid_until)
        END
    WHERE id = v_grant_id;
  END IF;

  RETURN v_grant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_permission(UUID, BIGINT, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_permission(UUID, BIGINT, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ═════════════════════════════════════════════════════
-- 4. apply_template_to_user — add validity window params
-- ═════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.apply_template_to_user(UUID, BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION public.apply_template_to_user(
  p_target_user UUID,
  p_branch_id   BIGINT,
  p_template_id BIGINT,
  p_valid_from  TIMESTAMPTZ DEFAULT NULL,
  p_valid_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id     BIGINT;
  v_target_tenant BIGINT;
  v_template      RECORD;
  v_perm_key      TEXT;
  v_inserted      INTEGER := 0;
  v_rows          INTEGER;
  v_from          TIMESTAMPTZ := COALESCE(p_valid_from, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF public._auth_v2_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= v_from THEN
    RAISE EXCEPTION 'invalid_validity_window' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, permission_keys
  INTO v_template
  FROM public.role_templates
  WHERE id = p_template_id;

  IF v_template.id IS NULL OR v_template.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'template_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, p_branch_id, v_perm_key, v_template.id, auth.uid(),
      v_from, p_valid_until
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.permission_audit_log (
        tenant_id, actor_user_id, target_user_id, branch_id,
        permission_key, action, source_template_id, metadata
      ) VALUES (
        v_tenant_id, auth.uid(), p_target_user, p_branch_id,
        v_perm_key, 'apply_template', v_template.id,
        jsonb_build_object(
          'template_id', v_template.id,
          'valid_from',  v_from,
          'valid_until', p_valid_until
        )
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_template_to_user(UUID, BIGINT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_template_to_user(UUID, BIGINT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
