-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/self_order_request_workflow_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_profile uuid;
  v_branch_operator uuid;
  v_pos_session bigint;
  v_menu_item bigint;
  v_category bigint;
  v_station bigint;
  v_ticket_ids bigint[];
  v_table_number integer;
  v_zero_table bigint;
  v_one_table bigint;
  v_two_table bigint;
  v_zero_token text := 's1_zero_' || replace(gen_random_uuid()::text, '-', '');
  v_one_token text := 's1_one_' || replace(gen_random_uuid()::text, '-', '');
  v_two_token text := 's1_two_' || replace(gen_random_uuid()::text, '-', '');
  v_zero_op uuid := gen_random_uuid();
  v_zero_add_op uuid := gen_random_uuid();
  v_one_op uuid := gen_random_uuid();
  v_two_op uuid := gen_random_uuid();
  v_payment_op uuid := gen_random_uuid();
  v_momo_op uuid := gen_random_uuid();
  v_momo_claim uuid := gen_random_uuid();
  v_momo_other_claim uuid := gen_random_uuid();
  v_momo_reconcile_claim uuid := gen_random_uuid();
  v_momo_reconcile_other_claim uuid := gen_random_uuid();
  v_payment_request bigint;
  v_momo_payment_request bigint;
  v_momo_payment bigint;
  v_momo_provider_ref text;
  v_momo_amount numeric;
  v_momo_order_payment_code text;
  v_sepay_event bigint;
  v_zero_request bigint;
  v_two_request bigint;
  v_accepted_order bigint;
  v_one_order bigint;
  v_two_order_a bigint;
  v_two_order_b bigint;
  v_cart jsonb;
  v_add_cart jsonb;
  v_result jsonb;
  v_count integer;
  v_expired boolean;
  v_invalid_threshold interval;
  v_function_definition text;
BEGIN
  SELECT b.tenant_id, b.id
  INTO v_tenant, v_branch
  FROM public.branches b
  WHERE b.is_active = true
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

  SELECT p.id
  INTO v_branch_operator
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.tenant_id = v_tenant
    AND p.branch_id = v_branch
    AND private.staff_role_from_position_code(po.code) IN (
      'branch_manager',
      'cashier'
    )
  ORDER BY
    CASE
      WHEN private.staff_role_from_position_code(po.code) = 'branch_manager'
      THEN 0
      ELSE 1
    END,
    p.id
  LIMIT 1;

  IF v_tenant IS NULL
     OR v_branch IS NULL
     OR v_profile IS NULL
     OR v_branch_operator IS NULL THEN
    RAISE EXCEPTION 'Seed tenant, branch, or operator missing for self-order S1 acceptance';
  END IF;

  SELECT mi.id, mi.category_id
  INTO v_menu_item, v_category
  FROM public.menu_items mi
  WHERE mi.tenant_id = v_tenant
    AND mi.is_active = true
  ORDER BY mi.id
  LIMIT 1;

  IF v_menu_item IS NULL THEN
    INSERT INTO public.menu_categories (tenant_id, name, type, sort_order)
    VALUES (
      v_tenant,
      '__s1_category_' || gen_random_uuid()::text,
      'main_dish',
      999
    )
    RETURNING id INTO v_category;

    INSERT INTO public.menu_items (
      tenant_id, category_id, name, base_price, sort_order, is_active
    )
    VALUES (
      v_tenant,
      v_category,
      '__s1_menu_item_' || gen_random_uuid()::text,
      10000,
      999,
      true
    )
    RETURNING id INTO v_menu_item;
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
  BEGIN
    v_result := public.self_order_create_payment_request(
      v_one_token,
      v_momo_op,
      'momo',
      '{}'::jsonb
    );
    IF v_result ->> 'status' <> 'momo_pending' THEN
      RAISE EXCEPTION 'MOMO PRE-READY PAYMENT CREATE FAILED: %', v_result;
    END IF;

    SELECT array_agg(kt.id ORDER BY kt.id)
    INTO v_ticket_ids
    FROM public.kds_tickets kt
    WHERE kt.tenant_id = v_tenant
      AND kt.branch_id = v_branch
      AND kt.order_id = v_one_order
      AND kt.status IN ('pending', 'preparing');
    IF COALESCE(cardinality(v_ticket_ids), 0) = 0 THEN
      RAISE EXCEPTION 'MOMO PRE-READY KDS FIXTURE MISSING';
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
    v_result := public.complete_kds_tickets(v_branch, v_ticket_ids);
    IF NOT EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = v_one_order
        AND o.status = 'ready'
    ) OR EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.order_id = v_one_order
        AND oi.status <> 'ready'
    ) OR EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      WHERE kt.order_id = v_one_order
        AND (kt.status <> 'ready' OR kt.first_ready_at IS NULL)
    ) THEN
      RAISE EXCEPTION 'MOMO PRE-READY KDS PROGRESS FAILED: %', v_result;
    END IF;

    RAISE EXCEPTION 'momo_pre_ready_fixture_rollback';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'momo_pre_ready_fixture_rollback' THEN
      RAISE;
    END IF;
  END;
  SELECT array_agg(kt.id ORDER BY kt.id)
  INTO v_ticket_ids
  FROM public.kds_tickets kt
  WHERE kt.tenant_id = v_tenant
    AND kt.branch_id = v_branch
    AND kt.order_id = v_one_order
    AND kt.status IN ('pending', 'preparing');
  IF COALESCE(cardinality(v_ticket_ids), 0) = 0 THEN
    RAISE EXCEPTION 'CANONICAL KDS READINESS FIXTURE MISSING';
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
  v_result := public.complete_kds_tickets(v_branch, v_ticket_ids);
  IF NOT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = v_one_order
      AND o.status = 'ready'
  ) OR EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = v_one_order
      AND oi.status <> 'ready'
  ) OR EXISTS (
    SELECT 1
    FROM public.kds_tickets kt
    WHERE kt.order_id = v_one_order
      AND (kt.status <> 'ready' OR kt.first_ready_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'CANONICAL KDS READINESS FAILED: %', v_result;
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
  v_result := public.self_order_create_payment_request(
    v_one_token,
    v_momo_op,
    'momo',
    '{}'::jsonb
  );
  v_momo_payment_request := (v_result ->> 'id')::bigint;
  IF v_result ->> 'status' <> 'momo_pending'
     OR v_momo_payment_request IS NULL THEN
    RAISE EXCEPTION 'MOMO PAYMENT CREATE FAILED: %', v_result;
  END IF;

  v_result := public.self_order_create_payment_request(
    v_one_token,
    v_momo_op,
    'momo',
    '{}'::jsonb
  );
  IF COALESCE((v_result ->> 'idempotent')::boolean, false) IS NOT true
     OR (v_result ->> 'id')::bigint <> v_momo_payment_request THEN
    RAISE EXCEPTION 'MOMO PAYMENT REPLAY FAILED: %', v_result;
  END IF;
  SELECT count(*)
  INTO v_count
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_tenant
    AND pr.client_op_id = v_momo_op;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'MOMO PAYMENT REPLAY DUPLICATED REQUEST: %', v_count;
  END IF;

  SELECT pr.payment_id, p.provider_ref, p.amount
  INTO v_momo_payment, v_momo_provider_ref, v_momo_amount
  FROM public.self_order_payment_requests pr
  JOIN public.payments p
    ON p.id = pr.payment_id
   AND p.tenant_id = pr.tenant_id
   AND p.branch_id = pr.branch_id
   AND p.order_id = pr.order_id
  WHERE pr.id = v_momo_payment_request
    AND pr.order_id = v_one_order
    AND pr.method = 'momo'
    AND pr.status = 'momo_pending'
    AND p.method = 'momo'
    AND p.status = 'pending'
    AND p.amount = pr.amount_snapshot
    AND p.amount > 0;
  IF v_momo_payment IS NULL THEN
    RAISE EXCEPTION 'MOMO PAYMENT REQUEST BINDING FAILED';
  END IF;

  v_result := public.claim_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim
  );
  IF v_result ->> 'status' <> 'claimed' THEN
    RAISE EXCEPTION 'MOMO CHECKOUT CLAIM FAILED: %', v_result;
  END IF;
  v_result := public.claim_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_other_claim
  );
  IF v_result ->> 'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'MOMO CONCURRENT CLAIM WAS NOT BLOCKED: %', v_result;
  END IF;
  v_result := public.recover_momo_checkout_request(v_one_token, v_momo_op);
  IF v_result ->> 'id' <> v_momo_payment_request::text
     OR v_result ->> 'status' <> 'momo_pending'
     OR v_result ->> 'redirectUrl' IS NOT NULL THEN
    RAISE EXCEPTION 'MOMO CRASH RECOVERY CONTEXT FAILED: %', v_result;
  END IF;
  ALTER TABLE public.self_order_payment_requests
    DISABLE TRIGGER trg_self_order_enforce_payment_request_invariants;
  UPDATE public.self_order_payment_requests
  SET momo_checkout_claimed_at = now() - interval '3 minutes'
  WHERE id = v_momo_payment_request;
  ALTER TABLE public.self_order_payment_requests
    ENABLE TRIGGER trg_self_order_enforce_payment_request_invariants;
  v_result := public.claim_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_other_claim
  );
  IF v_result ->> 'status' <> 'claimed' THEN
    RAISE EXCEPTION 'MOMO STALE CHECKOUT CLAIM WAS NOT RECOVERED: %', v_result;
  END IF;
  v_result := public.release_momo_checkout_claim(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_other_claim,
    jsonb_build_object('failureClass', 'provider_transport')
  );
  IF v_result ->> 'status' <> 'released'
     OR NOT EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       JOIN public.payments p ON p.id = pr.payment_id
       JOIN public.orders o ON o.id = pr.order_id
       WHERE pr.id = v_momo_payment_request
         AND pr.status = 'momo_pending'
         AND pr.momo_checkout_url IS NULL
         AND pr.momo_checkout_claim_id IS NULL
         AND pr.momo_checkout_claimed_at IS NULL
         AND p.status = 'pending'
         AND p.provider_data ? 'checkoutClaimReleasedAt'
         AND o.payment_status = 'pending'
         AND o.payment_method = 'momo'
     ) THEN
    RAISE EXCEPTION 'MOMO CLAIM RELEASE TERMINALIZED PAYMENT: %', v_result;
  END IF;
  v_result := public.claim_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_other_claim
  );
  IF v_result ->> 'status' <> 'claimed' THEN
    RAISE EXCEPTION 'MOMO RELEASED CHECKOUT COULD NOT BE RETRIED: %', v_result;
  END IF;
  v_result := public.set_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_other_claim,
    NULL,
    v_momo_provider_ref
  );
  IF v_result ->> 'status' <> 'invalid_checkout_data' THEN
    RAISE EXCEPTION 'MOMO NULL CHECKOUT URL WAS ACCEPTED: %', v_result;
  END IF;
  v_result := public.set_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_other_claim,
    'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref,
    v_momo_provider_ref
  );
  IF v_result ->> 'status' <> 'stored' THEN
    RAISE EXCEPTION 'MOMO CHECKOUT STORE FAILED: %', v_result;
  END IF;
  v_result := public.self_order_get_snapshot(v_one_token);
  IF v_result #>> '{paymentRequest,redirectUrl}' <>
     'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref THEN
    RAISE EXCEPTION 'MOMO CHECKOUT RESUME URL MISSING FROM SNAPSHOT: %', v_result;
  END IF;
  v_result := public.set_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_other_claim,
    'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref,
    'different-request-id'
  );
  IF v_result ->> 'status' <> 'invalid_checkout_data' THEN
    RAISE EXCEPTION 'MOMO CHECKOUT REQUEST ID CONFLICT WAS ACCEPTED: %', v_result;
  END IF;
  v_result := public.release_momo_checkout_claim(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim,
    '{}'::jsonb
  );
  IF v_result ->> 'status' <> 'stored'
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       JOIN public.self_order_payment_requests pr ON pr.payment_id = p.id
       WHERE p.id = v_momo_payment
         AND p.status = 'pending'
         AND pr.status = 'momo_pending'
     ) THEN
    RAISE EXCEPTION 'MOMO LOSING CLAIM CANCELLED A STORED CHECKOUT: %', v_result;
  END IF;
  BEGIN
    UPDATE public.self_order_payment_requests
    SET momo_checkout_url =
      'https://test-payment.momo.vn/v2/gateway/pay?t=rewrite'
    WHERE id = v_momo_payment_request;
    RAISE EXCEPTION 'MOMO CHECKOUT URL REWRITE WAS ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  BEGIN
    UPDATE public.self_order_payment_requests
    SET momo_checkout_url = NULL
    WHERE id = v_momo_payment_request;
    RAISE EXCEPTION 'MOMO CHECKOUT URL CLEAR WAS ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.self_order_create_payment_request(
      v_one_token,
      gen_random_uuid(),
      'cash_call',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'MOMO ACTIVE INTENT ALLOWED A SECOND PAYMENT METHOD';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'self_order_pending_payment_exists' THEN
      RAISE;
    END IF;
  END;

  SELECT public.confirm_momo_payment(
    v_tenant,
    v_momo_payment,
    p.provider_ref,
    '4032041704091',
    p.amount - 1,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', p.provider_ref,
      'orderId', p.provider_ref,
      'amount', p.amount
    )
  )
  INTO v_result
  FROM public.payments p
  WHERE p.id = v_momo_payment;
  IF v_result ->> 'status' <> 'amount_mismatch' THEN
    RAISE EXCEPTION 'MOMO AMOUNT MISMATCH MUST NOT SETTLE: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.id = v_momo_payment
      AND p.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'MOMO AMOUNT MISMATCH MUTATED PAYMENT';
  END IF;

  v_result := public.fail_momo_payment(
    v_tenant,
    v_momo_payment,
    v_momo_provider_ref,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', 'wrong-request-id',
      'orderId', v_momo_provider_ref,
      'amount', v_momo_amount
    )
  );
  IF v_result ->> 'status' <> 'payment_request_mismatch'
     OR NOT EXISTS (
       SELECT 1 FROM public.payments p
       WHERE p.id = v_momo_payment AND p.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'MOMO FAILURE REQUEST BINDING MUTATED PAYMENT: %', v_result;
  END IF;

  v_result := public.fail_momo_payment(
    v_tenant,
    v_momo_payment,
    v_momo_provider_ref,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', v_momo_provider_ref,
      'orderId', v_momo_provider_ref,
      'amount', v_momo_amount - 1
    )
  );
  IF v_result ->> 'status' <> 'amount_mismatch'
     OR NOT EXISTS (
       SELECT 1 FROM public.payments p
       WHERE p.id = v_momo_payment AND p.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'MOMO FAILURE AMOUNT MISMATCH MUTATED PAYMENT: %', v_result;
  END IF;

  v_result := public.fail_momo_payment(
    v_tenant,
    v_momo_payment,
    v_momo_provider_ref,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', v_momo_provider_ref,
      'orderId', v_momo_provider_ref,
      'amount', v_momo_amount,
      'reason', 'checkout_failed'
    )
  );
  IF v_result ->> 'status' <> 'failed'
     OR NOT EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       JOIN public.payments p ON p.id = pr.payment_id
       JOIN public.orders o ON o.id = pr.order_id
       WHERE pr.id = v_momo_payment_request
         AND pr.status = 'cancelled'
         AND p.status = 'failed'
         AND o.payment_status = 'unpaid'
         AND o.payment_method IS NULL
     ) THEN
    RAISE EXCEPTION 'MOMO FAILURE DID NOT RELEASE ORDER: %', v_result;
  END IF;

  DECLARE
    v_mismatch_request bigint;
    v_mismatch_payment bigint;
    v_mismatch_provider_ref text;
    v_mismatch_amount numeric;
    v_mismatch_item bigint;
    v_mismatch_result jsonb;
  BEGIN
    SELECT oi.id
    INTO v_mismatch_item
    FROM public.order_items oi
    WHERE oi.order_id = v_one_order
      AND oi.status <> 'cancelled'
    ORDER BY oi.id
    LIMIT 1;

    UPDATE public.order_items
    SET unit_price = unit_price + 10
    WHERE id = v_mismatch_item;

    v_mismatch_result := public.self_order_create_payment_request(
      v_one_token,
      gen_random_uuid(),
      'momo',
      '{}'::jsonb
    );
    v_mismatch_request := (v_mismatch_result ->> 'id')::bigint;
    SELECT pr.payment_id, p.provider_ref, p.amount
    INTO v_mismatch_payment, v_mismatch_provider_ref, v_mismatch_amount
    FROM public.self_order_payment_requests pr
    JOIN public.payments p ON p.id = pr.payment_id
    WHERE pr.id = v_mismatch_request;

    v_mismatch_result := public.confirm_momo_payment(
      v_tenant,
      v_mismatch_payment,
      v_mismatch_provider_ref,
      '4032041704092',
      v_mismatch_amount,
      jsonb_build_object(
        'paymentRequestId', v_mismatch_request,
        'requestId', v_mismatch_provider_ref,
        'orderId', v_mismatch_provider_ref,
        'amount', v_mismatch_amount
      )
    );
    IF v_mismatch_result ->> 'status' <>
         'payment_state_conflict_needs_review'
       OR NOT EXISTS (
         SELECT 1
         FROM public.payments p
         WHERE p.id = v_mismatch_payment
           AND p.status = 'pending'
           AND p.provider_data ->> 'transactionId' = '4032041704092'
           AND COALESCE(
             (p.provider_data ->> 'localEvidenceMismatchRequiresReview')::boolean,
             false
           )
       ) THEN
      RAISE EXCEPTION 'MOMO LOCAL EVIDENCE MISMATCH WAS NOT QUARANTINED: %',
        v_mismatch_result;
    END IF;

    RAISE EXCEPTION 'rollback_momo_local_mismatch_fixture'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'rollback_momo_local_mismatch_fixture' THEN
      RAISE;
    END IF;
  END;

  v_momo_op := gen_random_uuid();
  v_result := public.self_order_create_payment_request(
    v_one_token,
    v_momo_op,
    'momo',
    '{}'::jsonb
  );
  v_momo_payment_request := (v_result ->> 'id')::bigint;
  IF v_result ->> 'status' <> 'momo_pending' THEN
    RAISE EXCEPTION 'MOMO RETRY AFTER FAILURE FAILED: %', v_result;
  END IF;

  SELECT pr.payment_id, p.provider_ref, p.amount, o.payment_code
  INTO
    v_momo_payment,
    v_momo_provider_ref,
    v_momo_amount,
    v_momo_order_payment_code
  FROM public.self_order_payment_requests pr
  JOIN public.payments p ON p.id = pr.payment_id
  JOIN public.orders o ON o.id = pr.order_id
  WHERE pr.id = v_momo_payment_request;

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
  BEGIN
    PERFORM public.self_order_cancel_payment_request(
      v_momo_payment_request,
      'momo_staff_cancel_test'
    );
    RAISE EXCEPTION 'MOMO STAFF CANCEL WAS ACCEPTED';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    PERFORM public.cancel_pending_payment(
      v_momo_payment,
      v_tenant,
      v_branch
    );
    RAISE EXCEPTION 'GENERIC MOMO PAYMENT CANCEL WAS ACCEPTED';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    PERFORM public.confirm_cash_payment_with_invoice_binding(
      v_one_order,
      v_momo_amount
    );
    RAISE EXCEPTION 'CASH OVERWROTE PENDING MOMO';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    PERFORM public.confirm_vietqr_payment(
      v_tenant,
      v_branch,
      v_one_order,
      v_momo_amount,
      v_profile
    );
    RAISE EXCEPTION 'VIETQR OVERWROTE PENDING MOMO';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', v_branch_operator::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_branch_operator::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );
  BEGIN
    PERFORM public.cancel_order(v_one_order, 'momo_cancel_guard_test');
    RAISE EXCEPTION 'ORDER CANCEL DISCARDED PENDING MOMO';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  IF NOT EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    JOIN public.payments p ON p.id = pr.payment_id
    JOIN public.orders o ON o.id = pr.order_id
    WHERE pr.id = v_momo_payment_request
      AND pr.status = 'momo_pending'
      AND p.id = v_momo_payment
      AND p.status = 'pending'
      AND p.method = 'momo'
      AND o.payment_status = 'pending'
      AND o.payment_method = 'momo'
  ) THEN
    RAISE EXCEPTION 'MOMO CANCEL OR METHOD GUARD MUTATED PAYMENT STATE';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF has_function_privilege(
       'service_role',
       'public.confirm_sepay_payment(bigint,bigint,text,numeric,text,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'SERVICE ROLE CAN BYPASS SEPAY RECONCILIATION GATE';
  END IF;
  IF has_function_privilege(
       'service_role',
       'public.confirm_cash_payment(bigint,numeric)',
       'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SERVICE ROLE CAN CALL RAW CASH PAYMENT RPC';
  END IF;
  IF has_function_privilege(
       'service_role',
       'public.complete_payment_and_consume_stock(bigint,numeric,jsonb,uuid)',
       'EXECUTE'
     ) OR has_function_privilege(
       'service_role',
       'public.finalize_paid_order(bigint,uuid)',
       'EXECUTE'
     ) OR has_function_privilege(
       'service_role',
       'public.confirm_payment_and_post(bigint,bigint,bigint,text)',
       'EXECUTE'
     ) OR has_function_privilege(
       'service_role',
       'public.transition_order_status(bigint,text,text,text)',
       'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SERVICE ROLE CAN CALL RAW PAYMENT OR ORDER LIFECYCLE RPC';
  END IF;
  IF has_function_privilege(
       'anon',
       'public.claim_momo_reconciliation_by_token(text,uuid,uuid)',
       'EXECUTE'
     ) OR has_function_privilege(
       'authenticated',
       'public.claim_momo_reconciliation_by_token(text,uuid,uuid)',
       'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role',
       'public.claim_momo_reconciliation_by_token(text,uuid,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'MOMO TOKEN RECONCILIATION PRIVILEGE BOUNDARY FAILED';
  END IF;

  v_momo_claim := gen_random_uuid();
  v_result := public.claim_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim
  );
  IF v_result ->> 'status' <> 'claimed' THEN
    RAISE EXCEPTION 'MOMO AGED CHECKOUT CLAIM FAILED: %', v_result;
  END IF;
  v_result := public.release_momo_checkout_claim(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim,
    jsonb_build_object('reason', 'checkout_transport_ambiguous')
  );
  IF v_result ->> 'status' <> 'released' THEN
    RAISE EXCEPTION 'MOMO NO-URL CHECKOUT CLAIM RELEASE FAILED: %', v_result;
  END IF;
  v_result := public.claim_momo_reconciliation_by_token(
    v_one_token,
    v_momo_op,
    v_momo_reconcile_claim
  );
  IF v_result ->> 'status' <> 'not_due' THEN
    RAISE EXCEPTION 'FRESH NO-URL MOMO ATTEMPT WAS NOT QUERY-ELIGIBLE: %', v_result;
  END IF;
  v_momo_claim := gen_random_uuid();
  v_result := public.claim_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim
  );
  IF v_result ->> 'status' <> 'claimed' THEN
    RAISE EXCEPTION 'MOMO NO-URL CHECKOUT RETRY CLAIM FAILED: %', v_result;
  END IF;
  v_result := public.set_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim,
    'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref,
    v_momo_provider_ref
  );
  IF v_result ->> 'status' <> 'stored' THEN
    RAISE EXCEPTION 'MOMO AGED CHECKOUT STORE FAILED: %', v_result;
  END IF;

  v_result := public.claim_momo_reconciliation_by_token(
    v_one_token,
    v_momo_op,
    v_momo_reconcile_claim
  );
  IF v_result ->> 'status' <> 'not_due' THEN
    RAISE EXCEPTION 'FRESH MOMO RECONCILIATION WAS CLAIMED: %', v_result;
  END IF;
  BEGIN
    PERFORM *
    FROM public.claim_momo_reconciliation_batch(
      gen_random_uuid(),
      1,
      NULL
    );
    RAISE EXCEPTION 'NULL MOMO RECONCILIATION AGE WAS ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'invalid_momo_reconciliation_claim' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('app.momo_settlement_order_id', v_one_order::text, true);
  PERFORM set_config('app.momo_settlement_payment_id', v_momo_payment::text, true);
  UPDATE public.payments
  SET created_at = now() - interval '25 hours'
  WHERE id = v_momo_payment;
  PERFORM set_config('app.momo_settlement_order_id', '', true);
  PERFORM set_config('app.momo_settlement_payment_id', '', true);

  FOREACH v_invalid_threshold IN ARRAY ARRAY[
    NULL::interval,
    interval '0 seconds',
    interval '14 minutes 59 seconds',
    interval '31 days'
  ] LOOP
    BEGIN
      PERFORM public.cleanup_abandoned_payments(v_invalid_threshold);
      RAISE EXCEPTION 'INVALID PAYMENT JANITOR THRESHOLD WAS ACCEPTED: %',
        v_invalid_threshold;
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'invalid_cleanup_threshold' THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  SELECT pg_get_functiondef(
    'public.cleanup_abandoned_payments(interval)'::regprocedure
  )
  INTO v_function_definition;
  IF position('ORDER BY p.order_id, p.id' IN v_function_definition) = 0
     OR position('pg_advisory_xact_lock' IN v_function_definition) = 0
     OR position('FOR UPDATE' IN v_function_definition) = 0
     OR position('ORDER BY p.order_id, p.id' IN v_function_definition) >=
        position('pg_advisory_xact_lock' IN v_function_definition)
     OR position('pg_advisory_xact_lock' IN v_function_definition) >=
        position('FOR UPDATE' IN v_function_definition) THEN
    RAISE EXCEPTION 'PAYMENT JANITOR LOCK ORDER CONTRACT FAILED';
  END IF;
  PERFORM public.cleanup_abandoned_payments();
  IF NOT EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    JOIN public.payments p ON p.id = pr.payment_id
    JOIN public.orders o ON o.id = pr.order_id
    WHERE pr.id = v_momo_payment_request
      AND pr.status = 'momo_pending'
      AND p.id = v_momo_payment
      AND p.method = 'momo'
      AND p.status = 'pending'
      AND o.payment_status = 'pending'
      AND o.payment_method = 'momo'
  ) THEN
    RAISE EXCEPTION 'PAYMENT JANITOR TERMINALIZED PENDING MOMO';
  END IF;

  ALTER TABLE public.self_order_payment_requests
    DISABLE TRIGGER trg_self_order_enforce_payment_request_invariants;
  UPDATE public.self_order_payment_requests
  SET created_at = now() - interval '25 hours',
      expires_at = now() - interval '1 minute'
  WHERE id = v_momo_payment_request;
  ALTER TABLE public.self_order_payment_requests
    ENABLE TRIGGER trg_self_order_enforce_payment_request_invariants;
  v_expired := public.self_order_expire_payment_request(v_momo_payment_request);
  IF v_expired OR NOT EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       JOIN public.payments p ON p.id = pr.payment_id
       JOIN public.orders o ON o.id = pr.order_id
       WHERE pr.id = v_momo_payment_request
         AND pr.status = 'momo_pending'
         AND p.status = 'pending'
         AND p.method = 'momo'
         AND o.payment_status = 'pending'
         AND o.payment_method = 'momo'
     ) THEN
    RAISE EXCEPTION 'LOCAL EXPIRY TERMINALIZED PENDING MOMO';
  END IF;

  v_result := public.self_order_get_snapshot(v_one_token);
  IF v_result #>> '{paymentRequest,id}' <> v_momo_payment_request::text
     OR v_result #>> '{paymentRequest,status}' <> 'momo_pending'
     OR v_result #>> '{paymentRequest,redirectUrl}' <>
       'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref THEN
    RAISE EXCEPTION 'AGED MOMO REQUEST DISAPPEARED FROM SNAPSHOT: %', v_result;
  END IF;
  v_result := public.recover_momo_checkout_request(v_one_token, v_momo_op);
  IF v_result ->> 'id' <> v_momo_payment_request::text
     OR v_result ->> 'status' <> 'momo_pending'
     OR v_result ->> 'redirectUrl' <>
       'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref THEN
    RAISE EXCEPTION 'AGED MOMO REQUEST COULD NOT BE RECOVERED: %', v_result;
  END IF;

  v_result := public.claim_momo_reconciliation_by_token(
    v_one_token,
    v_momo_op,
    v_momo_reconcile_claim
  );
  IF v_result ->> 'status' <> 'claimed'
     OR v_result ->> 'paymentId' <> v_momo_payment::text
     OR v_result ->> 'paymentRequestId' <> v_momo_payment_request::text
     OR v_result ->> 'providerRef' <> v_momo_provider_ref
     OR (v_result ->> 'amount')::numeric <> v_momo_amount THEN
    RAISE EXCEPTION 'AGED MOMO RECONCILIATION CLAIM FAILED: %', v_result;
  END IF;

  v_result := public.claim_momo_reconciliation_request(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_reconcile_other_claim
  );
  IF v_result ->> 'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'MOMO RECONCILIATION CLAIM WAS STOLEN: %', v_result;
  END IF;

  v_result := public.release_momo_reconciliation_claim(
    v_tenant,
    v_momo_payment_request,
    v_momo_reconcile_other_claim,
    jsonb_build_object('queryDisposition', 'wrong_claim')
  );
  IF v_result ->> 'status' <> 'claim_lost' THEN
    RAISE EXCEPTION 'WRONG MOMO RECONCILIATION CLAIM RELEASED: %', v_result;
  END IF;

  v_result := public.release_momo_reconciliation_claim(
    v_tenant,
    v_momo_payment_request,
    v_momo_reconcile_claim,
    jsonb_build_object('queryDisposition', 'pending')
  );
  IF v_result ->> 'status' <> 'released'
     OR NOT EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       JOIN public.payments p ON p.id = pr.payment_id
       WHERE pr.id = v_momo_payment_request
         AND pr.momo_reconcile_claim_id IS NULL
         AND pr.momo_reconcile_claimed_at IS NULL
         AND pr.momo_reconcile_last_attempt_at IS NOT NULL
         AND p.provider_data ->> 'queryDisposition' = 'pending'
     ) THEN
    RAISE EXCEPTION 'MOMO RECONCILIATION CLAIM RELEASE FAILED: %', v_result;
  END IF;

  v_result := public.claim_momo_reconciliation_request(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_reconcile_other_claim
  );
  IF v_result ->> 'status' <> 'rate_limited' THEN
    RAISE EXCEPTION 'MOMO RECONCILIATION RATE LIMIT FAILED: %', v_result;
  END IF;

  ALTER TABLE public.self_order_payment_requests
    DISABLE TRIGGER trg_self_order_enforce_payment_request_invariants;
  UPDATE public.self_order_payment_requests
  SET momo_reconcile_last_attempt_at = now() - interval '3 minutes'
  WHERE id = v_momo_payment_request;
  ALTER TABLE public.self_order_payment_requests
    ENABLE TRIGGER trg_self_order_enforce_payment_request_invariants;

  SELECT jsonb_build_object(
    'tenantId', claimed.tenant_id,
    'paymentId', claimed.payment_id,
    'paymentRequestId', claimed.payment_request_id,
    'providerRef', claimed.provider_ref,
    'amount', claimed.amount
  )
  INTO v_result
  FROM public.claim_momo_reconciliation_batch(
    v_momo_reconcile_other_claim,
    50,
    interval '5 minutes'
  ) AS claimed
  WHERE claimed.payment_request_id = v_momo_payment_request;

  IF v_result IS NULL
     OR v_result ->> 'paymentId' <> v_momo_payment::text
     OR v_result ->> 'paymentRequestId' <> v_momo_payment_request::text
     OR v_result ->> 'providerRef' <> v_momo_provider_ref
     OR (v_result ->> 'amount')::numeric <> v_momo_amount THEN
    RAISE EXCEPTION 'MOMO RECONCILIATION BATCH CLAIM FAILED: %', v_result;
  END IF;

  ALTER TABLE public.self_order_payment_requests
    DISABLE TRIGGER trg_self_order_enforce_payment_request_invariants;
  UPDATE public.self_order_payment_requests
  SET momo_reconcile_claimed_at = now() - interval '3 minutes'
  WHERE id = v_momo_payment_request;
  ALTER TABLE public.self_order_payment_requests
    ENABLE TRIGGER trg_self_order_enforce_payment_request_invariants;

  v_result := public.claim_momo_reconciliation_request(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_reconcile_claim
  );
  IF v_result ->> 'status' <> 'in_progress'
     OR NOT EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       WHERE pr.id = v_momo_payment_request
         AND pr.momo_reconcile_claim_id = v_momo_reconcile_other_claim
     ) THEN
    RAISE EXCEPTION 'LIVE MOMO RECONCILIATION LEASE WAS STOLEN: %', v_result;
  END IF;

  ALTER TABLE public.self_order_payment_requests
    DISABLE TRIGGER trg_self_order_enforce_payment_request_invariants;
  UPDATE public.self_order_payment_requests
  SET momo_reconcile_claimed_at = now() - interval '11 minutes'
  WHERE id = v_momo_payment_request;
  ALTER TABLE public.self_order_payment_requests
    ENABLE TRIGGER trg_self_order_enforce_payment_request_invariants;

  v_result := public.claim_momo_reconciliation_request(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_reconcile_claim
  );
  IF v_result ->> 'status' <> 'claimed'
     OR NOT EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       WHERE pr.id = v_momo_payment_request
         AND pr.momo_reconcile_claim_id = v_momo_reconcile_claim
     ) THEN
    RAISE EXCEPTION 'STALE MOMO RECONCILIATION CLAIM WAS NOT RECOVERED: %', v_result;
  END IF;

  BEGIN
    v_result := public.fail_momo_payment(
      v_tenant,
      v_momo_payment,
      v_momo_provider_ref,
      jsonb_build_object(
        'paymentRequestId', v_momo_payment_request,
        'requestId', v_momo_provider_ref,
        'orderId', v_momo_provider_ref,
        'amount', v_momo_amount,
        'resultCode', 1006
      )
    );
    IF v_result ->> 'status' <> 'failed'
       OR NOT EXISTS (
         SELECT 1
         FROM public.self_order_payment_requests pr
         JOIN public.payments p ON p.id = pr.payment_id
         WHERE pr.id = v_momo_payment_request
           AND pr.status = 'cancelled'
           AND pr.momo_reconcile_claim_id IS NULL
           AND pr.momo_reconcile_claimed_at IS NULL
           AND pr.momo_reconcile_last_attempt_at IS NOT NULL
           AND p.status = 'failed'
       ) THEN
      RAISE EXCEPTION 'MOMO FAILURE DID NOT CLEAR RECONCILIATION CLAIM: %', v_result;
    END IF;
    v_result := public.release_momo_reconciliation_claim(
      v_tenant,
      v_momo_payment_request,
      v_momo_reconcile_claim,
      jsonb_build_object('queryDisposition', 'final_failure')
    );
    IF v_result ->> 'status' <> 'already_released' THEN
      RAISE EXCEPTION 'TERMINAL MOMO CLAIM RELEASE WAS NOT IDEMPOTENT: %', v_result;
    END IF;
    RAISE EXCEPTION 'rollback_momo_failure_claim_fixture';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_momo_failure_claim_fixture' THEN
      RAISE;
    END IF;
  END;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant,
    'sepay',
    'sepay-during-momo-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_momo_amount,
      'content', 'PAY ' || v_momo_order_payment_code || ' EXACT',
      'accountNumber', '',
      'referenceCode', 'sepay-during-momo'
    ),
    'received'
  )
  RETURNING id INTO v_sepay_event;

  v_result := public.reconcile_sepay_order_evidence(
    v_sepay_event,
    v_momo_order_payment_code
  );
  IF v_result ->> 'status' <> 'payment_method_conflict_needs_review'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       JOIN public.self_order_payment_requests pr
         ON pr.id = v_momo_payment_request
       JOIN public.payments p ON p.id = v_momo_payment
       JOIN public.orders o ON o.id = v_one_order
       WHERE e.id = v_sepay_event
         AND e.order_id = v_one_order
         AND e.payment_id IS NULL
         AND e.processing_status = 'processed'
         AND e.error_code = 'payment_method_conflict_needs_review'
         AND pr.status = 'momo_pending'
         AND p.method = 'momo'
         AND p.status = 'pending'
         AND o.payment_status = 'pending'
         AND o.payment_method = 'momo'
     ) THEN
    RAISE EXCEPTION 'SEPAY OVERWROTE PENDING MOMO EVIDENCE: %', v_result;
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant,
    'sepay',
    'sepay-wrong-amount-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_momo_amount + 1,
      'content', 'PAY ' || v_momo_order_payment_code || ' EXACT',
      'accountNumber', '',
      'referenceCode', 'sepay-wrong-amount'
    ),
    'received'
  )
  RETURNING id INTO v_sepay_event;

  v_result := public.reconcile_sepay_order_evidence(
    v_sepay_event,
    v_momo_order_payment_code
  );
  IF v_result ->> 'status' <> 'amount_mismatch'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       WHERE e.id = v_sepay_event
         AND e.payment_id IS NULL
         AND e.error_code = 'amount_mismatch'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.id = v_momo_payment
         AND p.method = 'momo'
         AND p.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'SEPAY WRONG AMOUNT MUTATED PAYMENT: %', v_result;
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant,
    'sepay',
    'sepay-content-mismatch-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_momo_amount,
      'content', 'UNRELATED PAYMENT TOKEN',
      'accountNumber', '',
      'referenceCode', 'sepay-content-mismatch'
    ),
    'received'
  )
  RETURNING id INTO v_sepay_event;

  v_result := public.reconcile_sepay_order_evidence(
    v_sepay_event,
    v_momo_order_payment_code
  );
  IF v_result ->> 'status' <> 'order_not_found'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       WHERE e.id = v_sepay_event
         AND e.processing_status = 'failed'
         AND e.error_code = 'order_not_found'
         AND e.order_id IS NULL
         AND e.payment_id IS NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.id = v_momo_payment
         AND p.method = 'momo'
         AND p.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'SEPAY REQUESTED CODE BYPASSED CONTENT MATCH: %', v_result;
  END IF;

  v_momo_claim := gen_random_uuid();
  v_result := public.claim_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim
  );
  IF v_result ->> 'status' <> 'stored'
     OR v_result ->> 'redirectUrl' <>
       'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref THEN
    RAISE EXCEPTION 'MOMO FINAL CHECKOUT CLAIM FAILED: %', v_result;
  END IF;
  v_result := public.set_momo_checkout(
    v_tenant,
    v_momo_payment,
    v_momo_payment_request,
    v_momo_provider_ref,
    v_momo_claim,
    'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref,
    v_momo_provider_ref
  );
  IF v_result ->> 'status' <> 'stored' THEN
    RAISE EXCEPTION 'MOMO FINAL CHECKOUT STORE FAILED: %', v_result;
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

  BEGIN
    PERFORM public.append_order_items(
      v_one_order,
      v_cart,
      gen_random_uuid()
    );
    RAISE EXCEPTION 'PENDING MOMO ALLOWED ORDER ITEM APPEND';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.orders
    SET table_id = v_zero_table
    WHERE id = v_one_order;
    RAISE EXCEPTION 'PENDING MOMO ALLOWED ORDER TABLE TRANSFER';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.order_items
    SET quantity = quantity + 1
    WHERE order_id = v_one_order;
    RAISE EXCEPTION 'PENDING MOMO ALLOWED ORDER ITEM REPRICE';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.kds_tickets
    SET status = 'cancelled'
    WHERE order_id = v_one_order;
    RAISE EXCEPTION 'PENDING MOMO ALLOWED KDS CANCELLATION';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.tables
    SET self_order_token = 'blocked_' || replace(gen_random_uuid()::text, '-', ''),
        self_order_token_rotated_at = now()
    WHERE id = v_one_table;
    RAISE EXCEPTION 'PENDING MOMO ALLOWED TABLE TOKEN ROTATION';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'self_order_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.tables
    SET self_order_enabled = false
    WHERE id = v_one_table;
    RAISE EXCEPTION 'PENDING MOMO ALLOWED SELF ORDER DISABLE';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'self_order_payment_pending' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    UPDATE public.tables
    SET status = 'maintenance'
    WHERE id = v_one_table;
    RAISE EXCEPTION 'PENDING MOMO ALLOWED TABLE MAINTENANCE';
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    IF SQLERRM <> 'self_order_payment_pending' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.printers
  SET is_active = false
  WHERE tenant_id = v_tenant
    AND branch_id = v_branch
    AND role = 'receipt';

  v_result := public.confirm_momo_payment(
    v_tenant,
    v_momo_payment,
    v_momo_provider_ref,
    '0',
    v_momo_amount,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', v_momo_provider_ref,
      'orderId', v_momo_provider_ref,
      'amount', v_momo_amount
    )
  );
  IF v_result ->> 'status' <> 'invalid_transaction_id'
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.id = v_momo_payment
         AND p.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'ZERO MOMO TRANSACTION ID MUTATED PAYMENT: %', v_result;
  END IF;

  v_result := public.confirm_momo_payment(
    v_tenant,
    v_momo_payment,
    v_momo_provider_ref,
    '4032041704001',
    v_momo_amount,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', v_momo_provider_ref,
      'orderId', v_momo_provider_ref,
      'amount', v_momo_amount
    )
  );
  IF v_result ->> 'status' <> 'completed'
     OR v_result ->> 'print_warning' <> 'receipt_enqueue_failed'
     OR NOT EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       JOIN public.payments p ON p.id = pr.payment_id
       JOIN public.orders o ON o.id = pr.order_id
       WHERE pr.id = v_momo_payment_request
         AND pr.status = 'completed'
         AND pr.momo_reconcile_claim_id IS NULL
         AND pr.momo_reconcile_claimed_at IS NULL
         AND pr.momo_reconcile_last_attempt_at IS NOT NULL
         AND p.status = 'completed'
         AND p.provider_data ->> 'source' = 'self_order_momo'
         AND p.provider_data ? 'invoicePayload'
         AND p.provider_data ->> 'checkoutPayUrl' =
           'https://test-payment.momo.vn/v2/gateway/pay?t=' || v_momo_provider_ref
         AND p.provider_data ->> 'checkoutRequestId' = v_momo_provider_ref
         AND p.provider_data ->> 'transactionId' = '4032041704001'
         AND o.payment_status = 'paid'
         AND o.payment_method = 'momo'
     ) THEN
    RAISE EXCEPTION 'MOMO EXACT SETTLEMENT FAILED: %', v_result;
  END IF;

  v_result := public.confirm_momo_payment(
    v_tenant,
    v_momo_payment,
    v_momo_provider_ref,
    '4032041704001',
    v_momo_amount,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', v_momo_provider_ref,
      'orderId', v_momo_provider_ref,
      'amount', v_momo_amount
    )
  );
  SELECT count(*)
  INTO v_count
  FROM public.payments p
  WHERE p.tenant_id = v_tenant
    AND p.order_id = v_one_order
    AND p.status <> 'failed';
  IF v_result ->> 'status' <> 'already_completed'
     OR v_result ->> 'print_warning' <> 'receipt_enqueue_failed'
     OR v_count <> 1 THEN
    RAISE EXCEPTION 'MOMO SETTLEMENT REPLAY FAILED: %, count=%', v_result, v_count;
  END IF;

  v_result := public.confirm_momo_payment(
    v_tenant,
    v_momo_payment,
    v_momo_provider_ref,
    '4032041704002',
    v_momo_amount,
    jsonb_build_object(
      'paymentRequestId', v_momo_payment_request,
      'requestId', v_momo_provider_ref,
      'orderId', v_momo_provider_ref,
      'amount', v_momo_amount
    )
  );
  IF v_result ->> 'status' <> 'overpayment_needs_review'
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       JOIN public.orders o ON o.id = p.order_id
       WHERE p.id = v_momo_payment
         AND p.method = 'momo'
         AND p.status = 'completed'
         AND p.provider_data ->> 'transactionId' = '4032041704001'
         AND p.provider_data ->> 'conflictingTransactionId' =
           '4032041704002'
         AND o.payment_status = 'paid'
         AND o.payment_method = 'momo'
     ) THEN
    RAISE EXCEPTION 'MOMO CONFLICTING TRANSACTION WAS NOT QUARANTINED: %', v_result;
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
  v_result := public.review_momo_payment_exception(
    v_momo_payment,
    '4032041704002',
    'reviewing',
    NULL
  );
  IF v_result ->> 'status' <> 'reviewing'
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.id = v_momo_payment
         AND p.provider_data #>> '{momoReview,status}' = 'reviewing'
         AND p.provider_data #>> '{momoReview,transactionId}' =
           '4032041704002'
     ) THEN
    RAISE EXCEPTION 'MOMO REVIEW ACKNOWLEDGEMENT FAILED: %', v_result;
  END IF;
  v_result := public.review_momo_payment_exception(
    v_momo_payment,
    '4032041704002',
    'refunded',
    'MOMO-REFUND-4032041704002'
  );
  IF v_result ->> 'status' <> 'refunded'
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.id = v_momo_payment
         AND p.provider_data #>> '{momoReview,status}' = 'refunded'
         AND p.provider_data #>> '{momoReview,resolutionReference}' =
           'MOMO-REFUND-4032041704002'
     ) THEN
    RAISE EXCEPTION 'MOMO EXTERNAL REFUND CLOSURE FAILED: %', v_result;
  END IF;
  v_result := public.review_momo_payment_exception(
    v_momo_payment,
    '4032041704002',
    'refunded',
    'MOMO-REFUND-4032041704002'
  );
  IF v_result ->> 'status' <> 'already_refunded' THEN
    RAISE EXCEPTION 'MOMO REFUND CLOSURE WAS NOT IDEMPOTENT: %', v_result;
  END IF;
  BEGIN
    PERFORM public.correct_payment_method(
      v_momo_payment,
      'cash',
      'momo correction guard acceptance test'
    );
    RAISE EXCEPTION 'MOMO PAYMENT METHOD CORRECTION WAS ACCEPTED';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'momo_method_correction_not_supported' THEN
      RAISE;
    END IF;
  END;
  IF NOT EXISTS (
    SELECT 1
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.id = v_momo_payment
      AND p.method = 'momo'
      AND p.status = 'completed'
      AND o.payment_status = 'paid'
      AND o.payment_method = 'momo'
  ) THEN
    RAISE EXCEPTION 'MOMO METHOD CORRECTION GUARD MUTATED PAYMENT';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT payment_code
  INTO v_momo_order_payment_code
  FROM public.orders
  WHERE id = v_one_order;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant,
    'sepay',
    'sepay-after-momo-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_momo_amount,
      'content', v_momo_order_payment_code,
      'accountNumber', '',
      'referenceCode', 'sepay-after-momo'
    ),
    'received'
  )
  RETURNING id INTO v_sepay_event;

  v_result := public.reconcile_sepay_order_evidence(
    v_sepay_event,
    v_momo_order_payment_code
  );
  IF v_result ->> 'status' <> 'overpayment_needs_review'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       JOIN public.payments p ON p.id = v_momo_payment
       JOIN public.orders o ON o.id = v_one_order
       WHERE e.id = v_sepay_event
         AND e.order_id = v_one_order
         AND e.payment_id IS NULL
         AND e.processing_status = 'processed'
         AND e.error_code = 'overpayment_needs_review'
         AND p.method = 'momo'
         AND p.status = 'completed'
         AND p.provider_data ->> 'transactionId' = '4032041704001'
         AND o.payment_status = 'paid'
         AND o.payment_method = 'momo'
     ) THEN
    RAISE EXCEPTION 'SEPAY OVERWROTE COMPLETED MOMO EVIDENCE: %', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.self_order_submit(v_zero_token, v_cart, NULL, v_zero_op);
  IF v_result ->> 'status' <> 'pending'
     OR (v_result ->> 'openOrderCount')::integer <> 0 THEN
    RAISE EXCEPTION 'ZERO ORDER FAILED: %', v_result;
  END IF;
  v_zero_request := (v_result ->> 'requestId')::bigint;

  v_add_cart := jsonb_build_array(jsonb_build_object(
    'menu_item_id', v_menu_item,
    'quantity', 2,
    'modifiers', '[]'::jsonb,
    'sides', '[]'::jsonb
  ));
  v_result := public.self_order_submit(
    v_zero_token,
    v_add_cart,
    'them mon',
    v_zero_add_op
  );
  IF v_result ->> 'status' <> 'pending'
     OR (v_result ->> 'requestId')::bigint <> v_zero_request THEN
    RAISE EXCEPTION 'PENDING ADD-MORE MUST MERGE: %', v_result;
  END IF;
  SELECT COALESCE(sum((item.value ->> 'quantity')::integer), 0)
  INTO v_count
  FROM public.self_order_requests r
  CROSS JOIN LATERAL jsonb_array_elements(r.cart_payload) AS item(value)
  WHERE r.id = v_zero_request;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'PENDING ADD-MORE ITEMS MISSING: %', v_count;
  END IF;
  v_result := public.self_order_submit(
    v_zero_token,
    v_add_cart,
    'them mon',
    v_zero_add_op
  );
  IF COALESCE((v_result ->> 'idempotent')::boolean, false) IS NOT true THEN
    RAISE EXCEPTION 'PENDING ADD-MORE REPLAY FAILED: %', v_result;
  END IF;
  SELECT COALESCE(sum((item.value ->> 'quantity')::integer), 0)
  INTO v_count
  FROM public.self_order_requests r
  CROSS JOIN LATERAL jsonb_array_elements(r.cart_payload) AS item(value)
  WHERE r.id = v_zero_request;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'PENDING ADD-MORE REPLAY DUPLICATED ITEMS: %', v_count;
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
