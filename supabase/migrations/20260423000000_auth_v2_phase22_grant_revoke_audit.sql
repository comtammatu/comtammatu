-- =============================================================
-- Auth v2 — Phase 2.2: Grant/Revoke RPCs + audit log
--
-- Schema
--   - permission_audit_log: immutable record of grant/revoke actions
-- RPCs (SECURITY DEFINER)
--   - grant_permission(target, branch, key, template?)   → append audit
--   - revoke_permission(target, branch, key)             → append audit
--   - apply_template_to_user(target, branch, template)   → bulk grant
--
-- Authorization: caller must hold `staff:assign_permission` (tenant-wide or
-- branch-scoped for that branch). Owner bypass through has_permission().
--
-- Owner protection: you cannot grant/revoke permissions for a user whose
-- position is `owner`, nor revoke from owner via template. Owner is governed
-- elsewhere (tenants.representative).
-- =============================================================

-- ═════════════════════════════════════════════════════
-- TABLE: permission_audit_log
-- ═════════════════════════════════════════════════════
CREATE TABLE public.permission_audit_log (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id          BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id      UUID   NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id     UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id          BIGINT REFERENCES public.branches(id) ON DELETE CASCADE,
  permission_key     TEXT   NOT NULL,
  action             TEXT   NOT NULL CHECK (action IN ('grant', 'revoke', 'apply_template')),
  source_template_id BIGINT REFERENCES public.role_templates(id) ON DELETE SET NULL,
  metadata           JSONB  NOT NULL DEFAULT '{}'::JSONB,
  at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_perm_audit_target     ON public.permission_audit_log (target_user_id, at DESC);
CREATE INDEX idx_perm_audit_actor      ON public.permission_audit_log (actor_user_id, at DESC);
CREATE INDEX idx_perm_audit_tenant_at  ON public.permission_audit_log (tenant_id, at DESC);

COMMENT ON TABLE public.permission_audit_log IS
  'Append-only audit of grant/revoke actions. Writes go through RPCs only; no direct INSERT/UPDATE/DELETE.';

-- RLS
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.permission_audit_log TO authenticated;
-- Writes strictly via RPC (SECURITY DEFINER bypasses RLS).

-- Viewers: holders of staff:assign_permission (grant admins) + settings:tenant (auditors).
-- Self can view rows targeting them (for transparency — "who changed my perms").
CREATE POLICY "perm_audit_self_view" ON public.permission_audit_log
  FOR SELECT TO authenticated
  USING (target_user_id = auth.uid());

CREATE POLICY "perm_audit_admin_view" ON public.permission_audit_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('staff:assign_permission')
      OR public.has_permission_any('settings:tenant')
    )
  );

-- ═════════════════════════════════════════════════════
-- HELPER: is_target_owner(target_user_id)
-- Returns TRUE if the target user has owner position/role (cannot be managed).
-- ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._auth_v2_is_owner(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    LEFT JOIN public.positions po ON po.id = pr.position_id
    WHERE pr.id = p_user
      AND (pr.role::text = 'owner' OR po.code = 'owner')
  );
$$;

-- ═════════════════════════════════════════════════════
-- RPC: grant_permission(target, branch, key, source_template?)
-- ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.grant_permission(
  p_target_user     UUID,
  p_branch_id       BIGINT,
  p_permission_key  TEXT,
  p_source_template BIGINT DEFAULT NULL
)
RETURNS BIGINT  -- returns staff_permissions.id (existing or newly inserted)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_grant_id  BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Caller must have staff:assign_permission (tenant-wide or for p_branch_id)
  IF NOT public.has_permission(p_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  -- Resolve caller tenant
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'actor_no_profile' USING ERRCODE = '42501';
  END IF;

  -- Target must exist in same tenant
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  -- Cannot grant/revoke perms for owner (managed via tenant settings)
  IF public._auth_v2_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  -- Permission key must exist in catalog
  IF NOT EXISTS (SELECT 1 FROM public.permission_keys WHERE key = p_permission_key) THEN
    RAISE EXCEPTION 'unknown_permission_key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  -- If branch provided, must be in same tenant
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  -- Upsert: if row exists, keep it (idempotent); else insert
  INSERT INTO public.staff_permissions (
    user_id, tenant_id, branch_id, permission_key, source_template, granted_by
  ) VALUES (
    p_target_user, v_tenant_id, p_branch_id, p_permission_key, p_source_template, auth.uid()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_grant_id;

  -- If ON CONFLICT skipped, fetch existing id
  IF v_grant_id IS NULL THEN
    SELECT id INTO v_grant_id
    FROM public.staff_permissions
    WHERE user_id = p_target_user
      AND permission_key = p_permission_key
      AND (
        (p_branch_id IS NULL AND branch_id IS NULL)
        OR branch_id = p_branch_id
      )
    LIMIT 1;
  ELSE
    -- New grant → write audit
    INSERT INTO public.permission_audit_log (
      tenant_id, actor_user_id, target_user_id, branch_id,
      permission_key, action, source_template_id
    ) VALUES (
      v_tenant_id, auth.uid(), p_target_user, p_branch_id,
      p_permission_key, 'grant', p_source_template
    );
  END IF;

  RETURN v_grant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_permission(UUID, BIGINT, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_permission(UUID, BIGINT, TEXT, BIGINT) TO authenticated;

-- ═════════════════════════════════════════════════════
-- RPC: revoke_permission(target, branch, key)
-- ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_permission(
  p_target_user    UUID,
  p_branch_id      BIGINT,
  p_permission_key TEXT
)
RETURNS INTEGER  -- number of rows removed (0 or 1)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_deleted INTEGER;
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

  DELETE FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (p_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_branch_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO public.permission_audit_log (
      tenant_id, actor_user_id, target_user_id, branch_id,
      permission_key, action
    ) VALUES (
      v_tenant_id, auth.uid(), p_target_user, p_branch_id,
      p_permission_key, 'revoke'
    );
  END IF;

  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_permission(UUID, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_permission(UUID, BIGINT, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════
-- RPC: apply_template_to_user(target, branch, template)
-- Bulk grant all keys from a template. Idempotent. Writes 1 audit row per new grant.
-- ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_template_to_user(
  p_target_user UUID,
  p_branch_id   BIGINT,
  p_template_id BIGINT
)
RETURNS INTEGER  -- number of new grants inserted
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

  SELECT id, tenant_id, permission_keys
  INTO v_template
  FROM public.role_templates
  WHERE id = p_template_id;

  IF v_template.id IS NULL OR v_template.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'template_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by
    ) VALUES (
      p_target_user, v_tenant_id, p_branch_id, v_perm_key, v_template.id, auth.uid()
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.permission_audit_log (
        tenant_id, actor_user_id, target_user_id, branch_id,
        permission_key, action, source_template_id,
        metadata
      ) VALUES (
        v_tenant_id, auth.uid(), p_target_user, p_branch_id,
        v_perm_key, 'apply_template', v_template.id,
        jsonb_build_object('template_id', v_template.id)
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_template_to_user(UUID, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_template_to_user(UUID, BIGINT, BIGINT) TO authenticated;
