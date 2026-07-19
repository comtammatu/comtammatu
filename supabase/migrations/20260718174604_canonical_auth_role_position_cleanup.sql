BEGIN;

-- Authorization roles are derived only from active HR positions.
CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner'
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

COMMENT ON FUNCTION private.staff_role_from_position_code(text)
IS 'Canonical HR position_code to application user_role mapper. Unknown and archived positions fail closed.';

CREATE OR REPLACE FUNCTION public.current_position()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT po.code
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE pr.id = auth.uid()
    AND COALESCE(pr.is_active, true) = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_position() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_position() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.current_position() TO service_role;

COMMENT ON FUNCTION public.current_position()
IS 'Returns the active profile HR position_code. profiles.position_id is the only position source.';

CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT pr.tenant_id
  FROM public.profiles pr
  WHERE pr.id = auth.uid()
    AND COALESCE(pr.is_active, true) = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.auth_branch_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT pr.branch_id
  FROM public.profiles pr
  WHERE pr.id = auth.uid()
    AND COALESCE(pr.is_active, true) = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.auth_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_branch_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_branch_id() TO authenticated, service_role;

COMMENT ON FUNCTION public.auth_tenant_id()
IS 'Returns the current active profile tenant. Live profile scope supersedes stale JWT metadata.';

COMMENT ON FUNCTION public.auth_branch_id()
IS 'Returns the current active profile branch. Live profile scope supersedes stale JWT metadata.';

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
    p.tenant_id,
    p.branch_id,
    private.staff_role_from_position_code(po.code) AS user_role,
    po.code AS position_code
  INTO user_profile
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = (event ->> 'user_id')::uuid
    AND COALESCE(p.is_active, true) = true
    AND COALESCE(po.is_active, true) = true
  LIMIT 1;

  canonical_metadata := jsonb_strip_nulls(jsonb_build_object(
    'provider', source_metadata -> 'provider',
    'providers', source_metadata -> 'providers',
    'full_name', source_metadata -> 'full_name'
  ));

  IF user_profile.tenant_id IS NOT NULL THEN
    IF user_profile.user_role IS NULL THEN
      RAISE EXCEPTION
        'custom_access_token_hook: position_role_not_resolved for position=% tenant=%',
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

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO service_role, supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb)
IS 'Emits only tenant_id, branch_id, user_role, and position_code authorization claims from active profiles and positions.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_position_code text;
  v_position_id bigint;
  v_user_role text;
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

  SELECT po.id, private.staff_role_from_position_code(po.code)
  INTO v_position_id, v_user_role
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

  IF v_user_role = 'owner' THEN
    IF v_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'owner_must_not_have_branch_scope' USING ERRCODE = '22023';
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

    IF NOT FOUND OR v_branch_kind <> 'branch' THEN
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
          WHEN v_user_role = 'owner' THEN NULL::bigint
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

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

COMMENT ON FUNCTION public.handle_new_user()
IS 'Creates an explicitly scoped profile and atomically materializes its exact position permission template. Missing or unmapped identity fails closed.';

CREATE OR REPLACE FUNCTION public.has_position(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.positions po
      ON po.id = pr.position_id
     AND po.tenant_id = pr.tenant_id
    WHERE pr.id = auth.uid()
      AND COALESCE(pr.is_active, true) = true
      AND COALESCE(po.is_active, true) = true
      AND po.code = p_code
  )
$$;

REVOKE ALL ON FUNCTION public.has_position(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_position(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_position(text) TO service_role;

COMMENT ON FUNCTION public.has_position(text)
IS 'Checks the active HR position_code associated with the authenticated profile.';

COMMENT ON FUNCTION public.auth_role()
IS 'Returns the canonical application user_role derived from the active HR position.';

CREATE OR REPLACE FUNCTION public.update_staff_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_position_code text DEFAULT NULL,
  p_branch_id bigint DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS void
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

  SELECT po.id, private.staff_role_from_position_code(po.code)
  INTO v_final_position_id, v_final_role
  FROM public.positions po
  WHERE po.tenant_id = v_actor_tenant
    AND po.code = v_final_position_code
    AND COALESCE(po.is_active, true) = true
  LIMIT 1;

  IF v_final_position_id IS NULL OR v_final_role IS NULL OR v_final_role = 'owner' THEN
    RAISE EXCEPTION 'position_not_assignable: %', v_final_position_code USING ERRCODE = '22023';
  END IF;

  v_final_branch_id := COALESCE(p_branch_id, v_target.branch_id);
  v_final_active := COALESCE(p_is_active, v_target.is_active);

  IF v_final_branch_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = v_final_branch_id
      AND b.tenant_id = v_actor_tenant
      AND b.branch_kind = 'branch'
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'active_branch_required_for_staff_position' USING ERRCODE = '22023';
  END IF;

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

REVOKE ALL ON FUNCTION public.update_staff_profile(uuid, text, text, text, bigint, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_profile(uuid, text, text, text, bigint, boolean)
TO authenticated, service_role;

COMMENT ON FUNCTION public.update_staff_profile(uuid, text, text, text, bigint, boolean)
IS 'Owner-only profile assignment boundary. Position and branch changes atomically replace PBAC grants from the canonical position template.';

CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_current boolean;
BEGIN
  SELECT COALESCE(p.is_active, true)
  INTO v_current
  FROM public.profiles p
  WHERE p.id = p_target_id
    AND p.tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.update_staff_profile(
    p_target_id => p_target_id,
    p_is_active => NOT v_current
  );

  RETURN NOT v_current;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_profile_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_profile_active(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, text, text, bigint, boolean);
DROP FUNCTION IF EXISTS public.position_id_from_access_bucket(text, bigint);
DROP FUNCTION IF EXISTS public.auth_role_to_position(text);

UPDATE public.permission_keys
SET scope = 'branch'
WHERE key IN (
  'hr:approve_checkout',
  'hr:approve_leave_request',
  'hr:view_employee'
);

ALTER TABLE public.permission_keys
ADD COLUMN IF NOT EXISTS is_delegable_to_staff boolean;

UPDATE public.permission_keys
SET is_delegable_to_staff = key = ANY (ARRAY[
  'dashboard:view',
  'hr:approve_checkout',
  'hr:approve_leave_request',
  'hr:request_leave',
  'hr:view_employee',
  'inventory:adjust_approve',
  'inventory:count_approve',
  'inventory:count_assign',
  'inventory:grn_express_extend',
  'inventory:item_review_override_set',
  'inventory:production_confirm',
  'inventory:production_create',
  'inventory:read',
  'inventory:stocktake_complete',
  'inventory:stocktake_create',
  'inventory:stocktake_recount',
  'inventory:transfer_create',
  'inventory:transfer_receive',
  'inventory:waste_approve',
  'inventory:write',
  'inventory:writeoff',
  'kds:mark_ready',
  'kds:recall',
  'kds:use',
  'menu:read',
  'orders:read',
  'orders:void',
  'orders:write',
  'pos:apply_discount',
  'pos:close_shift',
  'pos:close_shift_variance_override',
  'pos:confirm_payment',
  'pos:open_cashbox',
  'pos:print',
  'pos:reprint_receipt',
  'pos:send_kitchen',
  'pos:use',
  'pos:void_order',
  'printer:manage',
  'procurement:grn_confirm',
  'procurement:grn_create',
  'procurement:override_code_rotate',
  'procurement:price_list_read',
  'procurement:read',
  'procurement:supplier_manage',
  'reports:export',
  'reports:view_branch',
  'settings:branch',
  'staff:view',
  'supplier_return:confirm',
  'supplier_return:create',
  'supplier_return:read'
]::text[]);

ALTER TABLE public.permission_keys
ALTER COLUMN is_delegable_to_staff SET DEFAULT false;
ALTER TABLE public.permission_keys
ALTER COLUMN is_delegable_to_staff SET NOT NULL;

COMMENT ON COLUMN public.permission_keys.is_delegable_to_staff
IS 'Fail-closed PBAC boundary. False means Owner-only even if a staff grant row exists.';

UPDATE public.role_templates rt
SET permission_keys = ARRAY(
      SELECT DISTINCT permission_key
      FROM unnest(rt.permission_keys) AS template_key(permission_key)
      JOIN public.permission_keys permission
        ON permission.key = template_key.permission_key
      WHERE permission.is_delegable_to_staff = true
        AND template_key.permission_key <> ALL (ARRAY[
          'hr:view_employee',
          'hr:approve_checkout',
          'hr:approve_leave_request'
        ]::text[])
      ORDER BY permission_key
    ),
    updated_at = now()
WHERE rt.position_code IS DISTINCT FROM 'owner';

UPDATE public.role_templates rt
SET permission_keys = ARRAY(
      SELECT DISTINCT permission_key
      FROM unnest(
        rt.permission_keys
        || ARRAY[
          'hr:approve_checkout',
          'hr:approve_leave_request',
          'hr:view_employee'
        ]::text[]
      ) AS permission_key
      ORDER BY permission_key
    ),
    updated_at = now()
WHERE rt.position_code = 'branch_manager';

CREATE TEMP TABLE canonical_branch_manager_default_permission_keys (
  key text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO canonical_branch_manager_default_permission_keys (key)
VALUES
  ('dashboard:view'),
  ('hr:approve_checkout'),
  ('hr:approve_leave_request'),
  ('hr:request_leave'),
  ('hr:view_employee'),
  ('inventory:adjust_approve'),
  ('inventory:count_approve'),
  ('inventory:count_assign'),
  ('inventory:grn_express_extend'),
  ('inventory:item_review_override_set'),
  ('inventory:production_confirm'),
  ('inventory:production_create'),
  ('inventory:read'),
  ('inventory:stocktake_complete'),
  ('inventory:stocktake_create'),
  ('inventory:stocktake_recount'),
  ('inventory:transfer_create'),
  ('inventory:transfer_receive'),
  ('inventory:waste_approve'),
  ('inventory:write'),
  ('inventory:writeoff'),
  ('kds:mark_ready'),
  ('kds:recall'),
  ('kds:use'),
  ('menu:read'),
  ('orders:read'),
  ('orders:void'),
  ('orders:write'),
  ('pos:apply_discount'),
  ('pos:close_shift'),
  ('pos:close_shift_variance_override'),
  ('pos:confirm_payment'),
  ('pos:open_cashbox'),
  ('pos:print'),
  ('pos:reprint_receipt'),
  ('pos:send_kitchen'),
  ('pos:use'),
  ('pos:void_order'),
  ('printer:manage'),
  ('procurement:grn_confirm'),
  ('procurement:grn_create'),
  ('procurement:override_code_rotate'),
  ('procurement:price_list_read'),
  ('procurement:read'),
  ('procurement:supplier_manage'),
  ('reports:export'),
  ('reports:view_branch'),
  ('settings:branch'),
  ('staff:view'),
  ('supplier_return:confirm'),
  ('supplier_return:create'),
  ('supplier_return:read');

DO $$
DECLARE
  v_invalid_default_keys text;
BEGIN
  SELECT string_agg(default_key.key, ', ' ORDER BY default_key.key)
  INTO v_invalid_default_keys
  FROM canonical_branch_manager_default_permission_keys default_key
  LEFT JOIN public.permission_keys permission
    ON permission.key = default_key.key
  WHERE permission.key IS NULL
     OR permission.is_delegable_to_staff IS DISTINCT FROM true;

  IF v_invalid_default_keys IS NOT NULL THEN
    RAISE EXCEPTION
      'canonical_staff_template_default_invalid: %',
      v_invalid_default_keys
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- A tenant with no templates is a minimal bootstrap state. Partial template
-- sets still fail the exact-count gate and require an explicit Owner review.
WITH empty_template_tenants AS (
  SELECT tenant.id
  FROM public.tenants tenant
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.role_templates template
    WHERE template.tenant_id = tenant.id
  )
)
INSERT INTO public.role_templates (
  tenant_id,
  name,
  position_code,
  permission_keys,
  is_system,
  updated_at
)
SELECT
  po.tenant_id,
  po.code,
  po.code,
  CASE
    WHEN po.code = 'owner' THEN ARRAY(
      SELECT permission.key
      FROM public.permission_keys permission
      ORDER BY permission.key
    )
    WHEN po.code = 'branch_manager' THEN ARRAY(
      SELECT permission.key
      FROM public.permission_keys permission
      JOIN canonical_branch_manager_default_permission_keys default_key
        ON default_key.key = permission.key
      WHERE permission.is_delegable_to_staff = true
      ORDER BY permission.key
    )
    WHEN po.code = 'cashier' THEN ARRAY(
      SELECT permission.key
      FROM public.permission_keys permission
      WHERE permission.key IN (
        'hr:request_leave',
        'orders:read',
        'orders:void',
        'orders:write',
        'pos:close_shift',
        'pos:confirm_payment',
        'pos:open_cashbox',
        'pos:print',
        'pos:reprint_receipt',
        'pos:send_kitchen',
        'pos:use',
        'pos:void_order'
      )
      ORDER BY permission.key
    )
    WHEN po.code = 'chef' THEN ARRAY(
      SELECT permission.key
      FROM public.permission_keys permission
      WHERE permission.key IN (
        'hr:request_leave',
        'kds:mark_ready',
        'kds:use'
      )
      ORDER BY permission.key
    )
    WHEN po.code IN (
      'kitchen_counter',
      'kitchen_helper',
      'grill_counter'
    ) THEN COALESCE(
      (
        SELECT chef_template.permission_keys
        FROM public.role_templates chef_template
        WHERE chef_template.tenant_id = po.tenant_id
          AND chef_template.position_code = 'chef'
        ORDER BY chef_template.id
        LIMIT 1
      ),
      ARRAY(
        SELECT permission.key
        FROM public.permission_keys permission
        WHERE permission.key IN ('kds:use', 'hr:request_leave')
        ORDER BY permission.key
      )
    )
    ELSE ARRAY(
      SELECT permission.key
      FROM public.permission_keys permission
      WHERE permission.key = 'hr:request_leave'
    )
  END,
  true,
  now()
FROM public.positions po
JOIN empty_template_tenants empty_tenant
  ON empty_tenant.id = po.tenant_id
WHERE COALESCE(po.is_active, true) = true
  AND po.code IN (
    'owner',
    'branch_manager',
    'cashier',
    'chef',
    'kitchen_counter',
    'kitchen_helper',
    'grill_counter',
    'cleaner',
    'guard'
  )
ON CONFLICT (name, tenant_id) DO NOTHING;

-- Every assignable kitchen/support position owns an exact permission template.
-- Kitchen variants inherit the chef bundle; cleaner and guard receive only
-- the employee self-service leave capability.
INSERT INTO public.role_templates (
  tenant_id,
  name,
  position_code,
  permission_keys,
  is_system,
  updated_at
)
SELECT
  po.tenant_id,
  po.code,
  po.code,
  CASE
    WHEN po.code IN (
      'kitchen_counter',
      'kitchen_helper',
      'grill_counter'
    ) THEN COALESCE(
      (
        SELECT chef_template.permission_keys
        FROM public.role_templates chef_template
        WHERE chef_template.tenant_id = po.tenant_id
          AND chef_template.position_code = 'chef'
        ORDER BY chef_template.id
        LIMIT 1
      ),
      ARRAY(
        SELECT permission.key
        FROM public.permission_keys permission
        WHERE permission.key IN ('kds:use', 'hr:request_leave')
        ORDER BY permission.key
      )
    )
    ELSE ARRAY(
      SELECT permission.key
      FROM public.permission_keys permission
      WHERE permission.key = 'hr:request_leave'
    )
  END,
  true,
  now()
FROM public.positions po
WHERE COALESCE(po.is_active, true) = true
  AND po.code IN (
    'kitchen_counter',
    'kitchen_helper',
    'grill_counter',
    'cleaner',
    'guard'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_templates exact_template
    WHERE exact_template.tenant_id = po.tenant_id
      AND exact_template.position_code = po.code
  )
ON CONFLICT (name, tenant_id) DO NOTHING;

DO $$
DECLARE
  v_invalid_templates text;
BEGIN
  SELECT string_agg(
    format('%s:%s:%s', po.tenant_id, po.code, template_count),
    ', ' ORDER BY po.tenant_id, po.code
  )
  INTO v_invalid_templates
  FROM public.positions po
  CROSS JOIN LATERAL (
    SELECT count(*) AS template_count
    FROM public.role_templates rt
    WHERE rt.tenant_id = po.tenant_id
      AND rt.position_code = po.code
  ) exact_templates
  WHERE COALESCE(po.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) IS NOT NULL
    AND exact_templates.template_count <> 1;

  IF v_invalid_templates IS NOT NULL THEN
    RAISE EXCEPTION
      'canonical_position_template_count_invalid: %',
      v_invalid_templates
      USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by
)
SELECT
  pr.id,
  pr.tenant_id,
  pr.branch_id,
  permission_key,
  rt.id,
  owner_profile.id
FROM public.profiles pr
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
JOIN public.role_templates rt
  ON rt.tenant_id = pr.tenant_id
 AND rt.position_code = 'branch_manager'
CROSS JOIN LATERAL unnest(
  ARRAY[
    'hr:approve_checkout',
    'hr:approve_leave_request',
    'hr:view_employee'
  ]::text[]
) AS permission_key
LEFT JOIN LATERAL (
  SELECT owner_pr.id
  FROM public.profiles owner_pr
  JOIN public.positions owner_po
    ON owner_po.id = owner_pr.position_id
   AND owner_po.tenant_id = owner_pr.tenant_id
  WHERE owner_pr.tenant_id = pr.tenant_id
    AND owner_po.code = 'owner'
    AND COALESCE(owner_pr.is_active, true) = true
  ORDER BY owner_pr.created_at
  LIMIT 1
) AS owner_profile ON true
WHERE po.code = 'branch_manager'
  AND pr.branch_id IS NOT NULL
  AND COALESCE(pr.is_active, true) = true
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id bigint, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.auth_is_owner(auth.uid())
    OR EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        JOIN public.profiles pr
          ON pr.id = sp.user_id
         AND pr.tenant_id = sp.tenant_id
        JOIN public.positions po
          ON po.id = pr.position_id
         AND po.tenant_id = pr.tenant_id
        JOIN public.permission_keys pk ON pk.key = sp.permission_key
        WHERE sp.user_id = auth.uid()
          AND pr.tenant_id = public.auth_tenant_id()
          AND COALESCE(pr.is_active, true) = true
          AND COALESCE(po.is_active, true) = true
          AND sp.permission_key = p_key
          AND pk.is_delegable_to_staff = true
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
          AND CASE pk.scope
            WHEN 'tenant' THEN sp.branch_id IS NULL
            WHEN 'branch' THEN
              p_branch_id IS NOT NULL
              AND sp.branch_id = p_branch_id
              AND pr.branch_id = p_branch_id
            ELSE
              sp.branch_id IS NULL
              OR (
                p_branch_id IS NOT NULL
                AND sp.branch_id = p_branch_id
                AND pr.branch_id = p_branch_id
              )
          END
          AND (
            p_key <> ALL (ARRAY[
              'hr:approve_checkout',
              'hr:approve_leave_request'
            ]::text[])
            OR (
              private.staff_role_from_position_code(po.code) = 'branch_manager'
              AND p_branch_id IS NOT NULL
              AND pr.branch_id = p_branch_id
              AND sp.branch_id = p_branch_id
            )
          )
      )
$$;

CREATE OR REPLACE FUNCTION public.has_permission_any(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.auth_is_owner(auth.uid())
    OR EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        JOIN public.profiles pr
          ON pr.id = sp.user_id
         AND pr.tenant_id = sp.tenant_id
        JOIN public.positions po
          ON po.id = pr.position_id
         AND po.tenant_id = pr.tenant_id
        JOIN public.permission_keys pk ON pk.key = sp.permission_key
        WHERE sp.user_id = auth.uid()
          AND pr.tenant_id = public.auth_tenant_id()
          AND COALESCE(pr.is_active, true) = true
          AND COALESCE(po.is_active, true) = true
          AND sp.permission_key = p_key
          AND pk.is_delegable_to_staff = true
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
          AND CASE pk.scope
            WHEN 'tenant' THEN sp.branch_id IS NULL
            WHEN 'branch' THEN sp.branch_id IS NOT NULL AND sp.branch_id = pr.branch_id
            ELSE sp.branch_id IS NULL OR sp.branch_id = pr.branch_id
          END
          AND (
            p_key <> ALL (ARRAY[
              'hr:approve_checkout',
              'hr:approve_leave_request'
            ]::text[])
            OR (
              private.staff_role_from_position_code(po.code) = 'branch_manager'
              AND pr.branch_id IS NOT NULL
              AND sp.branch_id = pr.branch_id
            )
          )
      )
$$;

REVOKE ALL ON FUNCTION public.has_permission(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(bigint, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_permission_any(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission_any(text) TO authenticated, service_role;

DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_select_authorized ON public.profiles;
CREATE POLICY profiles_select_authorized
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    id = auth.uid()
    OR public.auth_is_owner(auth.uid())
    OR (
      branch_id IS NOT NULL
      AND branch_id = public.auth_branch_id()
      AND public.has_permission(branch_id, 'staff:view')
    )
  )
);

CREATE OR REPLACE FUNCTION private.can_view_leave_entitlement(
  p_employee_id bigint,
  p_tenant_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.profiles pr
        ON pr.id = e.profile_id
       AND pr.tenant_id = e.tenant_id
      WHERE e.id = p_employee_id
        AND e.tenant_id = p_tenant_id
        AND (
          e.profile_id = auth.uid()
          OR public.auth_is_owner(auth.uid())
          OR (
            pr.branch_id IS NOT NULL
            AND pr.branch_id = public.auth_branch_id()
            AND public.has_permission(
              pr.branch_id,
              'hr:approve_leave_request'
            )
          )
        )
    )
$$;

REVOKE ALL ON FUNCTION private.can_view_leave_entitlement(bigint, bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_leave_entitlement(bigint, bigint)
TO authenticated, service_role;

COMMENT ON FUNCTION private.can_view_leave_entitlement(bigint, bigint)
IS 'RLS-safe self, Owner, or exact-branch Branch Manager entitlement visibility without exposing salary-bearing employee rows.';

DROP POLICY IF EXISTS annual_leave_entitlements_select ON public.annual_leave_entitlements;
CREATE POLICY annual_leave_entitlements_select
ON public.annual_leave_entitlements
FOR SELECT
TO authenticated
USING (
  private.can_view_leave_entitlement(employee_id, tenant_id)
);

DROP POLICY IF EXISTS leave_requests_select ON public.leave_requests;
CREATE POLICY leave_requests_select
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = leave_requests.employee_id
        AND e.tenant_id = leave_requests.tenant_id
        AND e.profile_id = auth.uid()
    )
    OR public.has_permission(NULL, 'hr:view_employee')
    OR public.has_permission(branch_id, 'hr:approve_leave_request')
  )
);

DROP POLICY IF EXISTS leave_requests_manager_update ON public.leave_requests;

CREATE OR REPLACE FUNCTION private.enforce_leave_review_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_branch bigint;
  v_requester_id uuid;
  v_requester_role text;
  v_requester_branch bigint;
BEGIN
  IF OLD.status IS DISTINCT FROM 'pending'
     OR NEW.status NOT IN ('approved', 'rejected')
     OR v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT private.staff_role_from_position_code(po.code), pr.branch_id
  INTO v_actor_role, v_actor_branch
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE pr.id = v_actor_id
    AND pr.tenant_id = NEW.tenant_id
    AND COALESCE(pr.is_active, true) = true
    AND COALESCE(po.is_active, true) = true;

  SELECT
    e.profile_id,
    private.staff_role_from_position_code(po.code),
    pr.branch_id
  INTO v_requester_id, v_requester_role, v_requester_branch
  FROM public.employees e
  JOIN public.profiles pr
    ON pr.id = e.profile_id
   AND pr.tenant_id = e.tenant_id
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE e.id = NEW.employee_id
    AND e.tenant_id = NEW.tenant_id;

  IF v_actor_id = v_requester_id THEN
    RAISE EXCEPTION 'cannot_review_own_leave_request' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role = 'owner' THEN
    RETURN NEW;
  END IF;

  IF v_actor_role <> 'branch_manager'
     OR v_actor_branch IS DISTINCT FROM NEW.branch_id
     OR v_requester_branch IS DISTINCT FROM NEW.branch_id
     OR v_requester_role NOT IN ('cashier', 'chef', 'branch_staff')
     OR NOT public.has_permission(NEW.branch_id, 'hr:approve_leave_request') THEN
    RAISE EXCEPTION 'leave_review_not_allowed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_leave_review_authority ON public.leave_requests;
CREATE TRIGGER trg_enforce_leave_review_authority
BEFORE UPDATE OF status ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION private.enforce_leave_review_authority();

REVOKE ALL ON FUNCTION private.enforce_leave_review_authority()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.leave_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.leave_requests TO authenticated;
REVOKE ALL ON SEQUENCE public.leave_requests_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_leave_review_queue(
  p_branch_id bigint,
  p_include_rows boolean DEFAULT true
)
RETURNS TABLE (
  pending_count bigint,
  rows jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tenant_id bigint;
  v_actor_role text;
  v_actor_branch_id bigint;
  v_is_owner boolean := false;
BEGIN
  IF v_actor_id IS NULL OR p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'leave_review_queue_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT
    pr.tenant_id,
    private.staff_role_from_position_code(po.code),
    pr.branch_id
  INTO v_tenant_id, v_actor_role, v_actor_branch_id
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE pr.id = v_actor_id
    AND COALESCE(pr.is_active, true) = true
    AND COALESCE(po.is_active, true) = true;

  IF v_tenant_id IS NULL OR v_actor_role IS NULL THEN
    RAISE EXCEPTION 'leave_review_queue_not_allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = v_tenant_id
      AND b.branch_kind = 'branch'
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'leave_review_queue_branch_not_allowed' USING ERRCODE = '42501';
  END IF;

  v_is_owner :=
    v_actor_role = 'owner'
    AND public.auth_is_owner(v_actor_id);

  IF NOT v_is_owner AND (
    v_actor_role <> 'branch_manager'
    OR v_actor_branch_id IS DISTINCT FROM p_branch_id
    OR NOT public.has_permission(
      p_branch_id,
      'hr:approve_leave_request'
    )
  ) THEN
    RAISE EXCEPTION 'leave_review_queue_not_allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH visible_requests AS MATERIALIZED (
    SELECT
      lr.id,
      lr.status,
      lr.start_date,
      lr.end_date,
      lr.leave_type,
      lr.reason,
      lr.rejected_reason,
      lr.created_at,
      lr.reviewed_at,
      lr.branch_id,
      e.id AS employee_id,
      e.employee_code,
      e.start_date AS employee_start_date,
      requester_profile.full_name AS employee_full_name,
      requester_position.code AS position_code
    FROM public.leave_requests lr
    JOIN public.employees e
      ON e.id = lr.employee_id
     AND e.tenant_id = lr.tenant_id
    JOIN public.profiles requester_profile
      ON requester_profile.id = e.profile_id
     AND requester_profile.tenant_id = e.tenant_id
    LEFT JOIN public.positions requester_position
      ON requester_position.id = requester_profile.position_id
     AND requester_position.tenant_id = requester_profile.tenant_id
    WHERE lr.tenant_id = v_tenant_id
      AND lr.branch_id = p_branch_id
      AND (
        v_is_owner
        OR (
          requester_profile.branch_id = p_branch_id
          AND private.staff_role_from_position_code(requester_position.code)
            IN ('cashier', 'chef', 'branch_staff')
        )
      )
  ), limited_requests AS (
    SELECT *
    FROM visible_requests
    ORDER BY start_date DESC, created_at DESC
    LIMIT 100
  )
  SELECT
    count(*) FILTER (WHERE request.status = 'pending')::bigint,
    CASE
      WHEN p_include_rows THEN COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', limited.id,
              'status', limited.status,
              'start_date', limited.start_date,
              'end_date', limited.end_date,
              'leave_type', limited.leave_type,
              'reason', limited.reason,
              'rejected_reason', limited.rejected_reason,
              'created_at', limited.created_at,
              'reviewed_at', limited.reviewed_at,
              'branch_id', limited.branch_id,
              'employee_id', limited.employee_id,
              'employee_code', limited.employee_code,
              'employee_start_date', limited.employee_start_date,
              'employee_full_name', limited.employee_full_name,
              'position_code', limited.position_code,
              'approved_annual_ranges',
                CASE
                  WHEN limited.leave_type = 'annual' THEN COALESCE(
                    (
                      SELECT jsonb_agg(
                        jsonb_build_object(
                          'start_date', approved.start_date,
                          'end_date', approved.end_date
                        )
                        ORDER BY approved.start_date, approved.end_date
                      )
                      FROM public.leave_requests approved
                      WHERE approved.tenant_id = v_tenant_id
                        AND approved.employee_id = limited.employee_id
                        AND approved.leave_type = 'annual'
                        AND approved.status = 'approved'
                        AND approved.start_date <= make_date(
                          EXTRACT(YEAR FROM limited.start_date)::integer,
                          12,
                          31
                        )
                        AND approved.end_date >= make_date(
                          EXTRACT(YEAR FROM limited.start_date)::integer,
                          1,
                          1
                        )
                    ),
                    '[]'::jsonb
                  )
                  ELSE '[]'::jsonb
                END
            )
            ORDER BY limited.start_date DESC, limited.created_at DESC
          )
          FROM limited_requests limited
        ),
        '[]'::jsonb
      )
      ELSE '[]'::jsonb
    END
  FROM visible_requests request;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leave_review_queue(bigint, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leave_review_queue(bigint, boolean)
TO authenticated;

COMMENT ON FUNCTION public.get_leave_review_queue(bigint, boolean)
IS 'Returns an authenticated exact-branch leave-review projection without exposing salary, payroll, contract, insurance, bank, or identity-document fields.';

CREATE OR REPLACE FUNCTION public.get_checkout_review_queue(
  p_branch_id bigint,
  p_include_rows boolean DEFAULT true
)
RETURNS TABLE (
  pending_count bigint,
  rows jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tenant_id bigint;
  v_actor_role text;
  v_actor_branch_id bigint;
  v_is_owner boolean := false;
BEGIN
  IF v_actor_id IS NULL OR p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'checkout_review_queue_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT
    actor_profile.tenant_id,
    private.staff_role_from_position_code(actor_position.code),
    actor_profile.branch_id
  INTO v_tenant_id, v_actor_role, v_actor_branch_id
  FROM public.profiles actor_profile
  JOIN public.positions actor_position
    ON actor_position.id = actor_profile.position_id
   AND actor_position.tenant_id = actor_profile.tenant_id
  WHERE actor_profile.id = v_actor_id
    AND COALESCE(actor_profile.is_active, true) = true
    AND COALESCE(actor_position.is_active, true) = true;

  IF v_tenant_id IS NULL OR v_actor_role IS NULL THEN
    RAISE EXCEPTION 'checkout_review_queue_not_allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches branch_row
    WHERE branch_row.id = p_branch_id
      AND branch_row.tenant_id = v_tenant_id
      AND branch_row.branch_kind = 'branch'
      AND COALESCE(branch_row.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'checkout_review_queue_branch_not_allowed' USING ERRCODE = '42501';
  END IF;

  v_is_owner :=
    v_actor_role = 'owner'
    AND public.auth_is_owner(v_actor_id);

  IF NOT v_is_owner AND (
    v_actor_role <> 'branch_manager'
    OR v_actor_branch_id IS DISTINCT FROM p_branch_id
    OR NOT public.has_permission(p_branch_id, 'hr:approve_checkout')
  ) THEN
    RAISE EXCEPTION 'checkout_review_queue_not_allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH visible_requests AS MATERIALIZED (
    SELECT
      attendance.id,
      attendance.date,
      attendance.branch_id,
      attendance.check_in,
      attendance.checkout_requested_at,
      attendance.checkout_requested_by_role,
      attendance.checkout_approval_target_roles,
      attendance.employee_id,
      branch_row.name AS branch_name,
      employee.employee_code,
      requester_profile.full_name AS employee_full_name,
      private.staff_role_from_position_code(requester_position.code)
        AS requester_role,
      shift_row.name AS shift_name,
      shift_row.start_time AS shift_start_time,
      shift_row.end_time AS shift_end_time
    FROM public.attendance_records attendance
    JOIN public.employees employee
      ON employee.id = attendance.employee_id
     AND employee.tenant_id = attendance.tenant_id
    JOIN public.profiles requester_profile
      ON requester_profile.id = employee.profile_id
     AND requester_profile.tenant_id = employee.tenant_id
    JOIN public.positions requester_position
      ON requester_position.id = requester_profile.position_id
     AND requester_position.tenant_id = requester_profile.tenant_id
    JOIN public.branches branch_row
      ON branch_row.id = attendance.branch_id
     AND branch_row.tenant_id = attendance.tenant_id
    LEFT JOIN public.shifts shift_row
      ON shift_row.id = attendance.shift_id
     AND shift_row.tenant_id = attendance.tenant_id
    WHERE attendance.tenant_id = v_tenant_id
      AND attendance.branch_id = p_branch_id
      AND attendance.check_out IS NULL
      AND attendance.checkout_requested_at IS NOT NULL
      AND requester_profile.branch_id = attendance.branch_id
      AND requester_profile.id <> v_actor_id
      AND COALESCE(employee.is_active, true) = true
      AND COALESCE(requester_profile.is_active, true) = true
      AND COALESCE(requester_position.is_active, true) = true
      AND (
        (v_is_owner AND private.staff_role_from_position_code(requester_position.code) = 'branch_manager')
        OR (
          NOT v_is_owner
          AND private.staff_role_from_position_code(requester_position.code)
            IN ('cashier', 'chef', 'branch_staff')
        )
      )
  ), limited_requests AS (
    SELECT *
    FROM visible_requests
    ORDER BY checkout_requested_at, id
    LIMIT 100
  )
  SELECT
    count(*)::bigint,
    CASE
      WHEN p_include_rows THEN COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', limited.id,
              'date', limited.date,
              'branch_id', limited.branch_id,
              'check_in', limited.check_in,
              'checkout_requested_at', limited.checkout_requested_at,
              'checkout_requested_by_role', limited.checkout_requested_by_role,
              'checkout_approval_target_roles', limited.checkout_approval_target_roles,
              'employee_id', limited.employee_id,
              'branch_name', limited.branch_name,
              'employee_code', limited.employee_code,
              'employee_full_name', limited.employee_full_name,
              'requester_role', limited.requester_role,
              'shift_name', limited.shift_name,
              'shift_start_time', limited.shift_start_time,
              'shift_end_time', limited.shift_end_time,
              'checklist', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', checklist_item.id,
                      'title', checklist_item.title,
                      'is_done', checklist_item.is_done,
                      'is_required', checklist_item.is_required
                    )
                    ORDER BY checklist_item.sort_order, checklist_item.id
                  )
                  FROM public.attendance_checklist_items checklist_item
                  WHERE checklist_item.attendance_record_id = limited.id
                    AND checklist_item.tenant_id = v_tenant_id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY limited.checkout_requested_at, limited.id
          )
          FROM limited_requests limited
        ),
        '[]'::jsonb
      )
      ELSE '[]'::jsonb
    END
  FROM visible_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_review_queue(bigint, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_review_queue(bigint, boolean)
TO authenticated;

COMMENT ON FUNCTION public.get_checkout_review_queue(bigint, boolean)
IS 'Returns only checkout requests actionable by the live exact-branch hierarchy: Branch Manager reviews current staff; Owner reviews the current Branch Manager.';

CREATE OR REPLACE FUNCTION private.enforce_owner_position_task_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.auth_is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'owner_required_for_position_task_write' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_owner_position_task_write ON public.position_shift_tasks;
CREATE TRIGGER trg_enforce_owner_position_task_write
BEFORE INSERT OR UPDATE OR DELETE ON public.position_shift_tasks
FOR EACH ROW
EXECUTE FUNCTION private.enforce_owner_position_task_write();

REVOKE ALL ON FUNCTION private.enforce_owner_position_task_write()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_inventory_production_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT public.auth_role() IN ('owner', 'branch_manager')
$$;

COMMENT ON FUNCTION public.is_inventory_production_operator()
IS 'Canonical application-role guard for Inventory production surfaces.';

CREATE OR REPLACE FUNCTION public.sync_missing_permissions_from_template()
RETURNS TABLE(rows_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_profile record;
  v_permission record;
  v_added integer := 0;
  v_rows integer;
BEGIN
  FOR v_profile IN
    SELECT
      pr.id AS user_id,
      pr.tenant_id,
      pr.branch_id,
      po.code AS position_code,
      private.staff_role_from_position_code(po.code) AS user_role
    FROM public.profiles pr
    JOIN public.positions po
      ON po.id = pr.position_id
     AND po.tenant_id = pr.tenant_id
    WHERE COALESCE(pr.is_active, true) = true
      AND COALESCE(po.is_active, true) = true
  LOOP
    IF v_profile.user_role IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_permission IN
      SELECT
        rt.id AS template_id,
        pk.key AS permission_key,
        CASE
          WHEN pk.scope = 'tenant' THEN NULL::bigint
          ELSE v_profile.branch_id
        END AS grant_branch_id
      FROM public.role_templates rt
      CROSS JOIN LATERAL unnest(rt.permission_keys) AS perm(permission_key)
      JOIN public.permission_keys pk ON pk.key = perm.permission_key
      WHERE rt.tenant_id = v_profile.tenant_id
        AND rt.position_code = v_profile.position_code
    LOOP
      IF v_permission.grant_branch_id IS NULL
         AND EXISTS (
           SELECT 1
           FROM public.permission_keys pk
           WHERE pk.key = v_permission.permission_key
             AND pk.scope = 'branch'
         ) THEN
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
        v_permission.grant_branch_id,
        v_permission.permission_key,
        v_permission.template_id
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

DO $$
DECLARE
  v_active_assignments text;
  v_unscoped_assignments text;
  v_manual_permission_drift text;
  v_owner_template_grants text;
  v_cross_template_permissions text;
BEGIN
  SELECT string_agg(
    format('%s:%s', pr.id, po.code),
    ', ' ORDER BY po.code, pr.id
  )
  INTO v_active_assignments
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE COALESCE(pr.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) IS NULL;

  IF v_active_assignments IS NOT NULL THEN
    RAISE EXCEPTION
      'active_unmapped_position_requires_explicit_reassignment: %',
      v_active_assignments
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%s:%s', pr.id, po.code),
    ', ' ORDER BY po.code, pr.id
  )
  INTO v_unscoped_assignments
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE COALESCE(pr.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) IS NOT NULL
    AND private.staff_role_from_position_code(po.code) <> 'owner'
    AND pr.branch_id IS NULL;

  IF v_unscoped_assignments IS NOT NULL THEN
    RAISE EXCEPTION
      'active_operational_position_requires_branch: %',
      v_unscoped_assignments
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%s:%s:%s', sp.user_id, sp.permission_key, po.code),
    ', ' ORDER BY sp.user_id, sp.permission_key
  )
  INTO v_manual_permission_drift
  FROM public.staff_permissions sp
  JOIN public.profiles pr
    ON pr.id = sp.user_id
   AND pr.tenant_id = sp.tenant_id
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  JOIN public.role_templates current_template
    ON current_template.tenant_id = pr.tenant_id
   AND current_template.position_code = po.code
  WHERE sp.source_template IS NULL
    AND private.staff_role_from_position_code(po.code) IS NOT NULL
    AND (
      COALESCE(pr.is_active, true) = false
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(current_template.permission_keys) AS expected_key(permission_key)
        JOIN public.permission_keys expected_permission
          ON expected_permission.key = expected_key.permission_key
        WHERE expected_key.permission_key = sp.permission_key
          AND sp.branch_id IS NOT DISTINCT FROM CASE
            WHEN expected_permission.scope = 'tenant' THEN NULL::bigint
            WHEN private.staff_role_from_position_code(po.code) = 'owner'
              THEN NULL::bigint
            ELSE pr.branch_id
          END
      )
    );

  IF v_manual_permission_drift IS NOT NULL THEN
    RAISE EXCEPTION
      'manual_permission_outside_canonical_template_requires_review: %',
      v_manual_permission_drift
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%s:%s', sp.user_id, sp.permission_key),
    ', ' ORDER BY sp.user_id, sp.permission_key
  )
  INTO v_owner_template_grants
  FROM public.staff_permissions sp
  JOIN public.profiles pr
    ON pr.id = sp.user_id
   AND pr.tenant_id = sp.tenant_id
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  JOIN public.role_templates source_template
    ON source_template.id = sp.source_template
   AND source_template.tenant_id = sp.tenant_id
  WHERE COALESCE(pr.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) <> 'owner'
    AND source_template.position_code = 'owner';

  IF v_owner_template_grants IS NOT NULL THEN
    RAISE EXCEPTION
      'owner_template_grant_to_non_owner_requires_revoke: %',
      v_owner_template_grants
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format(
      '%s:%s:%s<-%s',
      sp.user_id,
      sp.permission_key,
      po.code,
      source_template.position_code
    ),
    ', ' ORDER BY sp.user_id, sp.permission_key
  )
  INTO v_cross_template_permissions
  FROM public.staff_permissions sp
  JOIN public.profiles pr
    ON pr.id = sp.user_id
   AND pr.tenant_id = sp.tenant_id
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  JOIN public.role_templates current_template
    ON current_template.tenant_id = pr.tenant_id
   AND current_template.position_code = po.code
  JOIN public.role_templates source_template
    ON source_template.id = sp.source_template
   AND source_template.tenant_id = sp.tenant_id
  WHERE COALESCE(pr.is_active, true) = true
    AND source_template.id IS DISTINCT FROM current_template.id
    AND source_template.position_code IS NOT NULL
    AND private.staff_role_from_position_code(source_template.position_code) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.permission_audit_log audit_row
      JOIN public.profiles actor_profile
        ON actor_profile.id = audit_row.actor_user_id
       AND actor_profile.tenant_id = audit_row.tenant_id
      JOIN public.positions actor_position
        ON actor_position.id = actor_profile.position_id
       AND actor_position.tenant_id = actor_profile.tenant_id
      WHERE audit_row.tenant_id = sp.tenant_id
        AND audit_row.target_user_id = sp.user_id
        AND audit_row.branch_id IS NOT DISTINCT FROM sp.branch_id
        AND audit_row.permission_key = sp.permission_key
        AND audit_row.action = 'apply_template'
        AND audit_row.source_template_id = sp.source_template
        AND actor_position.code = 'owner'
    );

  IF v_cross_template_permissions IS NOT NULL THEN
    RAISE EXCEPTION
      'canonical_cross_template_permission_without_owner_audit: %',
      v_cross_template_permissions
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TEMP TABLE mismatched_template_permissions ON COMMIT DROP AS
SELECT
  sp.id,
  sp.user_id,
  sp.tenant_id,
  sp.branch_id,
  sp.permission_key,
  sp.source_template,
  source_template.name AS source_template_name,
  source_template.position_code AS source_position_code,
  po.code AS current_position_code,
  COALESCE(owner_profile.id, sp.granted_by, sp.user_id) AS audit_actor_id
FROM public.staff_permissions sp
JOIN public.profiles pr
  ON pr.id = sp.user_id
 AND pr.tenant_id = sp.tenant_id
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
JOIN public.role_templates current_template
  ON current_template.tenant_id = pr.tenant_id
 AND current_template.position_code = po.code
LEFT JOIN public.role_templates source_template
  ON source_template.id = sp.source_template
 AND source_template.tenant_id = sp.tenant_id
LEFT JOIN LATERAL (
  SELECT owner_pr.id
  FROM public.profiles owner_pr
  JOIN public.positions owner_po
    ON owner_po.id = owner_pr.position_id
   AND owner_po.tenant_id = owner_pr.tenant_id
  WHERE owner_pr.tenant_id = sp.tenant_id
    AND owner_po.code = 'owner'
    AND COALESCE(owner_pr.is_active, true) = true
  ORDER BY owner_pr.created_at
  LIMIT 1
) owner_profile ON true
WHERE private.staff_role_from_position_code(po.code) IS NOT NULL
  AND (
    COALESCE(pr.is_active, true) = false
    OR (
      sp.source_template IS NOT NULL
      AND source_template.position_code IS NOT NULL
      AND source_template.position_code <> 'archived_staff'
      AND private.staff_role_from_position_code(source_template.position_code) IS NULL
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.permission_keys assigned_permission
      WHERE assigned_permission.key = sp.permission_key
        AND sp.branch_id IS NOT DISTINCT FROM CASE
          WHEN assigned_permission.scope = 'tenant' THEN NULL::bigint
          WHEN private.staff_role_from_position_code(po.code) = 'owner'
            THEN sp.branch_id
          ELSE pr.branch_id
        END
    )
    OR (
      private.staff_role_from_position_code(po.code) <> 'owner'
      AND EXISTS (
        SELECT 1
        FROM public.permission_keys assigned_permission
        WHERE assigned_permission.key = sp.permission_key
          AND assigned_permission.is_delegable_to_staff = false
      )
    )
    OR (
      sp.permission_key = ANY (ARRAY[
        'hr:approve_checkout',
        'hr:approve_leave_request'
      ]::text[])
      AND private.staff_role_from_position_code(po.code) <> 'branch_manager'
      AND private.staff_role_from_position_code(po.code) <> 'owner'
    )
    OR (
      (
        sp.source_template IS NULL
        OR sp.source_template = current_template.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(current_template.permission_keys) AS expected_key(permission_key)
        JOIN public.permission_keys expected_permission
          ON expected_permission.key = expected_key.permission_key
        WHERE expected_key.permission_key = sp.permission_key
          AND sp.branch_id IS NOT DISTINCT FROM CASE
            WHEN expected_permission.scope = 'tenant' THEN NULL::bigint
            WHEN private.staff_role_from_position_code(po.code) = 'owner'
              THEN NULL::bigint
            ELSE pr.branch_id
          END
      )
    )
  );

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
  stale.tenant_id,
  stale.audit_actor_id,
  stale.user_id,
  stale.branch_id,
  stale.permission_key,
  'revoke',
  stale.source_template,
  jsonb_build_object(
    'reason', 'position_template_reconciled',
    'source_template_name', stale.source_template_name,
    'source_position_code', stale.source_position_code,
    'current_position_code', stale.current_position_code
  )
FROM mismatched_template_permissions stale;

DELETE FROM public.staff_permissions permission_row
USING mismatched_template_permissions stale
WHERE permission_row.id = stale.id;

WITH inserted_grants AS (
  INSERT INTO public.staff_permissions (
    user_id,
    tenant_id,
    branch_id,
    permission_key,
    source_template,
    granted_by
  )
  SELECT
    pr.id,
    pr.tenant_id,
    CASE
      WHEN permission.scope = 'tenant' THEN NULL::bigint
      ELSE pr.branch_id
    END,
    permission.key,
    rt.id,
    owner_profile.id
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  JOIN public.role_templates rt
    ON rt.tenant_id = pr.tenant_id
   AND rt.position_code = po.code
  CROSS JOIN LATERAL unnest(rt.permission_keys) AS template_key(permission_key)
  JOIN public.permission_keys permission
    ON permission.key = template_key.permission_key
  LEFT JOIN LATERAL (
    SELECT owner_pr.id
    FROM public.profiles owner_pr
    JOIN public.positions owner_po
      ON owner_po.id = owner_pr.position_id
     AND owner_po.tenant_id = owner_pr.tenant_id
    WHERE owner_pr.tenant_id = pr.tenant_id
      AND owner_po.code = 'owner'
      AND COALESCE(owner_pr.is_active, true) = true
    ORDER BY owner_pr.created_at
    LIMIT 1
  ) owner_profile ON true
  WHERE COALESCE(pr.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) IS NOT NULL
    AND private.staff_role_from_position_code(po.code) <> 'owner'
  ON CONFLICT DO NOTHING
  RETURNING
    user_id,
    tenant_id,
    branch_id,
    permission_key,
    source_template,
    granted_by
)
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
  inserted.tenant_id,
  COALESCE(inserted.granted_by, inserted.user_id),
  inserted.user_id,
  inserted.branch_id,
  inserted.permission_key,
  'grant',
  inserted.source_template,
  jsonb_build_object('reason', 'position_template_reconciled')
FROM inserted_grants inserted;

CREATE TEMP TABLE legacy_profile_assignments ON COMMIT DROP AS
SELECT
  pr.id AS user_id,
  pr.tenant_id,
  pr.position_id,
  pr.branch_id,
  COALESCE(pr.is_active, true) AS was_active,
  po.code AS position_code
FROM public.profiles pr
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
WHERE private.staff_role_from_position_code(po.code) IS NULL
  AND po.code <> 'archived_staff';

INSERT INTO public.positions (
  tenant_id,
  code,
  label_vi,
  label_en,
  is_active,
  is_system
)
SELECT DISTINCT
  legacy.tenant_id,
  'archived_staff',
  'Nhân sự đã lưu trữ',
  'Archived staff',
  false,
  true
FROM legacy_profile_assignments legacy
ON CONFLICT (code, tenant_id) DO UPDATE
SET label_vi = EXCLUDED.label_vi,
    label_en = EXCLUDED.label_en,
    is_active = false,
    is_system = true;

INSERT INTO public.audit_logs (
  tenant_id,
  user_id,
  action,
  entity_type,
  old_data,
  new_data
)
SELECT
  legacy.tenant_id,
  owner_profile.id,
  'archive_legacy_profile_assignment',
  'profile_assignment',
  jsonb_build_object(
    'profile_id', legacy.user_id,
    'position_id', legacy.position_id,
    'position_code', legacy.position_code,
    'branch_id', legacy.branch_id,
    'is_active', legacy.was_active
  ),
  jsonb_build_object(
    'position_code', 'archived_staff',
    'branch_id', NULL,
    'is_active', false
  )
FROM legacy_profile_assignments legacy
LEFT JOIN LATERAL (
  SELECT owner_pr.id
  FROM public.profiles owner_pr
  JOIN public.positions owner_po
    ON owner_po.id = owner_pr.position_id
   AND owner_po.tenant_id = owner_pr.tenant_id
  WHERE owner_pr.tenant_id = legacy.tenant_id
    AND owner_po.code = 'owner'
    AND COALESCE(owner_pr.is_active, true) = true
  ORDER BY owner_pr.created_at
  LIMIT 1
) owner_profile ON true;

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
  owner_profile.id,
  sp.user_id,
  sp.branch_id,
  sp.permission_key,
  'revoke',
  sp.source_template,
  jsonb_build_object(
    'reason', 'retired_position_archived',
    'position_code', legacy.position_code
  )
FROM public.staff_permissions sp
JOIN legacy_profile_assignments legacy ON legacy.user_id = sp.user_id
JOIN LATERAL (
  SELECT owner_pr.id
  FROM public.profiles owner_pr
  JOIN public.positions owner_po
    ON owner_po.id = owner_pr.position_id
   AND owner_po.tenant_id = owner_pr.tenant_id
  WHERE owner_pr.tenant_id = legacy.tenant_id
    AND owner_po.code = 'owner'
    AND COALESCE(owner_pr.is_active, true) = true
  ORDER BY owner_pr.created_at
  LIMIT 1
) owner_profile ON true;

DELETE FROM public.staff_permissions sp
USING legacy_profile_assignments legacy
WHERE sp.user_id = legacy.user_id
  AND sp.tenant_id = legacy.tenant_id;

UPDATE public.employees e
SET is_active = false,
    updated_at = now()
FROM legacy_profile_assignments legacy
WHERE e.profile_id = legacy.user_id
  AND e.tenant_id = legacy.tenant_id;

UPDATE public.profiles pr
SET position_id = archived.id,
    branch_id = NULL,
    is_active = false,
    updated_at = now()
FROM legacy_profile_assignments legacy
JOIN public.positions archived
  ON archived.tenant_id = legacy.tenant_id
 AND archived.code = 'archived_staff'
WHERE pr.id = legacy.user_id
  AND pr.tenant_id = legacy.tenant_id;

UPDATE auth.users au
SET banned_until = 'infinity'::timestamptz,
    raw_app_meta_data = COALESCE(au.raw_app_meta_data, '{}'::jsonb)
      - ARRAY[
        'tenant_id',
        'branch_id',
        'position_code',
        'position',
        'access_bucket',
        'user_role',
        'role',
        'provisioned_by'
      ]::text[]
FROM legacy_profile_assignments legacy
WHERE au.id = legacy.user_id;

DELETE FROM auth.sessions session_row
USING legacy_profile_assignments legacy
WHERE session_row.user_id = legacy.user_id;

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  - ARRAY[
    'tenant_id',
    'branch_id',
    'position_code',
    'position',
    'access_bucket',
    'user_role',
    'role',
    'provisioned_by'
  ]::text[];

DELETE FROM public.position_shift_tasks task
USING public.positions po
WHERE task.position_id = po.id
  AND task.tenant_id = po.tenant_id
  AND private.staff_role_from_position_code(po.code) IS NULL
  AND po.code <> 'archived_staff';

UPDATE public.permission_audit_log audit_row
SET metadata = audit_row.metadata || jsonb_build_object(
  'archived_source_template_id', rt.id,
  'archived_source_template_name', rt.name,
  'archived_source_position_code', rt.position_code
)
FROM public.role_templates rt
WHERE audit_row.source_template_id = rt.id
  AND rt.position_code IS NOT NULL
  AND private.staff_role_from_position_code(rt.position_code) IS NULL
  AND rt.position_code <> 'archived_staff';

INSERT INTO public.audit_logs (
  tenant_id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_data
)
SELECT
  rt.tenant_id,
  owner_profile.id,
  'archive_legacy_role_template',
  'role_template',
  rt.id,
  jsonb_build_object(
    'name', rt.name,
    'position_code', rt.position_code,
    'permission_keys', rt.permission_keys,
    'is_system', rt.is_system,
    'created_at', rt.created_at,
    'updated_at', rt.updated_at
  )
FROM public.role_templates rt
LEFT JOIN LATERAL (
  SELECT owner_pr.id
  FROM public.profiles owner_pr
  JOIN public.positions owner_po
    ON owner_po.id = owner_pr.position_id
   AND owner_po.tenant_id = owner_pr.tenant_id
  WHERE owner_pr.tenant_id = rt.tenant_id
    AND owner_po.code = 'owner'
    AND COALESCE(owner_pr.is_active, true) = true
  ORDER BY owner_pr.created_at
  LIMIT 1
) owner_profile ON true
WHERE rt.position_code IS NOT NULL
  AND private.staff_role_from_position_code(rt.position_code) IS NULL
  AND rt.position_code <> 'archived_staff';

DELETE FROM public.role_templates
WHERE position_code IS NOT NULL
  AND private.staff_role_from_position_code(position_code) IS NULL
  AND position_code <> 'archived_staff';

DELETE FROM public.positions
WHERE private.staff_role_from_position_code(code) IS NULL
  AND code <> 'archived_staff';

CREATE OR REPLACE FUNCTION private.enforce_staff_permission_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target_position text;
  v_target_branch_id bigint;
  v_source_position text;
  v_permission_scope text;
  v_is_delegable_to_staff boolean;
BEGIN
  SELECT po.code, pr.branch_id
  INTO v_target_position, v_target_branch_id
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE pr.id = NEW.user_id
    AND pr.tenant_id = NEW.tenant_id;

  IF v_target_position IS NULL
     OR private.staff_role_from_position_code(v_target_position) IS NULL THEN
    RAISE EXCEPTION 'permission_target_position_not_canonical'
      USING ERRCODE = '23514';
  END IF;

  SELECT scope, is_delegable_to_staff
  INTO v_permission_scope, v_is_delegable_to_staff
  FROM public.permission_keys
  WHERE key = NEW.permission_key;

  IF v_permission_scope IS NULL THEN
    RAISE EXCEPTION 'permission_key_not_canonical'
      USING ERRCODE = '23514';
  END IF;

  IF v_permission_scope = 'tenant' AND NEW.branch_id IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_permission_cannot_have_branch'
      USING ERRCODE = '23514';
  END IF;

  IF v_permission_scope = 'branch'
     AND private.staff_role_from_position_code(v_target_position) <> 'owner'
     AND NEW.branch_id IS DISTINCT FROM v_target_branch_id THEN
    RAISE EXCEPTION 'branch_permission_must_match_profile_branch'
      USING ERRCODE = '23514';
  END IF;

  IF private.staff_role_from_position_code(v_target_position) <> 'owner'
     AND v_is_delegable_to_staff = false THEN
    RAISE EXCEPTION 'owner_only_permission_cannot_be_delegated'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.permission_key = ANY (ARRAY[
       'hr:approve_checkout',
       'hr:approve_leave_request'
     ]::text[])
     AND private.staff_role_from_position_code(v_target_position)
       <> 'branch_manager' THEN
    RAISE EXCEPTION 'approval_permission_requires_branch_manager'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.source_template IS NOT NULL THEN
    SELECT rt.position_code
    INTO v_source_position
    FROM public.role_templates rt
    WHERE rt.id = NEW.source_template
      AND rt.tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'permission_source_template_not_in_tenant'
        USING ERRCODE = '23514';
    END IF;

    IF private.staff_role_from_position_code(v_target_position) <> 'owner'
       AND v_source_position = 'owner' THEN
      RAISE EXCEPTION 'owner_template_cannot_be_applied_to_staff'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_staff_permission_boundary()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_permissions_enforce_boundary
ON public.staff_permissions;
CREATE TRIGGER trg_staff_permissions_enforce_boundary
BEFORE INSERT OR UPDATE OF
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template
ON public.staff_permissions
FOR EACH ROW
EXECUTE FUNCTION private.enforce_staff_permission_boundary();

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_templates_tenant_position_code
ON public.role_templates (tenant_id, position_code)
WHERE position_code IS NOT NULL;

REVOKE ALL ON TABLE public.positions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.positions TO authenticated;
REVOKE ALL ON SEQUENCE public.positions_id_seq FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.role_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.role_templates TO authenticated;
REVOKE ALL ON SEQUENCE public.role_templates_id_seq FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.permission_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.permission_keys TO authenticated;

REVOKE ALL ON TABLE public.permission_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.permission_audit_log TO authenticated;
REVOKE ALL ON SEQUENCE public.permission_audit_log_id_seq FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.staff_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.staff_permissions TO authenticated;
REVOKE ALL ON SEQUENCE public.staff_permissions_id_seq FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url, birth_date) ON TABLE public.profiles TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON TABLES FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_shift_checklist_template(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_template_id bigint,
  p_name text,
  p_items jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_template_id bigint;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_item jsonb;
  v_title text;
  v_phase text;
  v_done_definition text;
  v_is_required boolean;
  v_scope text;
  v_task_kind text;
  v_sort integer := 0;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'template_name_required' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'template_name_too_long' USING ERRCODE = '23514';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'checklist_items_invalid' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_items) > 40 THEN
    RAISE EXCEPTION 'checklist_too_many_items' USING ERRCODE = '23514';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.shift_checklist_templates (
      tenant_id,
      branch_id,
      name,
      is_active
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      v_name,
      true
    )
    RETURNING id INTO v_template_id;
  ELSE
    SELECT id
    INTO v_template_id
    FROM public.shift_checklist_templates
    WHERE id = p_template_id
      AND tenant_id = p_tenant_id
      AND branch_id IS NOT DISTINCT FROM p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.shift_checklist_templates
    SET name = v_name,
        is_active = true
    WHERE id = v_template_id;
  END IF;

  DELETE FROM public.shift_checklist_template_items
  WHERE tenant_id = p_tenant_id
    AND template_id = v_template_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_title := btrim(COALESCE(v_item ->> 'title', ''));
    v_phase := COALESCE(NULLIF(v_item ->> 'phase', ''), 'during_shift');
    v_done_definition := btrim(
      COALESCE(
        v_item ->> 'doneDefinition',
        v_item ->> 'done_definition',
        ''
      )
    );
    v_is_required := COALESCE(
      NULLIF(v_item ->> 'isRequired', '')::boolean,
      NULLIF(v_item ->> 'is_required', '')::boolean,
      true
    );
    v_scope := COALESCE(NULLIF(v_item ->> 'scope', ''), 'every_shift');
    v_task_kind := COALESCE(NULLIF(v_item ->> 'taskKind', ''), 'standard');

    IF v_title = '' THEN
      CONTINUE;
    END IF;

    IF char_length(v_title) > 120 THEN
      RAISE EXCEPTION 'checklist_item_too_long' USING ERRCODE = '23514';
    END IF;

    IF v_phase <> ALL (ARRAY['start_of_shift', 'during_shift', 'end_of_shift']::text[]) THEN
      RAISE EXCEPTION 'checklist_phase_invalid' USING ERRCODE = '23514';
    END IF;

    IF v_scope <> ALL (ARRAY['every_shift', 'opening', 'closing', 'weekly']::text[]) THEN
      RAISE EXCEPTION 'checklist_scope_invalid' USING ERRCODE = '23514';
    END IF;

    IF v_task_kind <> ALL (ARRAY['standard', 'consumption_report']::text[]) THEN
      RAISE EXCEPTION 'checklist_task_kind_invalid' USING ERRCODE = '23514';
    END IF;

    IF char_length(v_done_definition) > 240 THEN
      RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE = '23514';
    END IF;

    v_sort := v_sort + 1;

    INSERT INTO public.shift_checklist_template_items (
      tenant_id,
      template_id,
      title,
      phase,
      done_definition,
      is_required,
      scope,
      task_kind,
      sort_order,
      is_active
    )
    VALUES (
      p_tenant_id,
      v_template_id,
      v_title,
      v_phase,
      v_done_definition,
      v_is_required,
      v_scope,
      v_task_kind,
      v_sort,
      true
    );
  END LOOP;

  IF v_sort = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
  END IF;

  RETURN v_template_id;
END;
$$;

DROP FUNCTION IF EXISTS public.apply_checklist_template_to_role(bigint, text, text);
DROP INDEX IF EXISTS public.idx_shift_checklist_templates_tenant_branch_role;
ALTER TABLE public.shift_checklist_templates DROP COLUMN IF EXISTS role_code;

-- Checkout approval is the canonical attendance close path. Remove the retired
-- QR/code verification flag only after every live writer stops referencing it.
CREATE OR REPLACE FUNCTION public.force_close_stale_attendance(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_approved_by uuid,
  p_note text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_record_date date;
  v_shift_start time;
  v_shift_end time;
  v_shift_end_at timestamp;
  v_requester_id uuid;
  v_requester_role text;
  v_approver_role text;
  v_now_local timestamp := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_business_date date := v_now_local::date;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_approved_by THEN
    RAISE EXCEPTION 'not_authenticated_or_mismatch' USING ERRCODE = '28000';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.auth_tenant_id()
     OR NOT EXISTS (
       SELECT 1
       FROM public.branches branch_row
       WHERE branch_row.id = p_branch_id
         AND branch_row.tenant_id = p_tenant_id
         AND branch_row.branch_kind = 'branch'
         AND COALESCE(branch_row.is_active, true) = true
     ) THEN
    RAISE EXCEPTION 'force_close_scope_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT
    ar.check_in,
    ar.date,
    s.start_time,
    s.end_time,
    e.profile_id,
    private.staff_role_from_position_code(po.code)
  INTO
    v_check_in,
    v_record_date,
    v_shift_start,
    v_shift_end,
    v_requester_id,
    v_requester_role
  FROM public.attendance_records ar
  LEFT JOIN public.shifts s
    ON s.id = ar.shift_id
   AND s.tenant_id = ar.tenant_id
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  JOIN public.profiles pr
    ON pr.id = e.profile_id
   AND pr.tenant_id = e.tenant_id
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND pr.branch_id = ar.branch_id
    AND ar.check_in IS NOT NULL
    AND ar.check_out IS NULL
    AND COALESCE(e.is_active, true) = true
    AND COALESCE(pr.is_active, true) = true
    AND COALESCE(po.is_active, true) = true
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_shift_start IS NULL OR v_shift_end IS NULL THEN
    IF v_record_date >= v_business_date THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_shift_end_at := v_record_date + v_shift_end;
    IF v_shift_end <= v_shift_start THEN
      v_shift_end_at := v_shift_end_at + INTERVAL '1 day';
    END IF;

    IF v_now_local < v_shift_end_at THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF NOT public.has_permission(p_branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  v_approver_role := public.auth_role();

  IF v_uid = v_requester_id THEN
    RAISE EXCEPTION 'cannot_force_close_own_attendance' USING ERRCODE = '42501';
  END IF;

  IF v_approver_role = 'branch_manager' THEN
    IF v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN
      RAISE EXCEPTION 'force_close_hierarchy_not_allowed' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role <> 'owner' THEN
    RAISE EXCEPTION 'force_close_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET check_out = v_check_in,
      checkout_approved_at = now(),
      checkout_approved_by = p_approved_by,
      checkout_approval_note = COALESCE(
        NULLIF(btrim(p_note), ''),
        'Force closed: Quên kết ca trong ngày (không tính công)'
      ),
      updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  RETURNING check_out INTO v_check_out;

  RETURN v_check_out;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_force_close_attendance(
  bigint,
  bigint,
  bigint,
  uuid,
  text
);

REVOKE ALL ON FUNCTION public.force_close_stale_attendance(
  bigint,
  bigint,
  bigint,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_close_stale_attendance(
  bigint,
  bigint,
  bigint,
  uuid,
  text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.force_close_stale_attendance(
  bigint,
  bigint,
  bigint,
  uuid,
  text
)
IS 'Exact-branch stale attendance close for Owner or Branch Manager, with self and role-hierarchy guards.';

CREATE OR REPLACE FUNCTION public.employee_request_clock_out(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_attendance_id bigint
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_record public.attendance_records%ROWTYPE;
  v_count_remaining integer;
  v_requested_at timestamptz;
  v_employee_name text;
  v_requester_role text;
  v_target_roles text[];
  v_now_local timestamp := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_calendar_date date := v_now_local::date;
BEGIN
  SELECT ar.*
  INTO v_record
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.employee_id = p_employee_id
    AND ar.branch_id = p.branch_id
    AND ar.date BETWEEN v_calendar_date - 1 AND v_calendar_date
    AND ar.check_out IS NULL
    AND COALESCE(e.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer
  INTO v_count_remaining
  FROM (
    SELECT a.location_id
    FROM public.inventory_count_assignments a
    WHERE a.tenant_id = p_tenant_id
      AND a.branch_id = v_record.branch_id
      AND a.employee_id = p_employee_id
      AND a.is_active
    GROUP BY a.location_id
  ) assigned
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.inventory_count_slips s
    WHERE s.tenant_id = p_tenant_id
      AND s.branch_id = v_record.branch_id
      AND s.employee_id = p_employee_id
      AND s.location_id = assigned.location_id
      AND s.count_date = v_record.date
      AND s.status IN ('submitted', 'approved')
  );

  IF v_count_remaining > 0 THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  IF v_record.checkout_requested_at IS NOT NULL THEN
    RETURN v_record.checkout_requested_at;
  END IF;

  v_requested_at := now();

  SELECT p.full_name, private.staff_role_from_position_code(po.code)
  INTO v_employee_name, v_requester_role
  FROM public.employees e
  LEFT JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id;

  v_requester_role := COALESCE(v_requester_role, 'unassigned');
  v_target_roles := CASE
    WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner']::text[]
    WHEN v_requester_role IN ('cashier', 'chef', 'branch_staff')
      THEN ARRAY['branch_manager']::text[]
    ELSE ARRAY['owner']::text[]
  END;

  UPDATE public.attendance_records
  SET checkout_requested_at = v_requested_at,
      checkout_requested_by_role = v_requester_role,
      checkout_approval_target_roles = v_target_roles,
      updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND branch_id = v_record.branch_id
    AND date = v_record.date
    AND check_out IS NULL;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    meta,
    dedup_key
  )
  VALUES (
    p_tenant_id,
    v_record.branch_id,
    v_target_roles,
    'attendance.checkout_requested',
    'info',
    'Yêu cầu duyệt kết ca',
    format(
      '%s đã gửi yêu cầu kết ca lúc %s.',
      COALESCE(v_employee_name, 'Nhân viên'),
      to_char(v_requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
    ),
    'attendance_record',
    p_attendance_id,
    format('/br/%s/shift/checkout-approvals', v_record.branch_id),
    jsonb_build_object(
      'attendance_id', p_attendance_id,
      'employee_id', p_employee_id,
      'requester_role', v_requester_role,
      'approval_target_roles', to_jsonb(v_target_roles),
      'branch_id', v_record.branch_id,
      'business_date', v_record.date,
      'requested_at', v_requested_at
    ),
    format('attendance.checkout_request:%s', p_attendance_id)
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    created_at = EXCLUDED.created_at,
    expires_at = NULL,
    meta = EXCLUDED.meta;

  RETURN v_requested_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_employee_clock_out(
  p_attendance_id bigint,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  branch_id bigint,
  check_out timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tenant_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_actor_branch_id bigint;
  v_actor_role text;
  v_branch_id bigint;
  v_requested_at timestamptz;
  v_check_out timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT
    actor_profile.tenant_id,
    actor_profile.branch_id,
    private.staff_role_from_position_code(actor_position.code)
  INTO v_tenant_id, v_actor_branch_id, v_actor_role
  FROM public.profiles actor_profile
  JOIN public.positions actor_position
    ON actor_position.id = actor_profile.position_id
   AND actor_position.tenant_id = actor_profile.tenant_id
  WHERE actor_profile.id = v_actor_id
    AND COALESCE(actor_profile.is_active, true) = true
    AND COALESCE(actor_position.is_active, true) = true;

  IF v_tenant_id IS NULL
     OR v_actor_role IS NULL
     OR v_actor_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT
    requester_profile.id,
    private.staff_role_from_position_code(requester_position.code),
    attendance.branch_id,
    attendance.checkout_requested_at
  INTO
    v_requester_profile_id,
    v_requester_role,
    v_branch_id,
    v_requested_at
  FROM public.attendance_records attendance
  JOIN public.employees employee
    ON employee.id = attendance.employee_id
   AND employee.tenant_id = attendance.tenant_id
  JOIN public.profiles requester_profile
    ON requester_profile.id = employee.profile_id
   AND requester_profile.tenant_id = employee.tenant_id
  JOIN public.positions requester_position
    ON requester_position.id = requester_profile.position_id
   AND requester_position.tenant_id = requester_profile.tenant_id
  JOIN public.branches branch_row
    ON branch_row.id = attendance.branch_id
   AND branch_row.tenant_id = attendance.tenant_id
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL
    AND requester_profile.branch_id = attendance.branch_id
    AND branch_row.branch_kind = 'branch'
    AND COALESCE(branch_row.is_active, true) = true
    AND COALESCE(employee.is_active, true) = true
    AND COALESCE(requester_profile.is_active, true) = true
    AND COALESCE(requester_position.is_active, true) = true
  FOR UPDATE OF attendance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requester_profile_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  IF v_requester_role = 'branch_manager' THEN
    IF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor_id) THEN
      RAISE EXCEPTION 'checkout_requires_upper_manager' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_actor_branch_id IS DISTINCT FROM v_branch_id THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;

    IF v_requester_role IS NULL
       OR v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN
      RAISE EXCEPTION 'branch_manager_can_only_approve_branch_staff' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor_id) THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records AS attendance_row
  SET check_out = v_requested_at,
      checkout_approved_at = now(),
      checkout_approved_by = v_actor_id,
      checkout_approval_note = NULLIF(btrim(p_note), ''),
      updated_at = now()
  WHERE attendance_row.id = p_attendance_id
    AND attendance_row.tenant_id = v_tenant_id
    AND attendance_row.branch_id = v_branch_id
    AND attendance_row.check_out IS NULL
  RETURNING attendance_row.check_out INTO v_check_out;

  RETURN QUERY SELECT v_branch_id, v_check_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_employee_clock_out(
  p_attendance_id bigint,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  branch_id bigint,
  rejected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tenant_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_actor_branch_id bigint;
  v_actor_role text;
  v_branch_id bigint;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT
    actor_profile.tenant_id,
    actor_profile.branch_id,
    private.staff_role_from_position_code(actor_position.code)
  INTO v_tenant_id, v_actor_branch_id, v_actor_role
  FROM public.profiles actor_profile
  JOIN public.positions actor_position
    ON actor_position.id = actor_profile.position_id
   AND actor_position.tenant_id = actor_profile.tenant_id
  WHERE actor_profile.id = v_actor_id
    AND COALESCE(actor_profile.is_active, true) = true
    AND COALESCE(actor_position.is_active, true) = true;

  IF v_tenant_id IS NULL
     OR v_actor_role IS NULL
     OR v_actor_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT
    requester_profile.id,
    private.staff_role_from_position_code(requester_position.code),
    attendance.branch_id
  INTO v_requester_profile_id, v_requester_role, v_branch_id
  FROM public.attendance_records attendance
  JOIN public.employees employee
    ON employee.id = attendance.employee_id
   AND employee.tenant_id = attendance.tenant_id
  JOIN public.profiles requester_profile
    ON requester_profile.id = employee.profile_id
   AND requester_profile.tenant_id = employee.tenant_id
  JOIN public.positions requester_position
    ON requester_position.id = requester_profile.position_id
   AND requester_position.tenant_id = requester_profile.tenant_id
  JOIN public.branches branch_row
    ON branch_row.id = attendance.branch_id
   AND branch_row.tenant_id = attendance.tenant_id
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL
    AND requester_profile.branch_id = attendance.branch_id
    AND branch_row.branch_kind = 'branch'
    AND COALESCE(branch_row.is_active, true) = true
    AND COALESCE(employee.is_active, true) = true
    AND COALESCE(requester_profile.is_active, true) = true
    AND COALESCE(requester_position.is_active, true) = true
  FOR UPDATE OF attendance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requester_profile_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  IF v_requester_role = 'branch_manager' THEN
    IF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor_id) THEN
      RAISE EXCEPTION 'checkout_requires_upper_manager' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_actor_branch_id IS DISTINCT FROM v_branch_id THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;

    IF v_requester_role IS NULL
       OR v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN
      RAISE EXCEPTION 'branch_manager_can_only_approve_branch_staff' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor_id) THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records AS attendance_row
  SET checkout_requested_at = NULL,
      checkout_requested_by_role = NULL,
      checkout_approval_target_roles = ARRAY[]::text[],
      checkout_approval_note = NULLIF(btrim(p_note), ''),
      updated_at = now()
  WHERE attendance_row.id = p_attendance_id
    AND attendance_row.tenant_id = v_tenant_id
    AND attendance_row.branch_id = v_branch_id
    AND attendance_row.check_out IS NULL
    AND attendance_row.checkout_requested_at IS NOT NULL;

  RETURN QUERY SELECT v_branch_id, true;
END;
$$;

DROP FUNCTION IF EXISTS public.branch_manager_approve_employee_clock_out(
  bigint,
  bigint,
  bigint,
  uuid,
  text
);
DROP FUNCTION IF EXISTS public.branch_manager_reject_employee_clock_out(
  bigint,
  bigint,
  bigint,
  uuid,
  text
);

REVOKE ALL ON FUNCTION public.approve_employee_clock_out(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_employee_clock_out(bigint, text)
TO authenticated;

REVOKE ALL ON FUNCTION public.reject_employee_clock_out(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_employee_clock_out(bigint, text)
TO authenticated;

COMMENT ON FUNCTION public.approve_employee_clock_out(bigint, text)
IS 'Authenticated checkout approval using live tenant, branch, position, self-review, and hierarchy checks.';

COMMENT ON FUNCTION public.reject_employee_clock_out(bigint, text)
IS 'Authenticated checkout rejection using live tenant, branch, position, self-review, and hierarchy checks.';

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'employee_clock_in_with_checklist'
  ORDER BY p.oid
  LIMIT 1;

  IF v_definition IS NOT NULL THEN
    v_definition := regexp_replace(
      v_definition,
      $pattern$method,\s*code_verified,\s*check_in_photo_path$pattern$,
      E'method,\n    check_in_photo_path',
      'g'
    );
    v_definition := regexp_replace(
      v_definition,
      $pattern$'pwa',\s*false,\s*p_photo_path$pattern$,
      E'''pwa'',\n    p_photo_path',
      'g'
    );
    EXECUTE v_definition;
  END IF;
END;
$$;

UPDATE public.attendance_records
SET method = 'manual'
WHERE method = 'admin';

ALTER TABLE public.attendance_records
DROP CONSTRAINT IF EXISTS attendance_records_method_check;
ALTER TABLE public.attendance_records
ADD CONSTRAINT attendance_records_method_check
CHECK (method IS NULL OR method IN ('pwa', 'manual'));

ALTER TABLE public.attendance_records
DROP COLUMN IF EXISTS code_verified,
DROP COLUMN IF EXISTS check_out_code_verified;

COMMENT ON COLUMN public.attendance_records.checkout_approval_target_roles
IS 'Canonical application roles allowed to review this checkout request.';

COMMENT ON COLUMN public.recipes.quantity
IS 'Recipe quantity expressed in entry_unit_id and converted through ingredient_units to the ingredient base ledger quantity.';

COMMENT ON COLUMN public.production_recipes.quantity
IS 'Production BOM quantity expressed in entry_unit_id and converted through ingredient_units to the ingredient base ledger quantity.';

COMMENT ON COLUMN public.stock_levels.current_quantity
IS 'Current ingredient base quantity at one canonical inventory location.';

COMMENT ON COLUMN public.stock_levels.location_id
IS 'Canonical inventory location that owns this stock balance.';

COMMENT ON COLUMN public.stock_movements.location_id
IS 'Canonical inventory location where this ledger movement is posted.';

COMMENT ON COLUMN public.stock_issues.source_location_id
IS 'Optional source inventory location for the issue workflow.';

COMMENT ON COLUMN public.stock_issues.target_location_id
IS 'Optional destination inventory location for internal handoff workflows.';

COMMENT ON COLUMN public.stock_transfers.from_location_id
IS 'Source inventory location selected for the transfer.';

COMMENT ON COLUMN public.stock_transfers.to_location_id
IS 'Destination inventory location selected for the transfer.';

COMMENT ON COLUMN public.stocktake_sessions.location_id
IS 'Optional inventory location scope for the stocktake session.';

COMMENT ON POLICY employees_select_self ON public.employees
IS 'Every authenticated user can read their own employee row; branch staff runtime lives under /br/[branchId]/shift.';

COMMENT ON INDEX public.idx_audit_logs_tenant_entity_created
IS 'Owner audit lookup by tenant, entity type, and descending creation time.';

DO $$
DECLARE
  policy_rename record;
BEGIN
  FOR policy_rename IN
    SELECT *
    FROM (
      VALUES
        (
          'permission_audit_log',
          'perm_audit_admin_view',
          'permission_audit_select_authorized'
        ),
        (
          'ingredient_category_review_policy',
          'policy_write_admin',
          'ingredient_category_review_policy_write_authorized'
        ),
        (
          'staff_permissions',
          'staff_permissions_select_admin',
          'staff_permissions_select_authorized'
        ),
        (
          'user_trust_score',
          'trust_score_read_own_or_admin',
          'trust_score_read_self_or_authorized'
        ),
        (
          'webhook_events',
          'webhook_events_select_admin',
          'webhook_events_select_finance'
        )
    ) AS rename_map(table_name, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_policies policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = policy_rename.table_name
        AND policy.policyname = policy_rename.old_name
    ) THEN
      IF EXISTS (
        SELECT 1
        FROM pg_policies policy
        WHERE policy.schemaname = 'public'
          AND policy.tablename = policy_rename.table_name
          AND policy.policyname = policy_rename.new_name
      ) THEN
        RAISE EXCEPTION
          'canonical_policy_name_conflict: %.% / %',
          policy_rename.table_name,
          policy_rename.old_name,
          policy_rename.new_name
          USING ERRCODE = '42710';
      END IF;

      EXECUTE format(
        'ALTER POLICY %I ON public.%I RENAME TO %I',
        policy_rename.old_name,
        policy_rename.table_name,
        policy_rename.new_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Normalize final catalog definitions that still embedded retired access
-- buckets. Function-name allowlists keep the rewrite narrow and auditable.
DO $$
DECLARE
  v_proc record;
  v_definition text;
BEGIN
  FOR v_proc IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'append_order_items',
        'apply_order_discount',
        'apply_order_item_discount',
        'approve_inventory_count_slip',
        'approve_leave_request',
        'cancel_order',
        'clear_order_discount',
        'clear_order_item_discount',
        'create_order',
        'edit_pending_order_item',
        'mark_order_item_served',
        'merge_orders',
        'reduce_order_item_quantity',
        'reject_leave_request',
        'release_branch_menu_daily_holds',
        'request_inventory_count_recount',
        'reserve_branch_menu_daily_holds',
        'set_order_service_charge',
        'set_pos_order_item_priority',
        'set_pos_order_priority',
        'split_order',
        'transfer_order_table',
        'update_pos_order_status',
        'void_order_item'
      ]::text[])
  LOOP
    v_definition := pg_get_functiondef(v_proc.oid);
    v_definition := replace(v_definition, '''office''', '''unassigned''');
    v_definition := replace(v_definition, '''waiter''', '''cashier''');
    EXECUTE v_definition;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_proc record;
  v_definition text;
BEGIN
  FOR v_proc IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'stock_transfer_confirm_receive',
        'stock_transfer_list_branches',
        'stock_transfer_mark_in_transit',
        'stock_transfer_receive'
      ]::text[])
  LOOP
    v_definition := pg_get_functiondef(v_proc.oid);
    v_definition := replace(
      v_definition,
      '''warehouse_manager''',
      '''branch_manager'''
    );
    v_definition := replace(
      v_definition,
      '''production_manager''',
      '''branch_manager'''
    );
    EXECUTE v_definition;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_proc record;
  v_definition text;
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'apply_template_to_user',
        'submit_inventory_count_slip',
        'trg_notify_order_new'
      ]::text[])
  LOOP
    v_definition := pg_get_functiondef(v_proc.oid);

    IF v_proc.proname = 'apply_template_to_user' THEN
      v_definition := replace(
        v_definition,
        '''warehouse_manager''',
        '''unassigned'''
      );
      v_definition := replace(
        v_definition,
        '''production_manager''',
        '''unassigned'''
      );
    ELSIF v_proc.proname = 'submit_inventory_count_slip' THEN
      v_definition := replace(
        v_definition,
        '''warehouse_manager''',
        '''owner'''
      );
    ELSE
      v_definition := replace(v_definition, '''waiter''', '''cashier''');
    END IF;

    EXECUTE v_definition;
  END LOOP;
END;
$$;

-- Remove the remaining legacy identifiers and route targets from persisted
-- function bodies. Each rewrite is allowlisted by function name and the final
-- catalog assertions below fail the migration if an expected replacement did
-- not match the deployed definition.
DO $$
DECLARE
  v_proc record;
  v_definition text;
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'check_branch_required',
        'check_cron_jobs_health',
        'scan_inventory_alerts',
        'submit_inventory_count_slip',
        'submit_leave_request',
        'trg_notify_grn_created',
        'trg_notify_po_sent',
        'trg_notify_pos_shift_variance',
        'trg_notify_stocktake_completed',
        'trg_notify_transfer_in_transit'
      ]::text[])
  LOOP
    v_definition := pg_get_functiondef(v_proc.oid);

    CASE v_proc.proname
      WHEN 'check_branch_required' THEN
        v_definition := replace(
          v_definition,
          'v_access_bucket',
          'v_user_role'
        );
      WHEN 'check_cron_jobs_health' THEN
        v_definition := replace(v_definition, '''admin''', '''owner''');
      WHEN 'scan_inventory_alerts' THEN
        v_definition := regexp_replace(
          v_definition,
          $pattern$format\('/inventory/stock\?ingredient=%s&branch=%s',\s*ing\.id,\s*sl\.branch_id\)$pattern$,
          $replacement$format('/br/%s/stock/on-hand/%s', sl.branch_id, ing.id)$replacement$,
          'g'
        );
      WHEN 'submit_inventory_count_slip' THEN
        v_definition := replace(
          v_definition,
          '''/inventory/count-slips''',
          'format(''/br/%s/stock/count-slips'', p_branch_id)'
        );
      WHEN 'submit_leave_request' THEN
        v_definition := replace(
          v_definition,
          'v_requester_bucket',
          'v_requester_role'
        );
        v_definition := replace(
          v_definition,
          'requester_bucket',
          'requester_role'
        );
        v_definition := replace(
          v_definition,
          'access bucket',
          'application role'
        );
        v_definition := replace(
          v_definition,
          '''/hr''',
          'format(''/br/%s/shift/leave-approvals'', p_branch_id)'
        );
      WHEN 'trg_notify_grn_created' THEN
        v_definition := replace(
          v_definition,
          'format(''/inventory/grn/%s'', NEW.id)',
          'format(''/br/%s/stock/grn/%s'', NEW.branch_id, NEW.id)'
        );
      WHEN 'trg_notify_po_sent' THEN
        v_definition := replace(
          v_definition,
          'format(''/inventory/purchase-orders/%s'', NEW.id)',
          'format(''/br/%s/stock/grn'', NEW.branch_id)'
        );
      WHEN 'trg_notify_pos_shift_variance' THEN
        v_definition := replace(
          v_definition,
          '''/br/%s/settings/pos-sessions?session=%s''',
          '''/br/%s/pos-sessions?session=%s'''
        );
      WHEN 'trg_notify_stocktake_completed' THEN
        v_definition := replace(
          v_definition,
          'format(''/inventory/stocktake/%s'', NEW.id)',
          'format(''/br/%s/stock/stocktake/%s'', NEW.branch_id, NEW.id)'
        );
      WHEN 'trg_notify_transfer_in_transit' THEN
        v_definition := replace(
          v_definition,
          'format(''/inventory/transfers/%s'', NEW.id)',
          'format(''/br/%s/stock/receive/%s'', NEW.to_branch_id, NEW.id)'
        );
      ELSE
        NULL;
    END CASE;

    EXECUTE v_definition;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.mark_order_item_served(bigint)
IS 'Marks one POS order item and its KDS ticket as served. Cashier and Branch Manager operation remains branch-scoped.';

COMMENT ON FUNCTION public.submit_leave_request(bigint, date, date, text, text)
IS 'Submits an exact-branch leave request and notifies canonical approver roles.';

COMMENT ON COLUMN public.order_items.cancel_reason
IS 'Reason entered by the authorized POS operator when an order item is cancelled.';

DELETE FROM public.notifications
WHERE NOT (
  target_roles && ARRAY[
    'owner',
    'branch_manager',
    'cashier',
    'chef',
    'branch_staff'
  ]::text[]
);

UPDATE public.notifications notification_row
SET target_roles = ARRAY(
  SELECT DISTINCT target_role
  FROM unnest(notification_row.target_roles) AS roles(target_role)
  WHERE target_role = ANY (ARRAY[
    'owner',
    'branch_manager',
    'cashier',
    'chef',
    'branch_staff'
  ]::text[])
  ORDER BY target_role
)
WHERE notification_row.target_roles IS DISTINCT FROM ARRAY(
  SELECT DISTINCT target_role
  FROM unnest(notification_row.target_roles) AS roles(target_role)
  WHERE target_role = ANY (ARRAY[
    'owner',
    'branch_manager',
    'cashier',
    'chef',
    'branch_staff'
  ]::text[])
  ORDER BY target_role
);

CREATE OR REPLACE FUNCTION private.canonicalize_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.target_roles := ARRAY(
    SELECT DISTINCT target_role
    FROM unnest(NEW.target_roles) AS roles(target_role)
    WHERE target_role = ANY (ARRAY[
      'owner',
      'branch_manager',
      'cashier',
      'chef',
      'branch_staff'
    ]::text[])
    ORDER BY target_role
  );

  IF cardinality(NEW.target_roles) = 0 THEN
    RAISE EXCEPTION 'notification_requires_canonical_target_role'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.target_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.action_url := CASE NEW.kind
    WHEN 'inventory.stock_low' THEN
      CASE WHEN NEW.entity_id IS NULL
        THEN format('/br/%s/stock', NEW.target_branch_id)
        ELSE format('/br/%s/stock/on-hand/%s', NEW.target_branch_id, NEW.entity_id)
      END
    WHEN 'workflow.grn_pending' THEN
      format('/br/%s/stock/grn/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'workflow.po_sent' THEN
      format('/br/%s/stock/grn', NEW.target_branch_id)
    WHEN 'inventory.count_slip_submitted' THEN
      format('/br/%s/stock/count-slips', NEW.target_branch_id)
    WHEN 'workflow.stocktake_submitted' THEN
      format('/br/%s/stock/stocktake/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'workflow.transfer_in_transit' THEN
      format('/br/%s/stock/receive/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      format('/br/%s/shift/leave-approvals', NEW.target_branch_id)
    WHEN 'attendance.checkout_requested' THEN
      format('/br/%s/shift/checkout-approvals', NEW.target_branch_id)
    WHEN 'inventory.count_slip_approved' THEN
      format('/br/%s/stock/count', NEW.target_branch_id)
    WHEN 'inventory.count_slip_recount' THEN
      format('/br/%s/stock/count', NEW.target_branch_id)
    WHEN 'hr.leave_approved' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'hr.leave_rejected' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'pos.shift_variance' THEN
      format('/br/%s/pos-sessions?session=%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'pos.payment_stock_failed' THEN
      format('/br/%s/orders', NEW.target_branch_id)
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_notification ON public.notifications;
CREATE TRIGGER trg_canonicalize_notification
BEFORE INSERT OR UPDATE OF target_branch_id, target_roles, kind, entity_id, action_url
ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION private.canonicalize_notification();

REVOKE ALL ON FUNCTION private.canonicalize_notification()
FROM PUBLIC, anon, authenticated;

UPDATE public.notifications
SET action_url = action_url
WHERE target_branch_id IS NOT NULL;

UPDATE public.notifications
SET meta = (meta - 'requester_bucket')
  || CASE
    WHEN meta ? 'requester_bucket'
      THEN jsonb_build_object('requester_role', meta -> 'requester_bucket')
    ELSE '{}'::jsonb
  END
WHERE meta ? 'requester_bucket';

UPDATE public.notifications
SET action_url = NULL
WHERE action_url LIKE '/inventory%'
   OR action_url = '/hr'
   OR action_url LIKE '/br/%/settings/pos-sessions%';

DO $$
DECLARE
  v_retired_roles text;
  v_legacy_identifiers text;
  v_legacy_routes text;
  v_unmapped_profiles text;
  v_invalid_templates text;
  v_invalid_notifications text;
  v_legacy_attendance text;
  v_legacy_policy_names text;
  v_permission_drift text;
BEGIN
  SELECT string_agg(
    format('%I.%I', n.nspname, p.proname),
    ', ' ORDER BY n.nspname, p.proname
  )
  INTO v_retired_roles
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('private', 'public')
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~
      '''(admin|office|accountant|technician|design_construction|head_chef|warehouse_manager|production_manager|central_supply_manager|central_kitchen_manager|cashier_server|waiter)''';

  IF v_retired_roles IS NOT NULL THEN
    RAISE EXCEPTION
      'retired_role_literal_remains_in_catalog: %',
      v_retired_roles
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%I.%I', n.nspname, p.proname),
    ', ' ORDER BY n.nspname, p.proname
  )
  INTO v_legacy_identifiers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('private', 'public')
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~ '\m(access_bucket|requester_bucket)\M';

  IF v_legacy_identifiers IS NOT NULL THEN
    RAISE EXCEPTION
      'legacy_auth_identifier_remains_in_catalog: %',
      v_legacy_identifiers
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%I.%I', n.nspname, p.proname),
    ', ' ORDER BY n.nspname, p.proname
  )
  INTO v_legacy_routes
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('private', 'public')
    AND p.prokind = 'f'
    AND (
      pg_get_functiondef(p.oid) ~ '''/inventory'
      OR pg_get_functiondef(p.oid) ~ '''/hr'''
      OR pg_get_functiondef(p.oid) ~ '/settings/pos-sessions'
    );

  IF v_legacy_routes IS NOT NULL THEN
    RAISE EXCEPTION
      'legacy_route_remains_in_catalog: %',
      v_legacy_routes
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%I.%I:%I', policy.schemaname, policy.tablename, policy.policyname),
    ', ' ORDER BY policy.tablename, policy.policyname
  )
  INTO v_legacy_policy_names
  FROM pg_policies policy
  WHERE policy.schemaname = 'public'
    AND policy.policyname ~* 'admin';

  IF v_legacy_policy_names IS NOT NULL THEN
    RAISE EXCEPTION
      'retired_policy_name_remains_in_catalog: %',
      v_legacy_policy_names
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%I.%I', n.nspname, p.proname),
    ', ' ORDER BY n.nspname, p.proname
  )
  INTO v_legacy_attendance
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('private', 'public')
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~ '\m(check_out_code_verified|code_verified)\M';

  IF v_legacy_attendance IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM information_schema.columns column_row
       WHERE column_row.table_schema = 'public'
         AND column_row.table_name = 'attendance_records'
         AND column_row.column_name IN (
           'code_verified',
           'check_out_code_verified'
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.attendance_records attendance_row
       WHERE attendance_row.method = 'admin'
     ) THEN
    RAISE EXCEPTION
      'legacy_attendance_verification_state_remains: %',
      COALESCE(v_legacy_attendance, '<table-state>')
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%s:%s', pr.id, po.code),
    ', ' ORDER BY po.code, pr.id
  )
  INTO v_unmapped_profiles
  FROM public.profiles pr
  JOIN public.positions po
    ON po.id = pr.position_id
   AND po.tenant_id = pr.tenant_id
  WHERE COALESCE(pr.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) IS NULL;

  IF v_unmapped_profiles IS NOT NULL THEN
    RAISE EXCEPTION
      'active_unmapped_profile_remains: %',
      v_unmapped_profiles
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%s:%s', rt.tenant_id, COALESCE(rt.position_code, '<null>')),
    ', ' ORDER BY rt.tenant_id, rt.position_code
  )
  INTO v_invalid_templates
  FROM public.role_templates rt
  WHERE (
      rt.position_code IS NOT NULL
      AND rt.position_code <> 'archived_staff'
      AND private.staff_role_from_position_code(rt.position_code) IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(rt.permission_keys) AS template_permission(permission_key)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.permission_keys permission
        WHERE permission.key = template_permission.permission_key
      )
    )
    OR (
      rt.position_code IS DISTINCT FROM 'owner'
      AND EXISTS (
        SELECT 1
        FROM unnest(rt.permission_keys) AS template_permission(permission_key)
        JOIN public.permission_keys permission
          ON permission.key = template_permission.permission_key
        WHERE permission.is_delegable_to_staff = false
      )
    )
    OR (
      rt.position_code NOT IN ('owner', 'branch_manager')
      AND rt.permission_keys && ARRAY[
        'hr:approve_checkout',
        'hr:approve_leave_request'
      ]::text[]
    );

  IF v_invalid_templates IS NOT NULL THEN
    RAISE EXCEPTION
      'invalid_role_template_remains: %',
      v_invalid_templates
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    format('%s:%s:%s', drift.user_id, drift.permission_key, drift.reason),
    ', ' ORDER BY drift.user_id, drift.permission_key, drift.reason
  )
  INTO v_permission_drift
  FROM (
    SELECT
      sp.user_id,
      sp.permission_key,
      'extra_or_wrong_scope'::text AS reason
    FROM public.staff_permissions sp
    JOIN public.profiles pr
      ON pr.id = sp.user_id
     AND pr.tenant_id = sp.tenant_id
    JOIN public.positions po
      ON po.id = pr.position_id
     AND po.tenant_id = pr.tenant_id
    JOIN public.role_templates rt
      ON rt.tenant_id = pr.tenant_id
     AND rt.position_code = po.code
    LEFT JOIN public.role_templates source_template
      ON source_template.id = sp.source_template
     AND source_template.tenant_id = sp.tenant_id
    WHERE private.staff_role_from_position_code(po.code) <> 'owner'
      AND (
        COALESCE(pr.is_active, true) = false
        OR (
          sp.source_template IS NOT NULL
          AND source_template.position_code IS NOT NULL
          AND source_template.position_code <> 'archived_staff'
          AND private.staff_role_from_position_code(source_template.position_code) IS NULL
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.permission_keys assigned_permission
          WHERE assigned_permission.key = sp.permission_key
            AND sp.branch_id IS NOT DISTINCT FROM CASE
              WHEN assigned_permission.scope = 'tenant' THEN NULL::bigint
              ELSE pr.branch_id
            END
        )
        OR EXISTS (
          SELECT 1
          FROM public.permission_keys assigned_permission
          WHERE assigned_permission.key = sp.permission_key
            AND assigned_permission.is_delegable_to_staff = false
        )
        OR (
          sp.permission_key = ANY (ARRAY[
            'hr:approve_checkout',
            'hr:approve_leave_request'
          ]::text[])
          AND private.staff_role_from_position_code(po.code)
            <> 'branch_manager'
        )
        OR (
          (
            sp.source_template IS NULL
            OR sp.source_template = rt.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(rt.permission_keys) AS expected_key(permission_key)
            JOIN public.permission_keys expected_permission
              ON expected_permission.key = expected_key.permission_key
            WHERE expected_key.permission_key = sp.permission_key
              AND sp.branch_id IS NOT DISTINCT FROM CASE
                WHEN expected_permission.scope = 'tenant' THEN NULL::bigint
                ELSE pr.branch_id
              END
          )
        )
      )

    UNION ALL

    SELECT
      pr.id AS user_id,
      expected_permission.key AS permission_key,
      'missing'::text AS reason
    FROM public.profiles pr
    JOIN public.positions po
      ON po.id = pr.position_id
     AND po.tenant_id = pr.tenant_id
    JOIN public.role_templates rt
      ON rt.tenant_id = pr.tenant_id
     AND rt.position_code = po.code
    CROSS JOIN LATERAL unnest(rt.permission_keys) AS expected_key(permission_key)
    JOIN public.permission_keys expected_permission
      ON expected_permission.key = expected_key.permission_key
    WHERE COALESCE(pr.is_active, true) = true
      AND private.staff_role_from_position_code(po.code) <> 'owner'
      AND NOT EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        WHERE sp.user_id = pr.id
          AND sp.tenant_id = pr.tenant_id
          AND sp.permission_key = expected_permission.key
          AND sp.branch_id IS NOT DISTINCT FROM CASE
            WHEN expected_permission.scope = 'tenant' THEN NULL::bigint
            ELSE pr.branch_id
          END
      )
  ) drift;

  IF v_permission_drift IS NOT NULL THEN
    RAISE EXCEPTION
      'canonical_position_permission_drift_remains: %',
      v_permission_drift
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(notification_row.id::text, ', ' ORDER BY notification_row.id)
  INTO v_invalid_notifications
  FROM public.notifications notification_row
  WHERE EXISTS (
      SELECT 1
      FROM unnest(notification_row.target_roles) AS audience(target_role)
      WHERE target_role <> ALL (ARRAY[
        'owner',
        'branch_manager',
        'cashier',
        'chef',
        'branch_staff'
      ]::text[])
    )
    OR notification_row.meta ? 'requester_bucket'
    OR notification_row.action_url LIKE '/inventory%'
    OR notification_row.action_url = '/hr'
    OR notification_row.action_url LIKE '/br/%/settings/pos-sessions%';

  IF v_invalid_notifications IS NOT NULL THEN
    RAISE EXCEPTION
      'legacy_notification_payload_remains: %',
      v_invalid_notifications
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
