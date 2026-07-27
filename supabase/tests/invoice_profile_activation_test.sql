\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_function oid := to_regprocedure(
    'public.activate_invoice_profile()'
  );
BEGIN
  IF v_function IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc function_row
      WHERE function_row.oid = v_function
        AND function_row.prosecdef
        AND 'search_path=""' = ANY(function_row.proconfig)
    )
    OR has_function_privilege('anon', v_function, 'EXECUTE')
    OR has_function_privilege('service_role', v_function, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'invoice_profile_activation_acl_invalid';
  END IF;

  IF has_table_privilege(
    'authenticated',
    'public.invoice_profiles',
    'INSERT'
  ) OR has_table_privilege(
    'authenticated',
    'public.invoice_profiles',
    'UPDATE'
  ) OR has_table_privilege(
    'authenticated',
    'public.invoice_profiles',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'invoice_profiles_authenticated_write_exposed';
  END IF;
END
$$;

DO $$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_staff_id uuid := gen_random_uuid();
  v_tenant_id bigint;
  v_owner_position_id bigint;
  v_staff_position_id bigint;
  v_profile_id bigint;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  INSERT INTO auth.users (id, email)
  VALUES
    (v_owner_id, 'invoice-profile-owner@example.invalid'),
    (v_staff_id, 'invoice-profile-staff@example.invalid');
  PERFORM set_config('session_replication_role', 'origin', true);

  INSERT INTO public.tenants (
    name,
    slug,
    owner_user_id
  ) VALUES (
    'Invoice profile activation test',
    'invoice-profile-activation-' || v_owner_id::text,
    v_owner_id
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant_id, 'owner', 'Chủ sở hữu')
  RETURNING id INTO v_owner_position_id;

  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant_id, 'staff', 'Nhân viên')
  RETURNING id INTO v_staff_position_id;

  INSERT INTO public.profiles (
    id,
    tenant_id,
    full_name,
    position_id
  ) VALUES
    (v_owner_id, v_tenant_id, 'Invoice profile owner', v_owner_position_id),
    (v_staff_id, v_tenant_id, 'Invoice profile staff', v_staff_position_id);

  INSERT INTO public.invoice_profiles (
    tenant_id,
    version,
    provider,
    template_code,
    invoice_series,
    status,
    valid_from,
    created_by
  ) VALUES (
    v_tenant_id,
    1,
    'viettel',
    '1/001',
    'C26TCS',
    'draft',
    now(),
    v_owner_id
  )
  RETURNING id INTO v_profile_id;

  PERFORM set_config(
    'test.invoice_profile_owner',
    v_owner_id::text,
    true
  );
  PERFORM set_config(
    'test.invoice_profile_staff',
    v_staff_id::text,
    true
  );
  PERFORM set_config(
    'test.invoice_profile_tenant',
    v_tenant_id::text,
    true
  );
  PERFORM set_config(
    'test.invoice_profile_id',
    v_profile_id::text,
    true
  );
END
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.invoice_profile_staff'),
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.activate_invoice_profile();
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := SQLERRM = 'invoice_profile_activation_forbidden';
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'invoice_profile_activation_permission_not_enforced';
  END IF;
END
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.invoice_profile_owner'),
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.activate_invoice_profile();
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := SQLERRM = 'invoice_profile_legal_identity_incomplete';
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'invoice_profile_activation_identity_not_enforced';
  END IF;
END
$$;

RESET ROLE;

UPDATE public.tenants
SET legal_name = 'Công ty Cổ phần Chén Sứ',
    tax_code = '0123456789',
    legal_address = 'Test address',
    representative = 'Test representative'
WHERE id = current_setting('test.invoice_profile_tenant')::bigint;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_expected_id bigint :=
    current_setting('test.invoice_profile_id')::bigint;
  v_first_id bigint;
  v_replay_id bigint;
BEGIN
  v_first_id := public.activate_invoice_profile();
  v_replay_id := public.activate_invoice_profile();

  IF v_first_id <> v_expected_id OR v_replay_id <> v_expected_id THEN
    RAISE EXCEPTION 'invoice_profile_activation_not_idempotent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.invoice_profiles profile
    WHERE profile.id = v_expected_id
      AND profile.status = 'active'
      AND profile.seller_tax_code = '0123456789'
      AND profile.created_by =
        current_setting('test.invoice_profile_owner')::uuid
  ) THEN
    RAISE EXCEPTION 'invoice_profile_activation_snapshot_invalid';
  END IF;
END
$$;

ROLLBACK;
