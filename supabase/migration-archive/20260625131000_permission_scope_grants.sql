CREATE OR REPLACE FUNCTION public.apply_template_to_user(p_target_user uuid, p_branch_id bigint, p_template_id bigint, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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

  IF EXISTS (
    SELECT 1
    FROM unnest(v_template.permission_keys) AS template_key(permission_key)
    LEFT JOIN public.permission_keys pk ON pk.key = template_key.permission_key
    WHERE pk.key IS NULL
  ) THEN
    RAISE EXCEPTION 'unknown_permission_key_in_template' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_template.permission_keys) AS template_key(permission_key)
    JOIN public.permission_keys pk ON pk.key = template_key.permission_key
    WHERE (p_branch_id IS NULL AND pk.scope = 'branch')
       OR (p_branch_id IS NOT NULL AND pk.scope = 'tenant')
  ) THEN
    RAISE EXCEPTION 'permission_scope_mismatch' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.grant_permission(p_target_user uuid, p_branch_id bigint, p_permission_key text, p_source_template bigint DEFAULT NULL::bigint, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_grant_id  BIGINT;
  v_scope     TEXT;
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

  IF public.auth_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  SELECT scope INTO v_scope
  FROM public.permission_keys
  WHERE key = p_permission_key;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'unknown_permission_key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF v_scope = 'branch' AND p_branch_id IS NULL THEN
    RAISE EXCEPTION 'permission_scope_requires_branch: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF v_scope = 'tenant' AND p_branch_id IS NOT NULL THEN
    RAISE EXCEPTION 'permission_scope_requires_tenant: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= v_from THEN
    RAISE EXCEPTION 'invalid_validity_window: valid_until must be after valid_from' USING ERRCODE = '22023';
  END IF;

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
    UPDATE public.staff_permissions
    SET valid_from  = LEAST(valid_from, v_from),
        valid_until = CASE
          WHEN p_valid_until IS NULL THEN NULL
          WHEN valid_until  IS NULL THEN valid_until
          ELSE GREATEST(valid_until, p_valid_until)
        END
    WHERE id = v_grant_id;
  END IF;

  RETURN v_grant_id;
END;
$$;
