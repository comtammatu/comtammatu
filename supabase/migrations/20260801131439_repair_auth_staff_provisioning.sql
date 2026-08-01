CREATE TABLE private.auth_user_provisioning_requests (
  token uuid PRIMARY KEY,
  email text NOT NULL,
  tenant_id bigint NOT NULL,
  branch_id bigint,
  position_code text NOT NULL,
  full_name text NOT NULL,
  provisioned_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.auth_user_provisioning_requests
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_staff_user_provisioning(
  p_token uuid,
  p_email text,
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
BEGIN
  IF p_token IS NULL
     OR NULLIF(trim(p_email), '') IS NULL
     OR p_tenant_id IS NULL
     OR NULLIF(trim(p_position_code), '') IS NULL
     OR NULLIF(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_staff_provisioning_request'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM private.auth_user_provisioning_requests
  WHERE expires_at <= now();

  INSERT INTO private.auth_user_provisioning_requests (
    token, email, tenant_id, branch_id, position_code, full_name, provisioned_by
  ) VALUES (
    p_token,
    lower(trim(p_email)),
    p_tenant_id,
    p_branch_id,
    trim(p_position_code),
    trim(p_full_name),
    p_provisioned_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_staff_user_provisioning(
  uuid, text, bigint, bigint, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_staff_user_provisioning(
  uuid, text, bigint, bigint, text, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_staff_user_provisioning(
  p_token uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  DELETE FROM private.auth_user_provisioning_requests
  WHERE token = p_token;
$$;

REVOKE ALL ON FUNCTION public.cancel_staff_user_provisioning(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_staff_user_provisioning(uuid)
TO service_role;

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
  SELECT po.id,
         private.staff_role_from_position_code(po.code),
         private.required_branch_kind_for_position_code(po.code)
  INTO v_position_id, v_user_role, v_required_kind
  FROM public.positions po
  WHERE po.tenant_id = p_tenant_id
    AND po.code = p_position_code
    AND COALESCE(po.is_active, true) = true
  LIMIT 1;

  IF v_position_id IS NULL OR v_user_role IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for position=% tenant=%',
      p_position_code,
      p_tenant_id
      USING ERRCODE = 'P0001';
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

    SELECT b.branch_kind
    INTO v_branch_kind
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true;

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
      AND COALESCE(actor_profile.is_active, true) = true;

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

  SELECT rt.id, rt.permission_keys
  INTO v_template
  FROM public.role_templates rt
  WHERE rt.tenant_id = p_tenant_id
    AND rt.position_code = p_position_code
  ORDER BY rt.id
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

REVOKE ALL ON FUNCTION private.provision_auth_user(
  uuid, bigint, bigint, text, text, uuid
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_token uuid;
  v_request record;
  v_tenant_id bigint;
  v_branch_id bigint;
  v_position_code text;
  v_full_name text;
  v_provisioned_by uuid;
BEGIN
  v_token := NULLIF(
    NEW.raw_user_meta_data ->> 'provisioning_token',
    ''
  )::uuid;

  IF v_token IS NOT NULL THEN
    SELECT request.*
    INTO v_request
    FROM private.auth_user_provisioning_requests request
    WHERE request.token = v_token
      AND request.email = lower(COALESCE(NEW.email, ''))
      AND request.expires_at > now()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'handle_new_user: invalid_or_expired_provisioning_token'
        USING ERRCODE = '42501';
    END IF;

    v_tenant_id := v_request.tenant_id;
    v_branch_id := v_request.branch_id;
    v_position_code := v_request.position_code;
    v_full_name := v_request.full_name;
    v_provisioned_by := v_request.provisioned_by;
  ELSE
    v_tenant_id := NULLIF(NEW.raw_app_meta_data ->> 'tenant_id', '')::bigint;
    v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
    v_position_code := NULLIF(NEW.raw_app_meta_data ->> 'position_code', '');
    v_full_name := COALESCE(
      NULLIF(NEW.raw_app_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      ''
    );
    v_provisioned_by := NULLIF(
      NEW.raw_app_meta_data ->> 'provisioned_by',
      ''
    )::uuid;
  END IF;

  IF v_tenant_id IS NULL OR v_position_code IS NULL THEN
    RAISE EXCEPTION 'handle_new_user: tenant_id_and_position_code_required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.provision_auth_user(
    NEW.id,
    v_tenant_id,
    v_branch_id,
    v_position_code,
    v_full_name,
    v_provisioned_by
  );

  IF v_token IS NOT NULL THEN
    DELETE FROM private.auth_user_provisioning_requests
    WHERE token = v_token;
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
        - ARRAY[
          'tenant_id',
          'branch_id',
          'position_code',
          'user_role',
          'provisioned_by'
        ]::text[],
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        - 'provisioning_token'
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

INSERT INTO public.positions (
  tenant_id, code, label_vi, label_en, is_active, is_system
)
SELECT tenant.id, role.code, role.label_vi, role.label_en, true, true
FROM public.tenants tenant
CROSS JOIN (VALUES
  ('cashier', 'Thu ngân (kiêm phục vụ)', 'Cashier / Service'),
  ('chef', 'Bếp', 'Chef')
) AS role(code, label_vi, label_en)
WHERE tenant.slug = 'comtammatu'
ON CONFLICT (code, tenant_id) DO UPDATE
SET label_vi = EXCLUDED.label_vi,
    label_en = EXCLUDED.label_en,
    is_active = true,
    is_system = true;

INSERT INTO public.role_templates (
  tenant_id, name, position_code, permission_keys, is_system
)
SELECT tenant.id, role.name, role.position_code, role.permission_keys, true
FROM public.tenants tenant
CROSS JOIN (VALUES
  (
    'cashier',
    'cashier',
    ARRAY[
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
    ]::text[]
  ),
  (
    'chef',
    'chef',
    ARRAY[
      'hr:request_leave',
      'kds:mark_ready',
      'kds:use'
    ]::text[]
  )
) AS role(name, position_code, permission_keys)
WHERE tenant.slug = 'comtammatu'
ON CONFLICT (tenant_id, position_code)
  WHERE position_code IS NOT NULL
DO UPDATE
SET name = EXCLUDED.name,
    permission_keys = EXCLUDED.permission_keys,
    is_system = true;
