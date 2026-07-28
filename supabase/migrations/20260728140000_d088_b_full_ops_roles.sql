-- D088 B-full operational roles (temporary until ADR 0015).
-- Adds accountant / central_supply_ops / central_kitchen_lead application roles,
-- position mapper twin, site-pin unlock for central kinds, and baseline templates.
-- Finance/PO delegable flips land in the Wave 2 companion migration.

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

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_role_from_position_code(text) TO service_role;

COMMENT ON FUNCTION private.staff_role_from_position_code(p_code text) IS
  'Canonical HR position_code to application user_role mapper. D088 roles (accountant, central_supply_ops, central_kitchen_lead) are temporary until ADR 0015. Unknown and archived positions fail closed.';

CREATE OR REPLACE FUNCTION private.required_branch_kind_for_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN NULL
    WHEN 'accountant' THEN NULL
    WHEN 'central_supply_ops' THEN 'central_supply'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen'
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'guard' THEN 'branch'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION private.required_branch_kind_for_position_code(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.required_branch_kind_for_position_code(text) TO service_role;

COMMENT ON FUNCTION private.required_branch_kind_for_position_code(p_code text) IS
  'TS twin of requiredBranchKindForPositionCode. NULL = tenant-level (owner/accountant). Temporary until ADR 0015.';

INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active, is_system)
SELECT t.id, v.code, v.label_vi, v.label_en, true, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('accountant', 'Kế toán', 'Accountant'),
  ('central_supply_ops', 'Quản lý kho Tổng', 'Central Supply Ops'),
  ('central_kitchen_lead', 'Bếp trưởng Bếp TT', 'Central Kitchen Lead')
) AS v(code, label_vi, label_en)
ON CONFLICT (code, tenant_id) DO UPDATE
SET label_vi = EXCLUDED.label_vi,
    label_en = EXCLUDED.label_en,
    is_active = true,
    is_system = true;

-- Wave 1 templates use already-delegable keys only.
-- Accountant finance/PO keys land with Wave 2 is_delegable flips.
INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system)
SELECT t.id, v.name, v.position_code, v.permission_keys::text[], true
FROM public.tenants t
CROSS JOIN (VALUES
  (
    'accountant',
    'accountant',
    ARRAY['procurement:read']::text[]
  ),
  (
    'central_supply_ops',
    'central_supply_ops',
    ARRAY[
      'inventory:read',
      'inventory:write',
      'inventory:count_approve',
      'inventory:count_assign',
      'inventory:stocktake_create',
      'inventory:stocktake_complete',
      'inventory:stocktake_recount',
      'inventory:waste_approve',
      'inventory:writeoff',
      'procurement:grn_create',
      'procurement:grn_confirm',
      'procurement:read',
      'procurement:supplier_manage',
      'procurement:price_list_read',
      'hr:request_leave'
    ]::text[]
  ),
  (
    'central_kitchen_lead',
    'central_kitchen_lead',
    ARRAY[
      'inventory:read',
      'inventory:write',
      'inventory:production_create',
      'inventory:production_confirm',
      'inventory:count_approve',
      'inventory:count_assign',
      'inventory:stocktake_create',
      'inventory:stocktake_complete',
      'inventory:stocktake_recount',
      'inventory:waste_approve',
      'inventory:writeoff',
      'procurement:grn_create',
      'procurement:grn_confirm',
      'procurement:read',
      'procurement:supplier_manage',
      'procurement:price_list_read',
      'hr:request_leave'
    ]::text[]
  )
) AS v(name, position_code, permission_keys)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.role_templates rt
  WHERE rt.tenant_id = t.id
    AND rt.position_code = v.position_code
);

UPDATE public.role_templates rt
SET permission_keys = v.permission_keys::text[],
    name = v.name,
    is_system = true,
    updated_at = now()
FROM (VALUES
  (
    'accountant',
    'accountant',
    ARRAY['procurement:read']::text[]
  ),
  (
    'central_supply_ops',
    'central_supply_ops',
    ARRAY[
      'inventory:read',
      'inventory:write',
      'inventory:count_approve',
      'inventory:count_assign',
      'inventory:stocktake_create',
      'inventory:stocktake_complete',
      'inventory:stocktake_recount',
      'inventory:waste_approve',
      'inventory:writeoff',
      'procurement:grn_create',
      'procurement:grn_confirm',
      'procurement:read',
      'procurement:supplier_manage',
      'procurement:price_list_read',
      'hr:request_leave'
    ]::text[]
  ),
  (
    'central_kitchen_lead',
    'central_kitchen_lead',
    ARRAY[
      'inventory:read',
      'inventory:write',
      'inventory:production_create',
      'inventory:production_confirm',
      'inventory:count_approve',
      'inventory:count_assign',
      'inventory:stocktake_create',
      'inventory:stocktake_complete',
      'inventory:stocktake_recount',
      'inventory:waste_approve',
      'inventory:writeoff',
      'procurement:grn_create',
      'procurement:grn_confirm',
      'procurement:read',
      'procurement:supplier_manage',
      'procurement:price_list_read',
      'hr:request_leave'
    ]::text[]
  )
) AS v(name, position_code, permission_keys)
WHERE rt.position_code = v.position_code;

CREATE OR REPLACE FUNCTION public.check_branch_required() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_role text;
  v_required_kind text;
BEGIN
  SELECT private.staff_role_from_position_code(po.code),
         private.required_branch_kind_for_position_code(po.code)
  INTO v_user_role, v_required_kind
  FROM public.positions po
  WHERE po.id = NEW.position_id
    AND po.tenant_id = NEW.tenant_id;

  IF v_required_kind IS NOT NULL AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position: position_id=%', NEW.position_id
      USING ERRCODE = '23514';
  END IF;

  IF v_required_kind IS NULL
     AND NEW.branch_id IS NOT NULL
     AND v_user_role IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'tenant_role_must_not_have_branch_scope: role=%', v_user_role
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_branch_required() IS
  'Profiles branch-required guard. D088: accountant is tenant-level; central roles require matching site kind (validated in handle_new_user / update_staff_profile).';

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_position_code text;
  v_position_id bigint;
  v_user_role text;
  v_required_kind text;
  v_branch_kind text;
  v_provisioned_by uuid;
  v_template record;
  v_grant record;
BEGIN
  v_tenant_id := NULLIF(NEW.raw_app_meta_data ->> 'tenant_id', '')::bigint;
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_position_code := NULLIF(NEW.raw_app_meta_data ->> 'position_code', '');
  v_provisioned_by := NULLIF(
    NEW.raw_app_meta_data ->> 'provisioned_by',
    ''
  )::uuid;

  IF v_tenant_id IS NULL OR v_position_code IS NULL THEN
    RAISE EXCEPTION 'handle_new_user: tenant_id_and_position_code_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT po.id,
         private.staff_role_from_position_code(po.code),
         private.required_branch_kind_for_position_code(po.code)
  INTO v_position_id, v_user_role, v_required_kind
  FROM public.positions po
  WHERE po.tenant_id = v_tenant_id
    AND po.code = v_position_code
    AND COALESCE(po.is_active, true) = true
  LIMIT 1;

  IF v_position_id IS NULL OR v_user_role IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for position=% tenant=%',
      v_position_code,
      v_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_required_kind IS NULL THEN
    IF v_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'tenant_role_must_not_have_branch_scope' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_branch_id IS NULL THEN
      RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = '22023';
    END IF;

    SELECT b.branch_kind
    INTO v_branch_kind
    FROM public.branches b
    WHERE b.id = v_branch_id
      AND b.tenant_id = v_tenant_id
      AND COALESCE(b.is_active, true) = true;

    IF NOT FOUND OR v_branch_kind IS DISTINCT FROM v_required_kind THEN
      RAISE EXCEPTION 'position_site_kind_mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.profiles actor_profile
    JOIN public.positions actor_position
      ON actor_position.id = actor_profile.position_id
     AND actor_position.tenant_id = actor_profile.tenant_id
    WHERE actor_profile.id = v_provisioned_by
      AND actor_profile.tenant_id = v_tenant_id
      AND actor_position.code = 'owner'
      AND COALESCE(actor_profile.is_active, true) = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'operational_user_requires_active_owner_provisioner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id,
    tenant_id,
    branch_id,
    position_id,
    full_name
  )
  VALUES (
    NEW.id,
    v_tenant_id,
    v_branch_id,
    v_position_id,
    COALESCE(
      NEW.raw_app_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'full_name',
      ''
    )
  );

  SELECT rt.id, rt.permission_keys
  INTO v_template
  FROM public.role_templates rt
  WHERE rt.tenant_id = v_tenant_id
    AND rt.position_code = v_position_code
  ORDER BY rt.id
  LIMIT 1;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION
      'position_permission_template_not_found for position=% tenant=%',
      v_position_code,
      v_tenant_id
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
      permission_key,
      CASE permission.scope
        WHEN 'tenant' THEN NULL::bigint
        WHEN 'branch' THEN v_branch_id
        WHEN 'either' THEN CASE
          WHEN v_user_role IN ('owner', 'accountant') THEN NULL::bigint
          ELSE v_branch_id
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
      user_id,
      tenant_id,
      branch_id,
      permission_key,
      source_template,
      granted_by
    )
    VALUES (
      NEW.id,
      v_tenant_id,
      v_grant.grant_branch_id,
      v_grant.permission_key,
      v_template.id,
      v_provisioned_by
    );

    IF v_provisioned_by IS NOT NULL THEN
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
      VALUES (
        v_tenant_id,
        v_provisioned_by,
        NEW.id,
        v_grant.grant_branch_id,
        v_grant.permission_key,
        'grant',
        v_template.id,
        jsonb_build_object('reason', 'user_provisioned')
      );
    END IF;
  END LOOP;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    - ARRAY[
      'tenant_id',
      'branch_id',
      'position_code',
      'user_role',
      'provisioned_by'
    ]::text[]
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates an explicitly scoped profile and atomically materializes its exact position permission template. D088 unlocks central_supply/central_kitchen pins for central ops roles; accountant is tenant-level. Temporary until ADR 0015.';

CREATE OR REPLACE FUNCTION public.update_staff_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_position_code text DEFAULT NULL::text,
  p_branch_id bigint DEFAULT NULL::bigint,
  p_is_active boolean DEFAULT NULL::boolean
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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
  SELECT p.tenant_id
  INTO v_actor_tenant
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true
    AND po.code = 'owner';

  IF NOT FOUND
     OR NOT public.has_permission_any('hr:manage_employee')
     OR NOT public.has_permission_any('staff:assign_position') THEN
    RAISE EXCEPTION 'forbidden_staff_profile_management' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.position_id,
    p.branch_id,
    COALESCE(p.is_active, true) AS is_active,
    po.code AS position_code
  INTO v_target
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_target_id
    AND p.tenant_id = v_actor_tenant
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  IF v_target.position_code = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner' USING ERRCODE = '42501';
  END IF;

  v_final_position_code := COALESCE(NULLIF(p_position_code, ''), v_target.position_code);

  SELECT po.id,
         private.staff_role_from_position_code(po.code),
         private.required_branch_kind_for_position_code(po.code)
  INTO v_final_position_id, v_final_role, v_required_kind
  FROM public.positions po
  WHERE po.tenant_id = v_actor_tenant
    AND po.code = v_final_position_code
    AND COALESCE(po.is_active, true) = true
  LIMIT 1;

  IF v_final_position_id IS NULL OR v_final_role IS NULL OR v_final_role = 'owner' THEN
    RAISE EXCEPTION 'position_not_assignable: %', v_final_position_code USING ERRCODE = '22023';
  END IF;

  IF v_required_kind IS NULL THEN
    v_final_branch_id := NULL;
  ELSE
    v_final_branch_id := COALESCE(p_branch_id, v_target.branch_id);

    IF v_final_branch_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = v_final_branch_id
        AND b.tenant_id = v_actor_tenant
        AND b.branch_kind = v_required_kind
        AND COALESCE(b.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'position_site_kind_mismatch' USING ERRCODE = '22023';
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
      sp.tenant_id,
      v_actor_id,
      sp.user_id,
      sp.branch_id,
      sp.permission_key,
      'revoke',
      sp.source_template,
      jsonb_build_object('reason', 'profile_assignment_changed')
    FROM public.staff_permissions sp
    WHERE sp.user_id = p_target_id
      AND sp.tenant_id = v_actor_tenant;

    DELETE FROM public.staff_permissions sp
    WHERE sp.user_id = p_target_id
      AND sp.tenant_id = v_actor_tenant;

    IF v_final_active THEN
      FOR v_permission IN
        SELECT
          rt.id AS template_id,
          pk.key AS permission_key,
          CASE
            WHEN pk.scope = 'tenant' THEN NULL::bigint
            WHEN pk.scope = 'either' AND v_final_role = 'accountant' THEN NULL::bigint
            ELSE v_final_branch_id
          END AS grant_branch_id
        FROM public.role_templates rt
        CROSS JOIN LATERAL unnest(rt.permission_keys) AS perm(permission_key)
        JOIN public.permission_keys pk ON pk.key = perm.permission_key
        WHERE rt.tenant_id = v_actor_tenant
          AND rt.position_code = v_final_position_code
      LOOP
        INSERT INTO public.staff_permissions (
          user_id,
          tenant_id,
          branch_id,
          permission_key,
          source_template,
          granted_by
        )
        VALUES (
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
        )
        VALUES (
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

COMMENT ON FUNCTION public.update_staff_profile(uuid, text, text, text, bigint, boolean) IS
  'Owner-only profile assignment boundary. D088: accountant clears branch; central ops require matching central site kind. Temporary until ADR 0015.';

REVOKE ALL ON FUNCTION public.check_branch_required() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_branch_required() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
