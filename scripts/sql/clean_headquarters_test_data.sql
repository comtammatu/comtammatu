-- =============================================================================
-- One-time cleanup: test data tied to headquarters (HQ) branch
-- =============================================================================
-- Use after POS/KDS/orders were incorrectly created on the office (HQ) branch.
-- Keeps the HQ row in `branches`; removes operational data and fixes staff scope.
--
-- How to run
--   Supabase Dashboard → SQL Editor → paste → Run
--   (Runs as postgres / service role — bypasses RLS.)
--
-- Multi-tenant: set v_tenant_filter below to your tenant id, or leave NULL if
-- only one tenant exists.
--
-- Requires: if any cashier/waiter/chef/branch_manager is still on HQ, there must
-- be at least one other branch in the same tenant to reassign them.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  -- Set to a specific tenant id when multiple tenants exist; NULL = auto (single HQ)
  v_tenant_filter BIGINT := NULL;

  v_hq            BIGINT;
  v_tenant        BIGINT;
  v_store         BIGINT;
  v_ops_count     INT;
BEGIN
  SELECT b.id, b.tenant_id
  INTO v_hq, v_tenant
  FROM public.branches b
  WHERE COALESCE(b.is_headquarters, false) = true
    AND (v_tenant_filter IS NULL OR b.tenant_id = v_tenant_filter)
  ORDER BY b.id
  LIMIT 1;

  IF v_hq IS NULL THEN
    RAISE NOTICE 'No headquarters branch found — nothing to do.';
    RETURN;
  END IF;

  RAISE NOTICE 'HQ branch_id = %, tenant_id = %', v_hq, v_tenant;

  SELECT b.id
  INTO v_store
  FROM public.branches b
  WHERE b.tenant_id = v_tenant
    AND b.id <> v_hq
    AND COALESCE(b.is_headquarters, false) = false
  ORDER BY b.id
  LIMIT 1;

  SELECT COUNT(*)::INT
  INTO v_ops_count
  FROM public.profiles
  WHERE branch_id = v_hq
    AND role::text IN ('cashier', 'waiter', 'chef', 'branch_manager');

  IF v_ops_count > 0 AND v_store IS NULL THEN
    RAISE EXCEPTION
      'clean_headquarters_test_data: % operational user(s) still on HQ but no non-HQ branch exists. Create another branch first.',
      v_ops_count;
  END IF;

  -- 1) Operational staff: HQ → first store branch + sync auth JWT metadata
  IF v_store IS NOT NULL AND v_ops_count > 0 THEN
    WITH moved AS (
      UPDATE public.profiles p
      SET branch_id = v_store,
          updated_at = now()
      WHERE p.branch_id = v_hq
        AND p.role::text IN ('cashier', 'waiter', 'chef', 'branch_manager')
      RETURNING id
    )
    UPDATE auth.users u
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('branch_id', v_store)
    FROM moved m
    WHERE u.id = m.id;

    RAISE NOTICE 'Moved % operational profile(s) from HQ (%) to branch %.',
      v_ops_count, v_hq, v_store;
  END IF;

  -- 2) Tenant-level roles: clear HQ branch_id + sync auth (null branch in JWT)
  WITH cleared AS (
    UPDATE public.profiles p
    SET branch_id = NULL,
        updated_at = now()
    WHERE p.branch_id = v_hq
      AND p.role::text IN ('owner', 'super_manager', 'area_manager', 'office')
    RETURNING id
  )
  UPDATE auth.users u
  SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{branch_id}',
    'null'::jsonb,
    true
  )
  FROM cleared c
  WHERE u.id = c.id;

  -- 3) Orders first (CASCADE to order_items, order_status_history, payments, tax_invoices, kds_tickets via order_id)
  DELETE FROM public.orders WHERE branch_id = v_hq;
  RAISE NOTICE 'Deleted orders for HQ branch.';

  -- 4) Remaining HQ-scoped rows (safe if already empty)
  DELETE FROM public.kds_tickets WHERE branch_id = v_hq;
  DELETE FROM public.pos_sessions WHERE branch_id = v_hq;
  DELETE FROM public.pos_terminals WHERE branch_id = v_hq;
  DELETE FROM public.order_daily_counters WHERE branch_id = v_hq;
  DELETE FROM public.printer_configs WHERE branch_id = v_hq;
  DELETE FROM public.kds_stations WHERE branch_id = v_hq;

  DELETE FROM public.tables WHERE branch_id = v_hq;
  DELETE FROM public.branch_zones WHERE branch_id = v_hq;

  DELETE FROM public.stock_movements WHERE branch_id = v_hq;
  DELETE FROM public.stock_levels WHERE branch_id = v_hq;

  DELETE FROM public.attendance_records WHERE branch_id = v_hq;
  DELETE FROM public.shift_assignments WHERE branch_id = v_hq;
  DELETE FROM public.shifts WHERE branch_id = v_hq;

  DELETE FROM public.area_branches WHERE branch_id = v_hq;

  -- Orphan safety (should be none if orders deleted cleanly)
  DELETE FROM public.payments WHERE branch_id = v_hq;

  RAISE NOTICE 'HQ cleanup finished for branch_id = %.', v_hq;
END;
$$;

COMMIT;
