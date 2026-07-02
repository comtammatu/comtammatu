CREATE OR REPLACE FUNCTION public.apply_template_to_user(
  p_target_user uuid,
  p_branch_id bigint,
  p_template_id bigint,
  p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id       BIGINT;
  v_target_tenant   BIGINT;
  v_template        RECORD;
  v_perm_key        TEXT;
  v_perm_scope      TEXT;
  v_grant_branch_id BIGINT;
  v_inserted        INTEGER := 0;
  v_rows            INTEGER;
  v_from            TIMESTAMPTZ := COALESCE(p_valid_from, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF p_target_user = auth.uid() THEN
    RAISE EXCEPTION 'cannot_self_assign_permissions' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF public.auth_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
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
    SELECT scope INTO v_perm_scope
    FROM public.permission_keys
    WHERE key = v_perm_key;

    IF v_perm_scope IS NULL THEN
      RAISE EXCEPTION 'unknown_permission_key_in_template' USING ERRCODE = '22023';
    END IF;

    v_grant_branch_id := CASE
      WHEN v_perm_scope = 'tenant' THEN NULL
      WHEN v_perm_scope = 'branch' THEN p_branch_id
      ELSE p_branch_id
    END;

    IF v_perm_scope = 'branch' AND v_grant_branch_id IS NULL THEN
      RAISE EXCEPTION 'permission_scope_requires_branch: %', v_perm_key USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, v_grant_branch_id, v_perm_key, v_template.id, auth.uid(),
      v_from, p_valid_until
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.permission_audit_log (
        tenant_id, actor_user_id, target_user_id, branch_id,
        permission_key, action, source_template_id, metadata
      ) VALUES (
        v_tenant_id, auth.uid(), p_target_user, v_grant_branch_id,
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

CREATE OR REPLACE FUNCTION public.sync_missing_permissions_from_template() RETURNS TABLE(rows_added integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_profile record;
  v_template record;
  v_perm_key text;
  v_perm_scope text;
  v_branch bigint;
  v_grant_branch bigint;
  v_added integer := 0;
  v_rows integer;
BEGIN
  FOR v_profile IN
    SELECT
      p.id AS user_id,
      p.tenant_id,
      p.branch_id,
      pos.code AS position_code,
      private.staff_role_from_position_code(pos.code) AS access_bucket
    FROM public.profiles p
    JOIN public.positions pos
      ON pos.id = p.position_id
     AND pos.tenant_id = p.tenant_id
    WHERE p.is_active = true
      AND p.position_id IS NOT NULL
  LOOP
    IF v_profile.access_bucket IS NULL THEN
      CONTINUE;
    END IF;

    SELECT rt.id, rt.permission_keys
    INTO v_template
    FROM public.role_templates rt
    WHERE rt.tenant_id = v_profile.tenant_id
      AND rt.position_code = v_profile.position_code
    LIMIT 1;

    IF v_template.permission_keys IS NULL THEN
      CONTINUE;
    END IF;

    IF v_profile.access_bucket IN ('owner') THEN
      v_branch := NULL;
    ELSE
      v_branch := v_profile.branch_id;
    END IF;

    FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
      SELECT scope INTO v_perm_scope
      FROM public.permission_keys
      WHERE key = v_perm_key;

      IF v_perm_scope IS NULL THEN
        RAISE EXCEPTION 'unknown_permission_key_in_template: %', v_perm_key USING ERRCODE = '22023';
      END IF;

      v_grant_branch := CASE
        WHEN v_perm_scope = 'tenant' THEN NULL
        WHEN v_perm_scope = 'branch' THEN v_branch
        ELSE v_branch
      END;

      IF v_perm_scope = 'branch' AND v_grant_branch IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO public.staff_permissions (
        user_id,
        tenant_id,
        branch_id,
        permission_key,
        source_template
      )
      VALUES (
        v_profile.user_id,
        v_profile.tenant_id,
        v_grant_branch,
        v_perm_key,
        v_template.id
      )
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_added := v_added + v_rows;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_missing_permissions_from_template() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_missing_permissions_from_template() TO service_role;

WITH branch_source AS (
  SELECT
    sp.user_id,
    sp.tenant_id,
    p.branch_id,
    sp.permission_key,
    (array_agg(sp.source_template ORDER BY sp.granted_at) FILTER (WHERE sp.source_template IS NOT NULL))[1] AS source_template,
    (array_agg(sp.granted_by ORDER BY sp.granted_at) FILTER (WHERE sp.granted_by IS NOT NULL))[1] AS granted_by,
    min(sp.granted_at) AS granted_at,
    min(sp.valid_from) AS valid_from,
    CASE
      WHEN bool_or(sp.valid_until IS NULL) THEN NULL
      ELSE max(sp.valid_until)
    END AS valid_until
  FROM public.staff_permissions sp
  JOIN public.permission_keys pk ON pk.key = sp.permission_key
  JOIN public.profiles p
    ON p.id = sp.user_id
   AND p.tenant_id = sp.tenant_id
  WHERE pk.scope = 'branch'
    AND sp.branch_id IS NULL
    AND p.branch_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = p.branch_id
        AND b.tenant_id = sp.tenant_id
    )
  GROUP BY sp.user_id, sp.tenant_id, p.branch_id, sp.permission_key
)
INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by,
  granted_at,
  valid_from,
  valid_until
)
SELECT
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by,
  granted_at,
  valid_from,
  valid_until
FROM branch_source
ON CONFLICT (user_id, branch_id, permission_key) WHERE branch_id IS NOT NULL
DO UPDATE SET
  source_template = COALESCE(public.staff_permissions.source_template, EXCLUDED.source_template),
  granted_by = COALESCE(public.staff_permissions.granted_by, EXCLUDED.granted_by),
  granted_at = LEAST(public.staff_permissions.granted_at, EXCLUDED.granted_at),
  valid_from = LEAST(public.staff_permissions.valid_from, EXCLUDED.valid_from),
  valid_until = CASE
    WHEN public.staff_permissions.valid_until IS NULL OR EXCLUDED.valid_until IS NULL THEN NULL
    ELSE GREATEST(public.staff_permissions.valid_until, EXCLUDED.valid_until)
  END;

WITH tenant_source AS (
  SELECT
    sp.user_id,
    sp.tenant_id,
    sp.permission_key,
    (array_agg(sp.source_template ORDER BY sp.granted_at) FILTER (WHERE sp.source_template IS NOT NULL))[1] AS source_template,
    (array_agg(sp.granted_by ORDER BY sp.granted_at) FILTER (WHERE sp.granted_by IS NOT NULL))[1] AS granted_by,
    min(sp.granted_at) AS granted_at,
    min(sp.valid_from) AS valid_from,
    CASE
      WHEN bool_or(sp.valid_until IS NULL) THEN NULL
      ELSE max(sp.valid_until)
    END AS valid_until
  FROM public.staff_permissions sp
  JOIN public.permission_keys pk ON pk.key = sp.permission_key
  WHERE pk.scope = 'tenant'
    AND sp.branch_id IS NOT NULL
  GROUP BY sp.user_id, sp.tenant_id, sp.permission_key
)
INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by,
  granted_at,
  valid_from,
  valid_until
)
SELECT
  user_id,
  tenant_id,
  NULL,
  permission_key,
  source_template,
  granted_by,
  granted_at,
  valid_from,
  valid_until
FROM tenant_source
ON CONFLICT (user_id, permission_key) WHERE branch_id IS NULL
DO UPDATE SET
  source_template = COALESCE(public.staff_permissions.source_template, EXCLUDED.source_template),
  granted_by = COALESCE(public.staff_permissions.granted_by, EXCLUDED.granted_by),
  granted_at = LEAST(public.staff_permissions.granted_at, EXCLUDED.granted_at),
  valid_from = LEAST(public.staff_permissions.valid_from, EXCLUDED.valid_from),
  valid_until = CASE
    WHEN public.staff_permissions.valid_until IS NULL OR EXCLUDED.valid_until IS NULL THEN NULL
    ELSE GREATEST(public.staff_permissions.valid_until, EXCLUDED.valid_until)
  END;

DELETE FROM public.staff_permissions sp
USING public.permission_keys pk
WHERE pk.key = sp.permission_key
  AND (
    (pk.scope = 'branch' AND sp.branch_id IS NULL)
    OR (pk.scope = 'tenant' AND sp.branch_id IS NOT NULL)
  );
