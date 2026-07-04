-- D066 §7a (owner 2026-07-04): production_manager-bucket positions
-- (head_chef, central_kitchen_manager, production_manager) run the Bếp Trung
-- Tâm daily loop end-to-end — supplier GRN, stocktake, spoilage write-off.
-- Recipe management needs no new key: menu:write is already in the head_chef
-- template; the action-layer null-branch fix ships in the same PR.
--
-- Central-site operators hold tenant-level claims (branch_id NULL, D055 §1 /
-- WF-10), so their branch-scoped keys are granted as tenant-wide rows
-- (staff_permissions.branch_id NULL) — has_permission() matches NULL rows for
-- any branch argument. Both template-grant functions are patched below so
-- future hires under central-site positions get the same treatment instead of
-- permission_scope_requires_branch / a silent skip.

UPDATE public.role_templates
SET permission_keys = ARRAY(
  SELECT DISTINCT unnest(
    COALESCE(permission_keys, ARRAY[]::text[]) || ARRAY[
      'procurement:grn_create',
      'procurement:grn_confirm',
      'inventory:stocktake_create',
      'inventory:stocktake_complete',
      'inventory:stocktake_recount',
      'inventory:writeoff'
    ]
  ) ORDER BY 1
)
WHERE position_code = 'head_chef';

-- These positions map to the production_manager bucket but have no template
-- row yet (prod has only 8 templates); a hire under them must start with the
-- same central-kitchen bundle as head_chef.
INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system)
SELECT rt.tenant_id, pos.code, pos.code, rt.permission_keys, true
FROM public.role_templates rt
CROSS JOIN (VALUES ('production_manager'), ('central_kitchen_manager')) AS pos(code)
WHERE rt.position_code = 'head_chef'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_templates x
    WHERE x.tenant_id = rt.tenant_id AND x.position_code = pos.code
  );

-- Backfill active central-kitchen operators as tenant-wide grants.
INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_at,
  valid_from
)
SELECT
  p.id,
  p.tenant_id,
  NULL,
  k.key,
  rt.id,
  now(),
  now()
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
LEFT JOIN public.role_templates rt
  ON rt.tenant_id = p.tenant_id
 AND rt.position_code = po.code
CROSS JOIN unnest(ARRAY[
  'procurement:grn_create',
  'procurement:grn_confirm',
  'inventory:stocktake_create',
  'inventory:stocktake_complete',
  'inventory:stocktake_recount',
  'inventory:writeoff'
]) AS k(key)
WHERE po.code IN ('head_chef', 'production_manager', 'central_kitchen_manager')
  AND p.is_active IS DISTINCT FROM false
ON CONFLICT (user_id, permission_key) WHERE branch_id IS NULL
DO UPDATE SET
  source_template = COALESCE(public.staff_permissions.source_template, EXCLUDED.source_template);

-- apply_template_to_user: branch-scoped keys applied to a central-site
-- position with no branch become tenant-wide grants instead of raising
-- permission_scope_requires_branch.
CREATE OR REPLACE FUNCTION public.apply_template_to_user(p_target_user uuid, p_branch_id bigint, p_template_id bigint, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id       BIGINT;
  v_target_tenant   BIGINT;
  v_target_bucket   TEXT;
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

  SELECT private.staff_role_from_position_code(pos.code)
  INTO v_target_bucket
  FROM public.profiles p
  JOIN public.positions pos
    ON pos.id = p.position_id
   AND pos.tenant_id = p.tenant_id
  WHERE p.id = p_target_user;
  IF v_target_bucket IS NULL
     OR v_target_bucket NOT IN ('warehouse_manager', 'production_manager') THEN
    v_target_bucket := NULL;
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
      IF v_target_bucket IS NOT NULL THEN
        v_grant_branch_id := NULL;
      ELSE
        RAISE EXCEPTION 'permission_scope_requires_branch: %', v_perm_key USING ERRCODE = '22023';
      END IF;
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

-- sync_missing_permissions_from_template: same rule — do not silently skip
-- branch-scoped keys for central-site operators without a branch pin.
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
        IF v_profile.access_bucket IN ('warehouse_manager', 'production_manager') THEN
          v_grant_branch := NULL;
        ELSE
          CONTINUE;
        END IF;
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
