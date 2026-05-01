-- =============================================================
-- Tests for migration 20260514000000 + 20260514000100
--   - Daily-limit enforcement extended to JSONB sides
--   - Split-partial RPC bypasses re-charge via GUC
--
-- Run against a dev DB that has at least 1 tenant, 1 branch, 1
-- profile, and 1 menu_category seeded. Fixtures are created and
-- rolled back at the end. Safe to re-run.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/branch_menu_daily_limit_sides_test.sql
--
-- Or via Supabase CLI:
--   supabase db execute --file supabase/tests/branch_menu_daily_limit_sides_test.sql
--
-- Each test is a DO block with its own BEGIN…EXCEPTION…END. The
-- outer transaction always rolls back. RAISE NOTICE marks pass; any
-- RAISE EXCEPTION fails the run loudly with the test name.
--
-- Concurrency tests (deadlock-free under contention) are NOT in this
-- file — they require pg_isolation_tester or external orchestration.
-- Documented as manual test in the migration header.
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

-- ─── Resolve fixture ids from existing dev seed ─────────────────────
DO $$
DECLARE
  v_tenant   BIGINT;
  v_branch   BIGINT;
  v_profile  UUID;
  v_category BIGINT;
BEGIN
  SELECT t.id INTO v_tenant   FROM public.tenants t LIMIT 1;
  SELECT b.id INTO v_branch   FROM public.branches b WHERE b.tenant_id = v_tenant LIMIT 1;
  SELECT p.id INTO v_profile  FROM public.profiles p WHERE p.tenant_id = v_tenant LIMIT 1;
  SELECT mc.id INTO v_category FROM public.menu_categories mc WHERE mc.tenant_id = v_tenant LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_profile IS NULL OR v_category IS NULL THEN
    RAISE EXCEPTION 'Tests need seed data: tenant=% branch=% profile=% category=%',
      v_tenant, v_branch, v_profile, v_category;
  END IF;

  PERFORM set_config('test.tenant_id',   v_tenant::TEXT,   false);
  PERFORM set_config('test.branch_id',   v_branch::TEXT,   false);
  PERFORM set_config('test.profile_id',  v_profile::TEXT,  false);
  PERFORM set_config('test.category_id', v_category::TEXT, false);

  RAISE NOTICE 'Fixtures: tenant=% branch=% profile=% category=%',
    v_tenant, v_branch, v_profile, v_category;
END;
$$;


-- =============================================================
-- TEST 1 — Disabled side rejected
-- A side item with is_disabled=true must raise daily_limit_item_disabled
-- when an order_items row references it in JSONB sides.
-- =============================================================
DO $$
DECLARE
  v_tenant   BIGINT  := current_setting('test.tenant_id')::BIGINT;
  v_branch   BIGINT  := current_setting('test.branch_id')::BIGINT;
  v_profile  UUID    := current_setting('test.profile_id')::UUID;
  v_category BIGINT  := current_setting('test.category_id')::BIGINT;
  v_main_id  BIGINT;
  v_side_id  BIGINT;
  v_order_id BIGINT;
  v_today    DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_caught   BOOLEAN := false;
BEGIN
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_main_t1_' || gen_random_uuid()::TEXT, 50000)
  RETURNING id INTO v_main_id;
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_side_t1_' || gen_random_uuid()::TEXT, 10000)
  RETURNING id INTO v_side_id;

  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, is_disabled)
  VALUES (v_tenant, v_branch, v_side_id, v_today, true);

  INSERT INTO public.orders (tenant_id, branch_id, order_number, created_by)
  VALUES (v_tenant, v_branch, '__test_t1_' || gen_random_uuid()::TEXT, v_profile)
  RETURNING id INTO v_order_id;

  BEGIN
    INSERT INTO public.order_items
      (tenant_id, order_id, menu_item_id, item_name, quantity, unit_price, sides, subtotal)
    VALUES
      (v_tenant, v_order_id, v_main_id, 'main', 1, 50000,
       jsonb_build_array(jsonb_build_object('side_item_id', v_side_id, 'name', 'side', 'price', 10000, 'quantity', 1)),
       60000);
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM LIKE 'daily_limit_item_disabled:%' THEN
      v_caught := true;
    ELSE
      RAISE EXCEPTION 'TEST 1 wrong error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 1 FAILED: insert with disabled side did not raise';
  END IF;

  RAISE NOTICE 'TEST 1 PASSED: disabled side rejected';
END;
$$;


-- =============================================================
-- TEST 2 — Exhausted side rejected
-- Side with limit_quantity=2, sold_today=2 must raise daily_limit_exceeded
-- on a fresh order requesting 1 more side portion.
-- =============================================================
DO $$
DECLARE
  v_tenant   BIGINT  := current_setting('test.tenant_id')::BIGINT;
  v_branch   BIGINT  := current_setting('test.branch_id')::BIGINT;
  v_profile  UUID    := current_setting('test.profile_id')::UUID;
  v_category BIGINT  := current_setting('test.category_id')::BIGINT;
  v_main_id  BIGINT;
  v_side_id  BIGINT;
  v_order_id BIGINT;
  v_today    DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_caught   BOOLEAN := false;
BEGIN
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_main_t2_' || gen_random_uuid()::TEXT, 50000)
  RETURNING id INTO v_main_id;
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_side_t2_' || gen_random_uuid()::TEXT, 10000)
  RETURNING id INTO v_side_id;

  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, limit_quantity, sold_today)
  VALUES (v_tenant, v_branch, v_side_id, v_today, 2, 2);

  INSERT INTO public.orders (tenant_id, branch_id, order_number, created_by)
  VALUES (v_tenant, v_branch, '__test_t2_' || gen_random_uuid()::TEXT, v_profile)
  RETURNING id INTO v_order_id;

  BEGIN
    INSERT INTO public.order_items
      (tenant_id, order_id, menu_item_id, item_name, quantity, unit_price, sides, subtotal)
    VALUES
      (v_tenant, v_order_id, v_main_id, 'main', 1, 50000,
       jsonb_build_array(jsonb_build_object('side_item_id', v_side_id, 'name', 'side', 'price', 10000, 'quantity', 1)),
       60000);
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM LIKE 'daily_limit_exceeded:%' THEN
      v_caught := true;
    ELSE
      RAISE EXCEPTION 'TEST 2 wrong error: %', SQLERRM;
    END IF;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 2 FAILED: insert past side quota did not raise';
  END IF;

  RAISE NOTICE 'TEST 2 PASSED: exhausted side rejected';
END;
$$;


-- =============================================================
-- TEST 3 — Cancel restores side quota
-- Insert order_items with side at sold_today=0/limit=10 with main.qty=2
-- and side.qty=1 → sold_today should become 2. Cancel the row →
-- sold_today should return to 0.
-- =============================================================
DO $$
DECLARE
  v_tenant   BIGINT  := current_setting('test.tenant_id')::BIGINT;
  v_branch   BIGINT  := current_setting('test.branch_id')::BIGINT;
  v_profile  UUID    := current_setting('test.profile_id')::UUID;
  v_category BIGINT  := current_setting('test.category_id')::BIGINT;
  v_main_id  BIGINT;
  v_side_id  BIGINT;
  v_order_id BIGINT;
  v_item_id  BIGINT;
  v_today    DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_sold     INT;
BEGIN
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_main_t3_' || gen_random_uuid()::TEXT, 50000)
  RETURNING id INTO v_main_id;
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_side_t3_' || gen_random_uuid()::TEXT, 10000)
  RETURNING id INTO v_side_id;

  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, limit_quantity, sold_today)
  VALUES (v_tenant, v_branch, v_side_id, v_today, 10, 0);

  INSERT INTO public.orders (tenant_id, branch_id, order_number, created_by)
  VALUES (v_tenant, v_branch, '__test_t3_' || gen_random_uuid()::TEXT, v_profile)
  RETURNING id INTO v_order_id;

  -- Insert order_item: main qty=2, side qty=1 per main → side need = 2.
  INSERT INTO public.order_items
    (tenant_id, order_id, menu_item_id, item_name, quantity, unit_price, sides, subtotal)
  VALUES
    (v_tenant, v_order_id, v_main_id, 'main', 2, 50000,
     jsonb_build_array(jsonb_build_object('side_item_id', v_side_id, 'name', 'side', 'price', 10000, 'quantity', 1)),
     120000)
  RETURNING id INTO v_item_id;

  SELECT sold_today INTO v_sold
  FROM public.branch_menu_item_daily_limits
  WHERE branch_id = v_branch AND menu_item_id = v_side_id AND limit_date = v_today;

  IF v_sold <> 2 THEN
    RAISE EXCEPTION 'TEST 3a FAILED: expected sold_today=2 after insert, got %', v_sold;
  END IF;

  UPDATE public.order_items SET status = 'cancelled' WHERE id = v_item_id;

  SELECT sold_today INTO v_sold
  FROM public.branch_menu_item_daily_limits
  WHERE branch_id = v_branch AND menu_item_id = v_side_id AND limit_date = v_today;

  IF v_sold <> 0 THEN
    RAISE EXCEPTION 'TEST 3b FAILED: expected sold_today=0 after cancel, got %', v_sold;
  END IF;

  RAISE NOTICE 'TEST 3 PASSED: cancel restores side quota (2→0)';
END;
$$;


-- =============================================================
-- TEST 4 — Same item as both main and side aggregates
-- An order_items row whose menu_item_id equals one of its
-- sides[].side_item_id must aggregate quotas: main qty=3, side qty=1
-- per main → total 6 (3 mains + 3 sides) for that one item id.
-- =============================================================
DO $$
DECLARE
  v_tenant   BIGINT  := current_setting('test.tenant_id')::BIGINT;
  v_branch   BIGINT  := current_setting('test.branch_id')::BIGINT;
  v_profile  UUID    := current_setting('test.profile_id')::UUID;
  v_category BIGINT  := current_setting('test.category_id')::BIGINT;
  v_item_id  BIGINT;
  v_order_id BIGINT;
  v_today    DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_sold     INT;
BEGIN
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_dual_t4_' || gen_random_uuid()::TEXT, 30000)
  RETURNING id INTO v_item_id;

  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, limit_quantity, sold_today)
  VALUES (v_tenant, v_branch, v_item_id, v_today, 100, 0);

  INSERT INTO public.orders (tenant_id, branch_id, order_number, created_by)
  VALUES (v_tenant, v_branch, '__test_t4_' || gen_random_uuid()::TEXT, v_profile)
  RETURNING id INTO v_order_id;

  -- Same item as main (qty 3) AND as a side (qty 1 per main) on the
  -- same row → aggregate need = 3 + 3 = 6.
  INSERT INTO public.order_items
    (tenant_id, order_id, menu_item_id, item_name, quantity, unit_price, sides, subtotal)
  VALUES
    (v_tenant, v_order_id, v_item_id, 'dual', 3, 30000,
     jsonb_build_array(jsonb_build_object('side_item_id', v_item_id, 'name', 'dual', 'price', 30000, 'quantity', 1)),
     180000);

  SELECT sold_today INTO v_sold
  FROM public.branch_menu_item_daily_limits
  WHERE branch_id = v_branch AND menu_item_id = v_item_id AND limit_date = v_today;

  IF v_sold <> 6 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: expected sold_today=6 (main 3 + side 3), got %', v_sold;
  END IF;

  RAISE NOTICE 'TEST 4 PASSED: same item as main+side aggregates correctly';
END;
$$;


-- =============================================================
-- TEST 5 — Skip-quota GUC short-circuits trigger
-- When current_setting('comtammatu.skip_quota_enforcement') = 'true'
-- the trigger must RETURN NEW without inspecting limits. This proves
-- the split-partial bypass mechanism works.
-- (We test the GUC behaviour directly rather than invoking split_order
-- because that RPC requires auth.uid() + advisory lock + complex
-- preconditions out of scope for plain SQL tests.)
-- =============================================================
DO $$
DECLARE
  v_tenant   BIGINT  := current_setting('test.tenant_id')::BIGINT;
  v_branch   BIGINT  := current_setting('test.branch_id')::BIGINT;
  v_profile  UUID    := current_setting('test.profile_id')::UUID;
  v_category BIGINT  := current_setting('test.category_id')::BIGINT;
  v_main_id  BIGINT;
  v_side_id  BIGINT;
  v_order_id BIGINT;
  v_today    DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_sold     INT;
BEGIN
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_main_t5_' || gen_random_uuid()::TEXT, 50000)
  RETURNING id INTO v_main_id;
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price)
  VALUES (v_tenant, v_category, '__test_side_t5_' || gen_random_uuid()::TEXT, 10000)
  RETURNING id INTO v_side_id;

  -- Side IS disabled. Without skip-hatch the insert would raise.
  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, is_disabled, sold_today)
  VALUES (v_tenant, v_branch, v_side_id, v_today, true, 0);

  INSERT INTO public.orders (tenant_id, branch_id, order_number, created_by)
  VALUES (v_tenant, v_branch, '__test_t5_' || gen_random_uuid()::TEXT, v_profile)
  RETURNING id INTO v_order_id;

  PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
  INSERT INTO public.order_items
    (tenant_id, order_id, menu_item_id, item_name, quantity, unit_price, sides, subtotal)
  VALUES
    (v_tenant, v_order_id, v_main_id, 'main', 1, 50000,
     jsonb_build_array(jsonb_build_object('side_item_id', v_side_id, 'name', 'side', 'price', 10000, 'quantity', 1)),
     60000);
  PERFORM set_config('comtammatu.skip_quota_enforcement', 'false', true);

  -- sold_today must NOT have moved (skip-hatch was on).
  SELECT sold_today INTO v_sold
  FROM public.branch_menu_item_daily_limits
  WHERE branch_id = v_branch AND menu_item_id = v_side_id AND limit_date = v_today;

  IF v_sold <> 0 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: skip-hatch did not bypass increment, sold_today=%', v_sold;
  END IF;

  RAISE NOTICE 'TEST 5 PASSED: skip-hatch bypasses both enforce and increment';
END;
$$;


-- ─── Always rollback fixtures ────────────────────────────────────────
ROLLBACK;
