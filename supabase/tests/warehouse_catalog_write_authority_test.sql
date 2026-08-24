\set ON_ERROR_STOP on

BEGIN;

-- ADR 0045: save_ingredient_catalog authorizes the warehouse position
-- (central_supply_ops) or the inventory:catalog_write capability, and
-- keeps rejecting unrelated roles.
DO $$
DECLARE
  v_tenant bigint;
  v_unit_id bigint;
  v_warehouse_user uuid := gen_random_uuid();
  v_waiter_user uuid := gen_random_uuid();
  v_warehouse_position bigint;
  v_waiter_position bigint;
  v_supply_branch bigint;
  v_sales_branch bigint;
  v_owner_profile uuid;
  v_created bigint;
  v_forbidden boolean;
  v_payload jsonb;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
BEGIN
  SELECT profile.tenant_id
  INTO v_tenant
  FROM public.profiles AS profile
  ORDER BY profile.created_at, profile.id
  LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'WAREHOUSE CATALOG: seeded tenant is required';
  END IF;

  SELECT unit_row.id
  INTO v_unit_id
  FROM public.units AS unit_row
  WHERE unit_row.tenant_id = v_tenant
    AND unit_row.is_active
  ORDER BY unit_row.id
  LIMIT 1;
  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'WAREHOUSE CATALOG: seeded unit is required';
  END IF;

  INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active)
  VALUES (v_tenant, 'central_supply_ops', 'Quản lý kho Tổng', 'Warehouse ops', TRUE)
  ON CONFLICT (code, tenant_id) DO UPDATE
  SET is_active = TRUE
  RETURNING id INTO v_warehouse_position;

  INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active)
  VALUES (v_tenant, 'waiter', 'Phục vụ', 'Waiter', TRUE)
  ON CONFLICT (code, tenant_id) DO UPDATE
  SET is_active = TRUE
  RETURNING id INTO v_waiter_position;

  -- Operational positions require branch scope (check_branch_required):
  -- the warehouse profile sits on a throwaway central_supply branch, the
  -- waiter profile on a seeded sales branch.
  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  VALUES (v_tenant, '__wcat_supply_' || v_suffix, NULL, 'central_supply', TRUE)
  RETURNING id INTO v_supply_branch;

  SELECT branch.id
  INTO v_sales_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND COALESCE(branch.is_active, TRUE)
  ORDER BY branch.id
  LIMIT 1;
  IF v_sales_branch IS NULL THEN
    RAISE EXCEPTION 'WAREHOUSE CATALOG: seeded sales branch is required';
  END IF;

  -- Operational users must be provisioned through auth.users so the profile
  -- carries the kind-matched branch and an active owner provisioner
  -- (provision_auth_user rejects direct branchless profile inserts).
  SELECT profile.id
  INTO v_owner_profile
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND position.code = 'owner'
    AND COALESCE(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;
  IF v_owner_profile IS NULL THEN
    RAISE EXCEPTION 'WAREHOUSE CATALOG: seeded owner fixture required';
  END IF;

  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    v_warehouse_user,
    'warehouse-catalog-ops-' || v_warehouse_user::text || '@example.invalid',
    jsonb_build_object(
      'tenant_id', v_tenant,
      'branch_id', v_supply_branch,
      'position_code', 'central_supply_ops',
      'full_name', 'Kho Test',
      'provisioned_by', v_owner_profile::text
    ),
    jsonb_build_object('full_name', 'Kho Test')
  );

  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    v_waiter_user,
    'warehouse-catalog-waiter-' || v_waiter_user::text || '@example.invalid',
    jsonb_build_object(
      'tenant_id', v_tenant,
      'branch_id', v_sales_branch,
      'position_code', 'waiter',
      'full_name', 'Phuc Vu Test',
      'provisioned_by', v_owner_profile::text
    ),
    jsonb_build_object('full_name', 'Phuc Vu Test')
  );

  v_payload := jsonb_build_array(jsonb_build_object(
    'unit_id', v_unit_id,
    'to_base_factor', 1,
    'is_base', true
  ));

  -- (a) Warehouse position passes the gate without any capability row.
  PERFORM set_config('request.jwt.claim.sub', v_warehouse_user::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_warehouse_user::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    TRUE
  );

  v_created := public.save_ingredient_catalog(
    NULL,
    '__warehouse_catalog_write_test__',
    NULL,
    NULL,
    'raw_material',
    'ambient',
    0,
    NULL,
    NULL,
    NULL,
    v_payload,
    NULL,
    v_unit_id,
    v_unit_id,
    NULL
  );
  IF v_created IS NULL THEN
    RAISE EXCEPTION 'WAREHOUSE CATALOG: warehouse position was rejected';
  END IF;

  -- (b) Unrelated position stays forbidden.
  PERFORM set_config('request.jwt.claim.sub', v_waiter_user::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_waiter_user::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    TRUE
  );

  v_forbidden := FALSE;
  BEGIN
    PERFORM public.save_ingredient_catalog(
      NULL,
      '__warehouse_catalog_write_denied__',
      NULL,
      NULL,
      'raw_material',
      'ambient',
      0,
      NULL,
      NULL,
      NULL,
      v_payload,
      NULL,
      v_unit_id,
      v_unit_id,
      NULL
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'forbidden' THEN
        v_forbidden := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_forbidden THEN
    RAISE EXCEPTION 'WAREHOUSE CATALOG: unrelated position was not rejected';
  END IF;
END;
$$;

ROLLBACK;
