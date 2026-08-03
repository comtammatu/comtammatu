-- Company-wide personal self-service without an implicit work-module grant.

INSERT INTO public.permission_keys (
  key, module, description, scope, is_delegable_to_staff
)
VALUES (
  'self:access',
  'me',
  'Access personal work, schedule, leave, payslip, and profile surfaces',
  'tenant',
  false
)
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

INSERT INTO public.auth_access_roles (code, label_vi, allowed_scope)
VALUES ('self_service_member', 'Thành viên công ty', 'tenant')
ON CONFLICT (code) DO UPDATE SET
  label_vi = EXCLUDED.label_vi,
  allowed_scope = EXCLUDED.allowed_scope;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
VALUES ('self_service_member', 'self:access')
ON CONFLICT DO NOTHING;

-- HR titles do not grant HR access. The live hr_manager binding owns it.
CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'central_supply_ops' THEN 'central_supply_ops'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen_lead'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'chef' THEN 'chef'
    WHEN 'kitchen_counter' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'grill_counter' THEN 'chef'
    WHEN 'cleaner' THEN 'branch_staff'
    WHEN 'guard' THEN 'branch_staff'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.check_branch_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_role text;
  v_required_kind text;
BEGIN
  SELECT private.staff_role_from_position_code(position.code),
         private.required_branch_kind_for_position_code(position.code)
  INTO v_user_role, v_required_kind
  FROM public.positions position
  WHERE position.id = NEW.position_id
    AND position.tenant_id = NEW.tenant_id;

  IF v_required_kind IS NOT NULL
     AND v_required_kind <> 'unassigned'
     AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION
      'branch_required_for_operational_position: position_id=%',
      NEW.position_id
      USING ERRCODE = '23514';
  END IF;

  IF (v_required_kind IS NULL OR v_required_kind = 'unassigned')
     AND NEW.branch_id IS NOT NULL
     AND (v_user_role IS NULL OR v_user_role IN ('owner', 'accountant')) THEN
    RAISE EXCEPTION 'tenant_role_must_not_have_branch_scope: role=%',
      COALESCE(v_user_role, 'self_service')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_branch_required() IS
  'Profiles branch guard. Unmapped active company positions are tenant-scoped self-service candidates; operational positions remain site-pinned.';

CREATE OR REPLACE FUNCTION private.sync_self_service_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_position_code text;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT position.code
  INTO v_position_code
  FROM public.positions position
  WHERE position.id = NEW.position_id
    AND position.tenant_id = NEW.tenant_id;

  IF COALESCE(NEW.is_active, true) AND v_position_code <> 'owner' THEN
    INSERT INTO public.auth_role_bindings (
      tenant_id,
      user_id,
      role_code,
      scope_type,
      branch_id,
      granted_by,
      valid_from
    )
    SELECT
      NEW.tenant_id,
      NEW.id,
      'self_service_member',
      'tenant',
      NULL,
      auth.uid(),
      v_now
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.auth_role_bindings binding
      WHERE binding.tenant_id = NEW.tenant_id
        AND binding.user_id = NEW.id
        AND binding.role_code = 'self_service_member'
        AND binding.scope_type = 'tenant'
        AND binding.branch_id IS NULL
        AND binding.valid_until IS NULL
    );
  ELSE
    UPDATE public.auth_role_bindings binding
    SET valid_until = GREATEST(
      v_now,
      binding.valid_from + interval '1 microsecond'
    )
    WHERE binding.tenant_id = NEW.tenant_id
      AND binding.user_id = NEW.id
      AND binding.role_code = 'self_service_member'
      AND binding.scope_type = 'tenant'
      AND binding.branch_id IS NULL
      AND binding.valid_until IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_self_service_binding ON public.profiles;
CREATE TRIGGER trg_profiles_self_service_binding
AFTER INSERT OR UPDATE OF tenant_id, position_id, is_active
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.sync_self_service_binding();

INSERT INTO public.auth_role_bindings (
  tenant_id,
  user_id,
  role_code,
  scope_type,
  branch_id,
  granted_by
)
SELECT
  profile.tenant_id,
  profile.id,
  'self_service_member',
  'tenant',
  NULL,
  NULL
FROM public.profiles profile
JOIN public.positions position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
WHERE profile.is_active
  AND position.code <> 'owner'
  AND NOT EXISTS (
    SELECT 1
    FROM public.auth_role_bindings binding
    WHERE binding.tenant_id = profile.tenant_id
      AND binding.user_id = profile.id
      AND binding.role_code = 'self_service_member'
      AND binding.scope_type = 'tenant'
      AND binding.branch_id IS NULL
      AND binding.valid_until IS NULL
  );

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  claims jsonb := event -> 'claims';
  source_metadata jsonb := COALESCE(claims -> 'app_metadata', '{}'::jsonb);
  canonical_metadata jsonb;
  user_profile record;
BEGIN
  SELECT
    profile.tenant_id,
    profile.branch_id,
    COALESCE(
      private.staff_role_from_position_code(position.code),
      CASE WHEN EXISTS (
        SELECT 1
        FROM public.auth_role_bindings binding
        WHERE binding.user_id = profile.id
          AND binding.tenant_id = profile.tenant_id
          AND binding.role_code = 'self_service_member'
          AND binding.scope_type = 'tenant'
          AND binding.branch_id IS NULL
          AND binding.valid_from <= now()
          AND (binding.valid_until IS NULL OR binding.valid_until > now())
      ) THEN 'self_service' END
    ) AS user_role,
    position.code AS position_code
  INTO user_profile
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.id = (event ->> 'user_id')::uuid
    AND profile.is_active
    AND position.is_active
  LIMIT 1;

  canonical_metadata := jsonb_strip_nulls(jsonb_build_object(
    'provider', source_metadata -> 'provider',
    'providers', source_metadata -> 'providers',
    'full_name', source_metadata -> 'full_name'
  ));

  IF user_profile.tenant_id IS NOT NULL THEN
    IF user_profile.user_role IS NULL THEN
      RAISE EXCEPTION
        'custom_access_token_hook: active_self_service_binding_not_resolved for position=% tenant=%',
        user_profile.position_code,
        user_profile.tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    canonical_metadata := canonical_metadata || jsonb_build_object(
      'tenant_id', user_profile.tenant_id,
      'branch_id', user_profile.branch_id,
      'user_role', user_profile.user_role,
      'position_code', user_profile.position_code
    );
  END IF;

  claims := jsonb_set(claims, '{app_metadata}', canonical_metadata);
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(event jsonb) IS
  'Emits the legacy application role or the self_service compatibility projection. Live bindings and database capabilities remain authoritative.';

CREATE OR REPLACE FUNCTION private.provision_auth_user(
  p_user_id uuid,
  p_tenant_id bigint,
  p_branch_id bigint,
  p_position_code text,
  p_full_name text,
  p_provisioned_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_position_id bigint;
  v_user_role text;
  v_required_kind text;
  v_branch_kind text;
  v_template record;
  v_grant record;
BEGIN
  SELECT position.id,
         private.staff_role_from_position_code(position.code),
         private.required_branch_kind_for_position_code(position.code)
  INTO v_position_id, v_user_role, v_required_kind
  FROM public.positions position
  WHERE position.tenant_id = p_tenant_id
    AND position.code = p_position_code
    AND position.is_active
  LIMIT 1;

  IF v_position_id IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for position=% tenant=%',
      p_position_code,
      p_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_user_role IS NULL THEN
    v_required_kind := NULL;
  END IF;

  IF v_required_kind IS NULL THEN
    IF p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'tenant_role_must_not_have_branch_scope'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_branch_id IS NULL THEN
      RAISE EXCEPTION 'branch_required_for_operational_position'
        USING ERRCODE = '22023';
    END IF;

    SELECT branch.branch_kind
    INTO v_branch_kind
    FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = p_tenant_id
      AND branch.is_active;

    IF NOT FOUND OR v_branch_kind IS DISTINCT FROM v_required_kind THEN
      RAISE EXCEPTION 'position_site_kind_mismatch'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.profiles actor_profile
    JOIN public.positions actor_position
      ON actor_position.id = actor_profile.position_id
     AND actor_position.tenant_id = actor_profile.tenant_id
    WHERE actor_profile.id = p_provisioned_by
      AND actor_profile.tenant_id = p_tenant_id
      AND actor_position.code = 'owner'
      AND actor_profile.is_active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'operational_user_requires_active_owner_provisioner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id, tenant_id, branch_id, position_id, full_name
  ) VALUES (
    p_user_id, p_tenant_id, p_branch_id, v_position_id, p_full_name
  );

  IF v_user_role IS NULL THEN
    RETURN;
  END IF;

  SELECT template.id, template.permission_keys
  INTO v_template
  FROM public.role_templates template
  WHERE template.tenant_id = p_tenant_id
    AND template.position_code = p_position_code
  ORDER BY template.id
  LIMIT 1;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION
      'position_permission_template_not_found for position=% tenant=%',
      p_position_code,
      p_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_user_role <> 'owner' AND EXISTS (
    SELECT 1
    FROM unnest(v_template.permission_keys) AS template_key(permission_key)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.permission_keys permission
      WHERE permission.key = template_key.permission_key
    )
  ) THEN
    RAISE EXCEPTION 'position_permission_template_contains_unknown_key'
      USING ERRCODE = '22023';
  END IF;

  FOR v_grant IN
    SELECT
      permission.key AS permission_key,
      CASE permission.scope
        WHEN 'tenant' THEN NULL::bigint
        WHEN 'branch' THEN p_branch_id
        WHEN 'either' THEN CASE
          WHEN v_user_role IN ('owner', 'accountant') THEN NULL::bigint
          ELSE p_branch_id
        END
      END AS grant_branch_id
    FROM unnest(v_template.permission_keys) AS template_key(permission_key)
    JOIN public.permission_keys permission
      ON permission.key = template_key.permission_key
    WHERE v_user_role <> 'owner'
  LOOP
    IF v_grant.grant_branch_id IS NULL
       AND EXISTS (
         SELECT 1
         FROM public.permission_keys permission
         WHERE permission.key = v_grant.permission_key
           AND permission.scope = 'branch'
       ) THEN
      RAISE EXCEPTION
        'branch_permission_requires_branch: %',
        v_grant.permission_key
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by
    ) VALUES (
      p_user_id,
      p_tenant_id,
      v_grant.grant_branch_id,
      v_grant.permission_key,
      v_template.id,
      p_provisioned_by
    );

    IF p_provisioned_by IS NOT NULL THEN
      INSERT INTO public.permission_audit_log (
        tenant_id,
        actor_user_id,
        target_user_id,
        branch_id,
        permission_key,
        action,
        source_template_id,
        metadata
      ) VALUES (
        p_tenant_id,
        p_provisioned_by,
        p_user_id,
        v_grant.grant_branch_id,
        v_grant.permission_key,
        'grant',
        v_template.id,
        jsonb_build_object('reason', 'user_provisioned')
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_position_code text DEFAULT NULL::text,
  p_branch_id bigint DEFAULT NULL::bigint,
  p_is_active boolean DEFAULT NULL::boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_tenant bigint;
  v_target record;
  v_final_position_id bigint;
  v_final_position_code text;
  v_final_role text;
  v_required_kind text;
  v_final_branch_id bigint;
  v_final_active boolean;
  v_assignment_changed boolean;
  v_permission record;
BEGIN
  SELECT profile.tenant_id
  INTO v_actor_tenant
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.id = v_actor_id
    AND profile.is_active
    AND position.code = 'owner';

  IF NOT FOUND
     OR NOT public.has_permission_any('hr:manage_employee')
     OR NOT public.has_permission_any('staff:assign_position') THEN
    RAISE EXCEPTION 'forbidden_staff_profile_management'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    profile.position_id,
    profile.branch_id,
    profile.is_active,
    position.code AS position_code
  INTO v_target
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.id = p_target_id
    AND profile.tenant_id = v_actor_tenant
  FOR UPDATE OF profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target.position_code = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner' USING ERRCODE = '42501';
  END IF;

  v_final_position_code := COALESCE(
    NULLIF(p_position_code, ''),
    v_target.position_code
  );

  SELECT position.id,
         private.staff_role_from_position_code(position.code),
         private.required_branch_kind_for_position_code(position.code)
  INTO v_final_position_id, v_final_role, v_required_kind
  FROM public.positions position
  WHERE position.tenant_id = v_actor_tenant
    AND position.code = v_final_position_code
    AND position.is_active
  LIMIT 1;

  IF v_final_position_id IS NULL OR v_final_role = 'owner' THEN
    RAISE EXCEPTION 'position_not_assignable: %', v_final_position_code
      USING ERRCODE = '22023';
  END IF;

  IF v_final_role IS NULL THEN
    v_required_kind := NULL;
  END IF;

  IF v_required_kind IS NULL THEN
    v_final_branch_id := NULL;
  ELSE
    v_final_branch_id := COALESCE(p_branch_id, v_target.branch_id);

    IF v_final_branch_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.branches branch
      WHERE branch.id = v_final_branch_id
        AND branch.tenant_id = v_actor_tenant
        AND branch.branch_kind = v_required_kind
        AND branch.is_active
    ) THEN
      RAISE EXCEPTION 'position_site_kind_mismatch'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_final_active := COALESCE(p_is_active, v_target.is_active);
  v_assignment_changed :=
    v_target.position_id IS DISTINCT FROM v_final_position_id
    OR v_target.branch_id IS DISTINCT FROM v_final_branch_id
    OR v_target.is_active IS DISTINCT FROM v_final_active;

  UPDATE public.profiles
  SET full_name = COALESCE(p_full_name, full_name),
      phone = COALESCE(p_phone, phone),
      position_id = v_final_position_id,
      branch_id = v_final_branch_id,
      is_active = v_final_active,
      updated_at = now()
  WHERE id = p_target_id
    AND tenant_id = v_actor_tenant;

  IF v_assignment_changed THEN
    INSERT INTO public.permission_audit_log (
      tenant_id,
      actor_user_id,
      target_user_id,
      branch_id,
      permission_key,
      action,
      source_template_id,
      metadata
    )
    SELECT
      permission.tenant_id,
      v_actor_id,
      permission.user_id,
      permission.branch_id,
      permission.permission_key,
      'revoke',
      permission.source_template,
      jsonb_build_object('reason', 'profile_assignment_changed')
    FROM public.staff_permissions permission
    WHERE permission.user_id = p_target_id
      AND permission.tenant_id = v_actor_tenant;

    DELETE FROM public.staff_permissions permission
    WHERE permission.user_id = p_target_id
      AND permission.tenant_id = v_actor_tenant;

    IF v_final_active AND v_final_role IS NOT NULL THEN
      FOR v_permission IN
        SELECT
          template.id AS template_id,
          permission_key.key AS permission_key,
          CASE
            WHEN permission_key.scope = 'tenant' THEN NULL::bigint
            WHEN permission_key.scope = 'either'
                 AND v_final_role = 'accountant' THEN NULL::bigint
            ELSE v_final_branch_id
          END AS grant_branch_id
        FROM public.role_templates template
        CROSS JOIN LATERAL
          unnest(template.permission_keys) AS item(permission_key)
        JOIN public.permission_keys permission_key
          ON permission_key.key = item.permission_key
        WHERE template.tenant_id = v_actor_tenant
          AND template.position_code = v_final_position_code
      LOOP
        INSERT INTO public.staff_permissions (
          user_id,
          tenant_id,
          branch_id,
          permission_key,
          source_template,
          granted_by
        ) VALUES (
          p_target_id,
          v_actor_tenant,
          v_permission.grant_branch_id,
          v_permission.permission_key,
          v_permission.template_id,
          v_actor_id
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO public.permission_audit_log (
          tenant_id,
          actor_user_id,
          target_user_id,
          branch_id,
          permission_key,
          action,
          source_template_id,
          metadata
        ) VALUES (
          v_actor_tenant,
          v_actor_id,
          p_target_id,
          v_permission.grant_branch_id,
          v_permission.permission_key,
          'grant',
          v_permission.template_id,
          jsonb_build_object('reason', 'profile_assignment_changed')
        );
      END LOOP;
    END IF;

    DELETE FROM auth.sessions session_row
    WHERE session_row.user_id = p_target_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_staff_profile(
  uuid, text, text, text, bigint, boolean
) IS
  'Owner-managed profile boundary. Unmapped active company positions receive self-service only and no position-derived work-module permissions.';

REVOKE ALL ON FUNCTION public.check_branch_required()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
TO supabase_auth_admin, service_role;
REVOKE ALL ON FUNCTION private.sync_self_service_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.provision_auth_user(
  uuid, bigint, bigint, text, text, uuid
) FROM PUBLIC, anon, authenticated;
