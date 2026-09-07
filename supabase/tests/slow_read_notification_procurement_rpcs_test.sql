-- DEFINER notification/procurement/transfer RPCs: permission fails closed.
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_fulfill uuid := gen_random_uuid();
  v_tenant bigint;
  v_branch_a bigint;
  v_branch_b bigint;
  v_position bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_supplier bigint;
  v_transfer bigint;
  v_grn bigint;
  v_grn_other bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_user), (v_other), (v_fulfill);
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES ('Procure slow fixture', 'procure-slow-' || v_user, v_user)
  RETURNING id INTO v_tenant;
  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant, 'branch_staff', 'Nhân viên')
  RETURNING id INTO v_position;
  INSERT INTO public.branches (tenant_id, name, slug, branch_kind)
  VALUES (v_tenant, 'Procure A', 'procure-a-' || v_user, 'branch')
  RETURNING id INTO v_branch_a;
  INSERT INTO public.branches (tenant_id, name, slug, branch_kind)
  VALUES (v_tenant, 'Procure B', 'procure-b-' || v_user, 'branch')
  RETURNING id INTO v_branch_b;

  INSERT INTO public.profiles (id, tenant_id, position_id, branch_id, full_name, is_active)
  VALUES
    (v_user, v_tenant, v_position, v_branch_a, 'Procure Staff', true),
    (v_other, v_tenant, v_position, v_branch_b, 'Procure Other', true),
    (v_fulfill, v_tenant, v_position, v_branch_a, 'Fulfill Only', true);

  INSERT INTO public.staff_permissions (
    tenant_id, user_id, permission_key, branch_id, valid_from
  )
  VALUES
    (v_tenant, v_user, 'inventory:read', v_branch_a, now()),
    (v_tenant, v_user, 'procurement:read', v_branch_a, now()),
    (v_tenant, v_fulfill, 'inventory:request_fulfill', v_branch_a, now());

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, 'kg', 'Kg')
  RETURNING id INTO v_unit;
  INSERT INTO public.ingredients (
    tenant_id, name, receipt_unit_id, issue_unit_id, unit_cost
  )
  VALUES (v_tenant, 'Procure rice', v_unit, v_unit, 10000)
  RETURNING id INTO v_ingredient;

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (v_tenant, 'Procure NCC', true)
  RETURNING id INTO v_supplier;
  INSERT INTO public.supplier_items (
    tenant_id, supplier_id, ingredient_id, is_active
  )
  VALUES (v_tenant, v_supplier, v_ingredient, true);

  INSERT INTO public.stock_transfers (
    tenant_id, from_branch_id, to_branch_id, created_by, transfer_number, status
  )
  VALUES (
    v_tenant, v_branch_a, v_branch_b, v_user, 'DC-PROCURE-1', 'draft'
  )
  RETURNING id INTO v_transfer;
  -- Other-branch-only transfer must stay invisible to branch_a staff even on
  -- tenant-wide list (DEFINER must not widen past stock_transfers_select).
  INSERT INTO public.stock_transfers (
    tenant_id, from_branch_id, to_branch_id, created_by, transfer_number, status
  )
  VALUES (
    v_tenant, v_branch_b, v_branch_b, v_other, 'DC-PROCURE-B', 'draft'
  );

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, supplier_id, grn_number, created_by, status
  )
  VALUES (
    v_tenant, v_branch_a, v_supplier, 'PN-PROCURE-1', v_user, 'draft'
  )
  RETURNING id INTO v_grn;
  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, supplier_id, grn_number, created_by, status
  )
  VALUES (
    v_tenant, v_branch_b, v_supplier, 'PN-PROCURE-2', v_user, 'draft'
  )
  RETURNING id INTO v_grn_other;
  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id, received_quantity, rejected_quantity,
    entry_unit_id, supplier_id
  )
  VALUES
    (v_tenant, v_grn, v_ingredient, 2, 0, v_unit, v_supplier),
    (v_tenant, v_grn, v_ingredient, 3, 0, v_unit, v_supplier),
    (v_tenant, v_grn, v_ingredient, 4, 0, v_unit, v_supplier),
    (v_tenant, v_grn, v_ingredient, 5, 0, v_unit, v_supplier),
    (v_tenant, v_grn, v_ingredient, 6, 0, v_unit, v_supplier),
    (v_tenant, v_grn_other, v_ingredient, 9, 0, v_unit, v_supplier);

  INSERT INTO public.notifications (
    tenant_id, kind, title, target_roles, target_branch_id, severity
  )
  VALUES
    (
      v_tenant,
      'workflow.grn_pending',
      'Phiếu nhập A',
      ARRAY['branch_staff']::text[],
      v_branch_a,
      'warning'
    ),
    (
      v_tenant,
      'workflow.grn_pending',
      'Phiếu nhập B',
      ARRAY['branch_staff']::text[],
      v_branch_b,
      'warning'
    );

  PERFORM set_config('test.procure_slow', jsonb_build_object(
    'user', v_user,
    'other', v_other,
    'fulfill', v_fulfill,
    'branch_a', v_branch_a,
    'branch_b', v_branch_b,
    'grn', v_grn,
    'grn_other', v_grn_other,
    'transfer', v_transfer
  )::text, true);
END;
$$;
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  f jsonb := current_setting('test.procure_slow')::jsonb;
  v_user uuid := (f->>'user')::uuid;
  v_other uuid := (f->>'other')::uuid;
  v_fulfill uuid := (f->>'fulfill')::uuid;
  v_branch_a bigint := (f->>'branch_a')::bigint;
  v_branch_b bigint := (f->>'branch_b')::bigint;
  v_grn bigint := (f->>'grn')::bigint;
  v_grn_other bigint := (f->>'grn_other')::bigint;
  v_count bigint;
  v_rls bigint;
  v_lines integer;
  v_page integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  SELECT ingredient_count INTO v_count
  FROM public.list_suppliers_with_item_counts();
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST supplier item count missing: %', v_count;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_grn_receive_lines(ARRAY[v_grn, v_grn_other], 500, 0);
  IF v_lines IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'TEST GRN lines leaked or missing: %', v_lines;
  END IF;

  SELECT count(*) INTO v_page
  FROM public.list_grn_receive_lines(ARRAY[v_grn, v_grn_other], 2, 0);
  IF v_page IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'TEST GRN page size ignored: %', v_page;
  END IF;
  SELECT count(*) INTO v_page
  FROM public.list_grn_receive_lines(ARRAY[v_grn, v_grn_other], 2, 2);
  IF v_page IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'TEST GRN page 2 missing: %', v_page;
  END IF;
  SELECT count(*) INTO v_page
  FROM public.list_grn_receive_lines(ARRAY[v_grn, v_grn_other], 2, 4);
  IF v_page IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST GRN last page missing: %', v_page;
  END IF;
  IF (
    SELECT count(*)
    FROM (
      SELECT * FROM public.list_grn_receive_lines(ARRAY[v_grn], 2, 0)
      UNION ALL
      SELECT * FROM public.list_grn_receive_lines(ARRAY[v_grn], 2, 2)
      UNION ALL
      SELECT * FROM public.list_grn_receive_lines(ARRAY[v_grn], 2, 4)
    ) AS paged
  ) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'TEST GRN paging lost received lines';
  END IF;

  BEGIN
    PERFORM public.list_receipt_allocations_for_grns(ARRAY[v_grn], 500, 0);
    RAISE EXCEPTION 'TEST allocations without monetary access accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_lines
  FROM public.list_stock_transfers_for_branch(v_branch_a, 200);
  SELECT count(*) INTO v_rls
  FROM public.stock_transfers
  WHERE from_branch_id = v_branch_a
     OR to_branch_id = v_branch_a;
  IF v_lines IS DISTINCT FROM 1 OR v_rls IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST transfer list/RLS mismatch: % vs %', v_lines, v_rls;
  END IF;

  SELECT count(*) INTO v_lines
  FROM public.list_stock_transfers_for_branch(NULL, 200);
  SELECT count(*) INTO v_rls
  FROM public.stock_transfers;
  IF v_lines IS DISTINCT FROM 1 OR v_rls IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST tenant transfer list leaked: % vs %', v_lines, v_rls;
  END IF;

  IF public.count_open_stock_transfers(v_branch_a) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST open transfer count missing';
  END IF;

  IF public.count_open_stock_transfers(NULL) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST tenant open count leaked other branch';
  END IF;

  SELECT unread_count INTO v_count
  FROM public.count_unread_notifications_by_target()
  WHERE kind = 'workflow.grn_pending';
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST badge leaked other branch: %', v_count;
  END IF;

  BEGIN
    PERFORM public.list_stock_transfers_for_branch(v_branch_b, 200);
    RAISE EXCEPTION 'TEST cross-branch transfer list accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_fulfill::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_fulfill, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_rls FROM public.stock_transfers;
  IF v_rls IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST fulfill-only RLS select leaked: %', v_rls;
  END IF;

  BEGIN
    PERFORM public.list_stock_transfers_for_branch(v_branch_a, 200);
    RAISE EXCEPTION 'TEST fulfill-only transfer list accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.count_open_stock_transfers(v_branch_a);
    RAISE EXCEPTION 'TEST fulfill-only open count accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.list_suppliers_with_item_counts();
    RAISE EXCEPTION 'TEST missing procurement read accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.list_grn_receive_lines(ARRAY[v_grn], 500, 0);
    RAISE EXCEPTION 'TEST missing GRN read accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
