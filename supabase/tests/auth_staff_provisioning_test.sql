\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_owner_id uuid;
  v_role record;
  v_token uuid;
  v_user_id uuid;
  v_grant_count integer;
  v_template_count integer;
BEGIN
  SELECT tenant.id, branch.id
  INTO v_tenant_id, v_branch_id
  FROM public.tenants tenant
  JOIN public.branches branch ON branch.tenant_id = tenant.id
  WHERE tenant.slug = 'comtammatu'
    AND branch.code = 'NHT';

  SELECT profile.id
  INTO v_owner_id
  FROM public.profiles profile
  JOIN public.positions position ON position.id = profile.position_id
  WHERE profile.tenant_id = v_tenant_id
    AND position.code = 'owner'
    AND COALESCE(profile.is_active, true) = true
  LIMIT 1;

  FOR v_role IN
    SELECT *
    FROM (VALUES
      ('branch_manager', 'Provisioning Test Manager'),
      ('cashier', 'Provisioning Test Cashier'),
      ('chef', 'Provisioning Test Chef')
    ) AS role(position_code, full_name)
  LOOP
    v_token := gen_random_uuid();
    v_user_id := gen_random_uuid();

    PERFORM public.prepare_staff_user_provisioning(
      v_token,
      v_user_id::text || '@comtammatu.test',
      v_tenant_id,
      v_branch_id,
      v_role.position_code,
      v_role.full_name,
      v_owner_id
    );

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_user_id::text || '@comtammatu.test',
      extensions.crypt('Provision123!', extensions.gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', v_role.full_name, 'provisioning_token', v_token),
      now(),
      now(),
      '',
      '',
      '',
      '',
      false
    );

    SELECT count(*)
    INTO v_grant_count
    FROM public.staff_permissions
    WHERE user_id = v_user_id;

    SELECT cardinality(permission_keys)
    INTO v_template_count
    FROM public.role_templates
    WHERE tenant_id = v_tenant_id
      AND position_code = v_role.position_code;

    IF v_grant_count <> v_template_count THEN
      RAISE EXCEPTION 'TEST FAILED: % received % of % grants',
        v_role.position_code, v_grant_count, v_template_count;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM private.auth_user_provisioning_requests
      WHERE token = v_token
    ) OR EXISTS (
      SELECT 1
      FROM auth.users
      WHERE id = v_user_id
        AND raw_user_meta_data ? 'provisioning_token'
    ) THEN
      RAISE EXCEPTION 'TEST FAILED: provisioning token was not consumed';
    END IF;
  END LOOP;

  RAISE NOTICE 'TEST PASSED: manager, cashier, and chef provisioning is atomic';
END;
$$;

ROLLBACK;
