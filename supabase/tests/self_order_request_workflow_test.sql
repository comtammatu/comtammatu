-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/self_order_request_workflow_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_profile uuid;
  v_pos_session bigint;
  v_menu_item bigint;
  v_category bigint;
  v_station bigint;
  v_table_number integer;
  v_zero_table bigint;
  v_one_table bigint;
  v_two_table bigint;
  v_zero_token text := 's1_zero_' || replace(gen_random_uuid()::text, '-', '');
  v_one_token text := 's1_one_' || replace(gen_random_uuid()::text, '-', '');
  v_two_token text := 's1_two_' || replace(gen_random_uuid()::text, '-', '');
  v_zero_op uuid := gen_random_uuid();
  v_one_op uuid := gen_random_uuid();
  v_two_op uuid := gen_random_uuid();
  v_payment_op uuid := gen_random_uuid();
  v_payment_request bigint;
  v_zero_request bigint;
  v_two_request bigint;
  v_accepted_order bigint;
  v_one_order bigint;
  v_two_order_a bigint;
  v_two_order_b bigint;
  v_cart jsonb;
  v_result jsonb;
  v_count integer;
BEGIN
  SELECT b.tenant_id, b.id
  INTO v_tenant, v_branch
  FROM public.branches b
  WHERE b.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.tenant_id = b.tenant_id AND mi.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.tenant_id = b.tenant_id
        AND (p.branch_id = b.id OR p.branch_id IS NULL)
    )
  ORDER BY b.id
  LIMIT 1;

  SELECT p.id
  INTO v_profile
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.tenant_id = v_tenant
    AND (p.branch_id = v_branch OR p.branch_id IS NULL)
  ORDER BY
    CASE WHEN private.staff_role_from_position_code(po.code) = 'owner' THEN 0 ELSE 1 END,
    p.id
  LIMIT 1;

  SELECT mi.id, mi.category_id
  INTO v_menu_item, v_category
  FROM public.menu_items mi
  WHERE mi.tenant_id = v_tenant
    AND mi.is_active = true
  ORDER BY mi.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_profile IS NULL OR v_menu_item IS NULL THEN
    RAISE EXCEPTION 'Seed data missing for self-order S1 acceptance';
  END IF;

  SELECT s.id
  INTO v_station
  FROM public.kds_station_categories sc
  JOIN public.kds_stations s
    ON s.id = sc.station_id
   AND s.tenant_id = sc.tenant_id
  WHERE sc.tenant_id = v_tenant
    AND sc.category_id = v_category
    AND s.branch_id = v_branch
    AND s.is_active = true
  LIMIT 1;

  IF v_station IS NULL THEN
    INSERT INTO public.kds_stations (
      tenant_id, branch_id, name, "position", is_active
    )
    VALUES (
      v_tenant,
      v_branch,
      '__s1_station_' || gen_random_uuid()::text,
      999,
      true
    )
    RETURNING id INTO v_station;

    INSERT INTO public.kds_station_categories (
      tenant_id, station_id, category_id
    )
    VALUES (v_tenant, v_station, v_category);
  END IF;

  SELECT ps.id
  INTO v_pos_session
  FROM public.pos_sessions ps
  WHERE ps.tenant_id = v_tenant
    AND ps.branch_id = v_branch
    AND ps.status = 'open'
  LIMIT 1;

  IF v_pos_session IS NULL THEN
    INSERT INTO public.pos_sessions (
      tenant_id, branch_id, opened_by, opening_cash, status
    )
    VALUES (v_tenant, v_branch, v_profile, 0, 'open')
    RETURNING id INTO v_pos_session;
  END IF;

  SELECT COALESCE(max(t.number), 0) + 100
  INTO v_table_number
  FROM public.tables t
  WHERE t.branch_id = v_branch;

  INSERT INTO public.tables (
    tenant_id, branch_id, number, status, self_order_token, self_order_enabled
  )
  VALUES
    (v_tenant, v_branch, v_table_number, 'available', v_zero_token, true),
    (v_tenant, v_branch, v_table_number + 1, 'occupied', v_one_token, true),
    (v_tenant, v_branch, v_table_number + 2, 'occupied', v_two_token, true);

  SELECT t.id INTO v_one_table
  FROM public.tables t WHERE t.self_order_token = v_one_token;
  SELECT t.id INTO v_two_table
  FROM public.tables t WHERE t.self_order_token = v_two_token;
  SELECT t.id INTO v_zero_table
  FROM public.tables t WHERE t.self_order_token = v_zero_token;

  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    created_by, pos_session_id, status, payment_status
  )
  VALUES (
    v_tenant,
    v_branch,
    v_one_table,
    'S1-' || replace(gen_random_uuid()::text, '-', ''),
    'dine_in',
    v_profile,
    v_pos_session,
    'new',
    'unpaid'
  )
  RETURNING id INTO v_one_order;

  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    created_by, pos_session_id, status, payment_status
  )
  VALUES (
    v_tenant,
    v_branch,
    v_two_table,
    'S1-' || replace(gen_random_uuid()::text, '-', ''),
    'dine_in',
    v_profile,
    v_pos_session,
    'new',
    'unpaid'
  )
  RETURNING id INTO v_two_order_a;

  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    created_by, pos_session_id, status, payment_status
  )
  VALUES (
    v_tenant,
    v_branch,
    v_two_table,
    'S1-' || replace(gen_random_uuid()::text, '-', ''),
    'dine_in',
    v_profile,
    v_pos_session,
    'new',
    'unpaid'
  )
  RETURNING id INTO v_two_order_b;

  v_cart := jsonb_build_array(jsonb_build_object(
    'menu_item_id', v_menu_item,
    'quantity', 1,
    'modifiers', '[]'::jsonb,
    'sides', '[]'::jsonb
  ));

  PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.self_order_submit(v_one_token, v_cart, NULL, v_one_op);

  IF v_result ->> 'status' <> 'accepted'
     OR (v_result ->> 'orderId')::bigint <> v_one_order THEN
    RAISE EXCEPTION 'ONE ORDER FAILED: %', v_result;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.order_items oi
  WHERE oi.order_id = v_one_order AND oi.request_key = v_one_op;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ONE ORDER APPEND COUNT FAILED: %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.self_order_submit(v_one_token, v_cart, NULL, v_one_op);
  IF COALESCE((v_result ->> 'idempotent')::boolean, false) IS NOT true THEN
    RAISE EXCEPTION 'REPLAY FAILED: %', v_result;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.order_items oi
  WHERE oi.order_id = v_one_order AND oi.request_key = v_one_op;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'REPLAY DUPLICATED ITEMS: %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.self_order_create_payment_request(
    v_one_token,
    v_payment_op,
    'cash_call',
    '{}'::jsonb
  );
  v_payment_request := (v_result ->> 'id')::bigint;
  IF v_result ->> 'status' <> 'cash_call' OR v_payment_request IS NULL THEN
    RAISE EXCEPTION 'SESSIONLESS PAYMENT CREATE FAILED: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.id = v_payment_request
      AND pr.order_id = v_one_order
      AND pr.payment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PAYMENT REQUEST MUST BIND ORDER BEFORE PAYMENT';
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid'
  WHERE id = v_one_order;

  IF NOT EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.id = v_payment_request
      AND pr.status = 'cash_call'
      AND pr.payment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PAYMENT REQUEST COMPLETED WITHOUT PAYMENT EVIDENCE';
  END IF;

  UPDATE public.orders
  SET payment_status = 'unpaid'
  WHERE id = v_one_order;

  PERFORM set_config('request.jwt.claim.sub', v_profile::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_profile::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );
  v_result := public.self_order_cancel_payment_request(
    v_payment_request,
    's1_acceptance'
  );
  IF v_result ->> 'status' <> 'cancelled' THEN
    RAISE EXCEPTION 'SESSIONLESS PAYMENT CANCEL FAILED: %', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.self_order_submit(v_zero_token, v_cart, NULL, v_zero_op);
  IF v_result ->> 'status' <> 'pending'
     OR (v_result ->> 'openOrderCount')::integer <> 0 THEN
    RAISE EXCEPTION 'ZERO ORDER FAILED: %', v_result;
  END IF;
  v_zero_request := (v_result ->> 'requestId')::bigint;

  PERFORM set_config('request.jwt.claim.sub', v_profile::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_profile::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );
  v_result := public.self_order_accept_request(v_zero_request, NULL);
  v_accepted_order := (v_result ->> 'orderId')::bigint;
  IF v_result ->> 'status' <> 'accepted' OR v_accepted_order IS NULL THEN
    RAISE EXCEPTION 'ZERO ORDER ACCEPT FAILED: %', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.self_order_submit(v_two_token, v_cart, NULL, v_two_op);
  IF v_result ->> 'status' <> 'pending'
     OR (v_result ->> 'openOrderCount')::integer <> 2 THEN
    RAISE EXCEPTION 'TWO ORDER FAILED: %', v_result;
  END IF;
  v_two_request := (v_result ->> 'requestId')::bigint;

  SELECT count(*) INTO v_count
  FROM public.order_items oi
  WHERE oi.order_id IN (v_two_order_a, v_two_order_b)
    AND oi.request_key = v_two_op;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TWO ORDER MUST NOT APPEND: %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.self_order_get_snapshot(v_two_token, NULL::uuid);
  IF v_result ->> 'state' <> 'awaiting_confirmation'
     OR (v_result ->> 'openOrderCount')::integer <> 2
     OR v_result -> 'order' <> 'null'::jsonb
     OR v_result -> 'paymentRequest' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'MULTI-BILL SNAPSHOT MUST HIDE BILL AND PAYMENT: %', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_profile::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_profile::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );
  v_result := public.self_order_reject_request(v_two_request);
  IF v_result ->> 'status' <> 'rejected' THEN
    RAISE EXCEPTION 'TWO ORDER REJECT FAILED: %', v_result;
  END IF;
END;
$$;

ROLLBACK;
