-- DEFINER list RPCs: missing permission fails closed; cross-branch ids do not leak.
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_tenant bigint;
  v_branch_a bigint;
  v_branch_b bigint;
  v_position bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_loc_a bigint;
  v_loc_b bigint;
  v_transfer bigint;
  v_employee bigint;
  v_slip bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_user), (v_other);
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES ('Slow read fixture', 'slow-read-' || v_user, v_user)
  RETURNING id INTO v_tenant;
  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant, 'branch_staff', 'Nhân viên')
  RETURNING id INTO v_position;
  INSERT INTO public.branches (tenant_id, name, slug, branch_kind)
  VALUES (v_tenant, 'Slow A', 'slow-a-' || v_user, 'branch')
  RETURNING id INTO v_branch_a;
  INSERT INTO public.branches (tenant_id, name, slug, branch_kind)
  VALUES (v_tenant, 'Slow B', 'slow-b-' || v_user, 'branch')
  RETURNING id INTO v_branch_b;

  INSERT INTO public.profiles (id, tenant_id, position_id, branch_id, full_name, is_active)
  VALUES
    (v_user, v_tenant, v_position, v_branch_a, 'Slow Read Staff', true),
    (v_other, v_tenant, v_position, v_branch_b, 'Slow Read Other', true);

  INSERT INTO public.staff_permissions (
    tenant_id, user_id, permission_key, branch_id, valid_from
  )
  VALUES
    (v_tenant, v_user, 'inventory:read', v_branch_a, now()),
    (v_tenant, v_user, 'inventory:count_approve', v_branch_a, now());

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, 'kg', 'Kg')
  RETURNING id INTO v_unit;
  INSERT INTO public.ingredients (
    tenant_id, name, receipt_unit_id, issue_unit_id, unit_cost
  )
  VALUES (v_tenant, 'Slow rice', v_unit, v_unit, 10000)
  RETURNING id INTO v_ingredient;
  INSERT INTO public.inventory_locations (
    tenant_id, branch_id, code, name, location_kind
  )
  VALUES (v_tenant, v_branch_a, 'slow-a-wh', 'Kho A', 'warehouse')
  RETURNING id INTO v_loc_a;
  INSERT INTO public.inventory_locations (
    tenant_id, branch_id, code, name, location_kind
  )
  VALUES (v_tenant, v_branch_b, 'slow-b-wh', 'Kho B', 'warehouse')
  RETURNING id INTO v_loc_b;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, location_id, ingredient_id, current_quantity, avg_unit_cost
  )
  VALUES
    (v_tenant, v_branch_a, v_loc_a, v_ingredient, 10, 10000),
    (v_tenant, v_branch_b, v_loc_b, v_ingredient, 99, 10000);

  INSERT INTO public.stock_transfers (
    tenant_id, from_branch_id, to_branch_id, created_by, transfer_number, status
  )
  VALUES (
    v_tenant, v_branch_a, v_branch_b, v_user, 'DC-SLOW-1', 'draft'
  )
  RETURNING id INTO v_transfer;
  INSERT INTO public.stock_transfer_items (
    tenant_id, transfer_id, ingredient_id, quantity, entry_unit_id
  )
  VALUES (v_tenant, v_transfer, v_ingredient, 2, v_unit);

  INSERT INTO public.employees (tenant_id, profile_id, is_active)
  VALUES (v_tenant, v_user, true)
  RETURNING id INTO v_employee;
  INSERT INTO public.inventory_count_slips (
    tenant_id, branch_id, location_id, employee_id, count_date, status, slip_number
  )
  VALUES (
    v_tenant, v_branch_a, v_loc_a, v_employee, current_date, 'submitted', 'PD-SLOW-1'
  )
  RETURNING id INTO v_slip;
  INSERT INTO public.inventory_count_slip_lines (
    tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id
  )
  VALUES (v_tenant, v_slip, v_ingredient, 10, 9, v_unit);

  DECLARE
    v_slip_2 bigint;
    v_slip_b bigint;
    v_tenant_2 bigint;
    v_branch_t2 bigint;
    v_loc_t2 bigint;
    v_unit_t2 bigint;
    v_ingredient_t2 bigint;
    v_employee_t2 bigint;
    v_slip_t2 bigint;
  BEGIN
    INSERT INTO public.inventory_count_slips (
      tenant_id, branch_id, location_id, employee_id, count_date, status, slip_number
    )
    VALUES (
      v_tenant, v_branch_a, v_loc_a, v_employee, current_date, 'submitted', 'PD-SLOW-2'
    )
    RETURNING id INTO v_slip_2;
    INSERT INTO public.inventory_count_slip_lines (
      tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id
    )
    VALUES (v_tenant, v_slip_2, v_ingredient, 20, 18, v_unit);

    INSERT INTO public.inventory_count_slips (
      tenant_id, branch_id, location_id, employee_id, count_date, status, slip_number
    )
    VALUES (
      v_tenant, v_branch_b, v_loc_b, v_employee, current_date, 'submitted', 'PD-SLOW-B'
    )
    RETURNING id INTO v_slip_b;
    INSERT INTO public.inventory_count_slip_lines (
      tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id
    )
    VALUES (v_tenant, v_slip_b, v_ingredient, 30, 28, v_unit);

    INSERT INTO public.tenants (name, slug, owner_user_id)
    VALUES ('Slow read other tenant', 'slow-read-t2-' || v_user, v_other)
    RETURNING id INTO v_tenant_2;
    INSERT INTO public.branches (tenant_id, name, slug, branch_kind)
    VALUES (v_tenant_2, 'Slow T2', 'slow-t2-' || v_user, 'branch')
    RETURNING id INTO v_branch_t2;
    INSERT INTO public.units (tenant_id, code, name)
    VALUES (v_tenant_2, 'kg', 'Kg')
    RETURNING id INTO v_unit_t2;
    INSERT INTO public.ingredients (tenant_id, name, receipt_unit_id, issue_unit_id, unit_cost)
    VALUES (v_tenant_2, 'Slow rice T2', v_unit_t2, v_unit_t2, 10000)
    RETURNING id INTO v_ingredient_t2;
    INSERT INTO public.inventory_locations (tenant_id, branch_id, code, name, location_kind)
    VALUES (v_tenant_2, v_branch_t2, 'slow-t2-wh', 'Kho T2', 'warehouse')
    RETURNING id INTO v_loc_t2;
    INSERT INTO public.employees (tenant_id, profile_id, is_active)
    VALUES (v_tenant_2, v_other, true)
    RETURNING id INTO v_employee_t2;
    INSERT INTO public.inventory_count_slips (
      tenant_id, branch_id, location_id, employee_id, count_date, status, slip_number
    )
    VALUES (
      v_tenant_2, v_branch_t2, v_loc_t2, v_employee_t2, current_date, 'submitted', 'PD-SLOW-T2'
    )
    RETURNING id INTO v_slip_t2;
    INSERT INTO public.inventory_count_slip_lines (
      tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id
    )
    VALUES (v_tenant_2, v_slip_t2, v_ingredient_t2, 40, 39, v_unit_t2);

    PERFORM set_config('test.slow_read', jsonb_build_object(
      'user', v_user,
      'other', v_other,
      'branch_a', v_branch_a,
      'branch_b', v_branch_b,
      'loc_a', v_loc_a,
      'transfer', v_transfer,
      'slip', v_slip,
      'slip_2', v_slip_2,
      'slip_b', v_slip_b,
      'slip_t2', v_slip_t2
    )::text, true);
  END;
END;
$$;
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  f jsonb := current_setting('test.slow_read')::jsonb;
  v_user uuid := (f->>'user')::uuid;
  v_other uuid := (f->>'other')::uuid;
  v_branch_a bigint := (f->>'branch_a')::bigint;
  v_branch_b bigint := (f->>'branch_b')::bigint;
  v_loc_a bigint := (f->>'loc_a')::bigint;
  v_transfer bigint := (f->>'transfer')::bigint;
  v_slip bigint := (f->>'slip')::bigint;
  v_slip_2 bigint := (f->>'slip_2')::bigint;
  v_slip_b bigint := (f->>'slip_b')::bigint;
  v_slip_t2 bigint := (f->>'slip_t2')::bigint;
  v_qty numeric;
  v_other_qty numeric;
  v_lines integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  SELECT current_quantity INTO v_qty
  FROM public.list_stock_on_hand(v_branch_a, ARRAY[v_loc_a]);
  IF v_qty <> 10 THEN
    RAISE EXCEPTION 'TEST stock on hand missing own branch: %', v_qty;
  END IF;

  SELECT count(*) INTO v_other_qty
  FROM public.list_stock_on_hand(v_branch_a, NULL)
  WHERE current_quantity = 99;
  IF v_other_qty <> 0 THEN
    RAISE EXCEPTION 'TEST stock on hand leaked other branch';
  END IF;

  BEGIN
    PERFORM public.list_stock_on_hand(v_branch_b, NULL);
    RAISE EXCEPTION 'TEST cross-branch stock on hand accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_lines
  FROM public.list_stock_transfer_items(v_transfer);
  IF v_lines <> 1 THEN
    RAISE EXCEPTION 'TEST transfer lines missing: %', v_lines;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(ARRAY[v_slip]);
  IF v_lines <> 1 THEN
    RAISE EXCEPTION 'TEST slip lines missing: %', v_lines;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(ARRAY[v_slip, v_slip_2]);
  IF v_lines <> 2 THEN
    RAISE EXCEPTION 'TEST multi-slip lines missing: expected 2, got %', v_lines;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(ARRAY[v_slip, v_slip_b]);
  IF v_lines <> 1 THEN
    RAISE EXCEPTION 'TEST mixed-branch slip lines leak: expected 1, got %', v_lines;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(ARRAY[v_slip_t2]);
  IF v_lines <> 0 THEN
    RAISE EXCEPTION 'TEST cross-tenant slip lines leaked: expected 0, got %', v_lines;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(ARRAY[v_slip, v_slip]);
  IF v_lines <> 1 THEN
    RAISE EXCEPTION 'TEST duplicate slip IDs returned duplicate lines: expected 1, got %', v_lines;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(ARRAY[]::bigint[]);
  IF v_lines <> 0 THEN
    RAISE EXCEPTION 'TEST empty slip array expected 0, got %', v_lines;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(NULL);
  IF v_lines <> 0 THEN
    RAISE EXCEPTION 'TEST null slip array expected 0, got %', v_lines;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.list_stock_on_hand(v_branch_a, NULL);
    RAISE EXCEPTION 'TEST missing permission stock on hand accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.list_stock_transfer_items(v_transfer);
    RAISE EXCEPTION 'TEST missing permission transfer lines accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_lines
  FROM public.list_inventory_count_slip_lines(ARRAY[v_slip]);
  IF v_lines <> 0 THEN
    RAISE EXCEPTION 'TEST slip lines leaked without count_approve: %', v_lines;
  END IF;
END;
$$;

ROLLBACK;
