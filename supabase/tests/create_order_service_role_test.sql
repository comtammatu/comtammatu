-- =============================================================
-- Test: create_order execution under service_role vs anon
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/create_order_service_role_test.sql
--
-- Safe to run repeatedly. The outer transaction rolls back.
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant       BIGINT;
  v_branch       BIGINT;
  v_staff_id     UUID;
  v_menu_item_id BIGINT;
  v_items        JSONB;
  v_result       JSONB;
  v_order_id     BIGINT;
  v_err_code     TEXT;
  v_err_msg      TEXT;
BEGIN
  -- 1. Setup fixture data
  SELECT id INTO v_tenant FROM public.tenants LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: no tenant found';
  END IF;

  SELECT id INTO v_branch FROM public.branches WHERE tenant_id = v_tenant LIMIT 1;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: no branch found';
  END IF;

  SELECT id INTO v_staff_id FROM public.profiles WHERE tenant_id = v_tenant LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: no profile found';
  END IF;

  SELECT id INTO v_menu_item_id FROM public.menu_items WHERE tenant_id = v_tenant AND is_active = TRUE LIMIT 1;
  IF v_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: no menu_item found';
  END IF;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'menu_item_id', v_menu_item_id,
      'item_name', 'Món Test',
      'quantity', 1,
      'unit_price', 50000,
      'modifiers', '[]'::jsonb,
      'sides', '[]'::jsonb,
      'subtotal', 50000
    )
  );

  -- 2. Test: Anonymous / unauthenticated caller MUST FAIL with 28000
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  BEGIN
    PERFORM public.create_order(
      v_tenant,
      v_branch,
      v_staff_id,
      v_items,
      'delivery',
      NULL,
      NULL,
      'Test anon order',
      NULL,
      'grab',
      'TEST-ANON-001'
    );
    RAISE EXCEPTION 'TEST FAILED: anon caller was allowed to execute create_order';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
      IF v_err_code <> '28000' THEN
        RAISE EXCEPTION 'TEST FAILED: expected 28000 (unauthenticated), got %: %', v_err_code, v_err_msg;
      END IF;
  END;

  -- 3. Test: service_role caller MUST SUCCEED
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  v_result := public.create_order(
    v_tenant,
    v_branch,
    v_staff_id,
    v_items,
    'delivery',
    NULL,
    NULL,
    'Test service_role delivery order',
    NULL,
    'grab',
    'TEST-SRV-001'
  );

  v_order_id := NULLIF(v_result ->> 'order_id', '')::BIGINT;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: service_role create_order did not return a valid order_id';
  END IF;

  -- Verify created order record
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = v_order_id
      AND order_type = 'delivery'
      AND delivery_platform = 'grab'
      AND external_order_ref = 'TEST-SRV-001'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: order record was not properly created by service_role';
  END IF;

  RAISE NOTICE 'SUCCESS: create_order authorization tests passed under service_role and anon';
END;
$$;

ROLLBACK;
