-- =============================================================
-- Tests for migration 20260612120000_refund_keep_order_payment_status
--   - reverse_payment_and_post must approve refunds end-to-end
--     without writing orders.payment_status (CHECK allows only
--     unpaid/pending/paid; refund truth = payments + refunds + GL)
--
-- Run against a DB that has at least 1 tenant, 1 branch, and
-- 1 profile seeded. All writes happen inside the outer
-- transaction and are rolled back at the end. Safe to re-run.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/refund_reverse_payment_flow_test.sql
--
-- Each test is a DO block. RAISE NOTICE marks pass; any
-- RAISE EXCEPTION fails the run loudly with the test name.
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

-- ─── Resolve fixture ids from existing seed ─────────────────────
DO $$
DECLARE
  v_tenant  BIGINT;
  v_branch  BIGINT;
  v_profile UUID;
BEGIN
  SELECT t.id INTO v_tenant  FROM public.tenants t LIMIT 1;
  SELECT b.id INTO v_branch  FROM public.branches b WHERE b.tenant_id = v_tenant LIMIT 1;
  SELECT p.id INTO v_profile FROM public.profiles p WHERE p.tenant_id = v_tenant LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'Tests need seed data: tenant=% branch=% profile=%',
      v_tenant, v_branch, v_profile;
  END IF;

  PERFORM set_config('test.tenant_id',  v_tenant::TEXT,  false);
  PERFORM set_config('test.branch_id',  v_branch::TEXT,  false);
  PERFORM set_config('test.profile_id', v_profile::TEXT, false);

  -- Satisfy auth.uid() / auth_tenant_id() inside SECURITY DEFINER RPCs.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_profile,
      'app_metadata', json_build_object('tenant_id', v_tenant)
    )::TEXT,
    false
  );

  -- Tenant-wide approval permission for the test actor (branch_id NULL
  -- matches any branch in has_permission).
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_permissions
    WHERE user_id = v_profile
      AND permission_key = 'orders:refund_approve'
      AND branch_id IS NULL
  ) THEN
    INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key)
    VALUES (v_profile, v_tenant, NULL, 'orders:refund_approve');
  END IF;

  -- GL accounts the RPC hard-requires.
  INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type)
  SELECT v_tenant, c.code, c.name, c.kind
  FROM (VALUES
    ('5111', 'Revenue - goods/services', 'revenue'),
    ('1111', 'Cash on hand', 'asset'),
    ('1121', 'Bank deposits', 'asset')
  ) AS c(code, name, kind)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts coa
    WHERE coa.tenant_id = v_tenant AND coa.account_code = c.code
  );

  RAISE NOTICE 'Fixtures: tenant=% branch=% profile=%', v_tenant, v_branch, v_profile;
END;
$$;


-- =============================================================
-- TEST 1 — Full refund approval end-to-end
-- Approving a pending full refund must succeed (no CHECK violation),
-- flip payments + refunds, post a balanced GL reversal, write an
-- audit row, and leave orders.payment_status = 'paid'.
-- =============================================================
DO $$
DECLARE
  v_tenant   BIGINT := current_setting('test.tenant_id')::BIGINT;
  v_branch   BIGINT := current_setting('test.branch_id')::BIGINT;
  v_profile  UUID   := current_setting('test.profile_id')::UUID;
  v_order    BIGINT;
  v_payment  BIGINT;
  v_refund   BIGINT;
  v_result   JSONB;
  v_row      RECORD;
  v_dr       NUMERIC;
  v_cr       NUMERIC;
  v_lines    INT;
BEGIN
  INSERT INTO public.orders
    (tenant_id, branch_id, order_number, order_type, status,
     subtotal, total_amount, payment_status, payment_method, created_by)
  VALUES
    (v_tenant, v_branch, 'TEST-RFND-' || txid_current() || '-1', 'takeaway', 'completed',
     100000, 100000, 'paid', 'cash', v_profile)
  RETURNING id INTO v_order;

  INSERT INTO public.payments
    (tenant_id, branch_id, order_id, method, amount, status, paid_at, created_by)
  VALUES
    (v_tenant, v_branch, v_order, 'cash', 100000, 'completed', now(), v_profile)
  RETURNING id INTO v_payment;

  INSERT INTO public.refunds
    (tenant_id, branch_id, payment_id, order_id, amount, reason, status, created_by)
  VALUES
    (v_tenant, v_branch, v_payment, v_order, 100000, 'test full refund', 'pending', v_profile)
  RETURNING id INTO v_refund;

  v_result := public.reverse_payment_and_post(v_refund);

  IF v_result->>'status' IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: rpc status=% (expected approved)', v_result->>'status';
  END IF;
  IF v_result ? 'order_new_status' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: rpc result still reports order_new_status';
  END IF;
  IF v_result->>'payment_new_status' IS DISTINCT FROM 'refunded' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: payment_new_status=%', v_result->>'payment_new_status';
  END IF;
  IF (v_result->>'stock_movements_created')::INT <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: stock restored for never-consumed payment (count=%)',
      v_result->>'stock_movements_created';
  END IF;

  SELECT status, approved_by, approved_at INTO v_row
  FROM public.refunds WHERE id = v_refund;
  IF v_row.status <> 'approved' OR v_row.approved_by IS DISTINCT FROM v_profile
     OR v_row.approved_at IS NULL THEN
    RAISE EXCEPTION 'TEST 1 FAILED: refund row status=% approved_by=% approved_at=%',
      v_row.status, v_row.approved_by, v_row.approved_at;
  END IF;

  IF (SELECT status FROM public.payments WHERE id = v_payment) <> 'refunded' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: payments.status not flipped to refunded';
  END IF;

  IF (SELECT payment_status FROM public.orders WHERE id = v_order) <> 'paid' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: orders.payment_status changed (expected to stay paid)';
  END IF;

  SELECT je.id INTO v_row
  FROM public.journal_entries je
  WHERE je.tenant_id = v_tenant
    AND je.reference_type = 'refund'
    AND je.reference_id = v_refund
    AND je.status = 'posted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST 1 FAILED: posted GL reversal journal missing';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_lines, v_dr, v_cr
  FROM public.journal_entry_lines
  WHERE journal_entry_id = (v_result->>'journal_entry_id')::BIGINT;
  IF v_lines <> 2 OR v_dr <> 100000 OR v_cr <> 100000 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: journal lines=% debit=% credit=% (expected 2/100000/100000)',
      v_lines, v_dr, v_cr;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE tenant_id = v_tenant
      AND action = 'refund.approve'
      AND entity_type = 'refund'
      AND entity_id = v_refund
  ) THEN
    RAISE EXCEPTION 'TEST 1 FAILED: audit_logs row missing';
  END IF;

  PERFORM set_config('test.order1_id',  v_order::TEXT,  false);
  PERFORM set_config('test.refund1_id', v_refund::TEXT, false);

  RAISE NOTICE 'TEST 1 PASSED: full refund approved, order stays paid, GL balanced, audit written';
END;
$$;


-- =============================================================
-- TEST 2 — Partial refund approval
-- A refund smaller than the payment must approve cleanly, post the
-- reversal for the refund amount only, and leave the order 'paid'.
-- =============================================================
DO $$
DECLARE
  v_tenant  BIGINT := current_setting('test.tenant_id')::BIGINT;
  v_branch  BIGINT := current_setting('test.branch_id')::BIGINT;
  v_profile UUID   := current_setting('test.profile_id')::UUID;
  v_order   BIGINT;
  v_payment BIGINT;
  v_refund  BIGINT;
  v_result  JSONB;
  v_dr      NUMERIC;
  v_cr      NUMERIC;
BEGIN
  INSERT INTO public.orders
    (tenant_id, branch_id, order_number, order_type, status,
     subtotal, total_amount, payment_status, payment_method, created_by)
  VALUES
    (v_tenant, v_branch, 'TEST-RFND-' || txid_current() || '-2', 'takeaway', 'completed',
     80000, 80000, 'paid', 'momo', v_profile)
  RETURNING id INTO v_order;

  INSERT INTO public.payments
    (tenant_id, branch_id, order_id, method, amount, status, paid_at, created_by)
  VALUES
    (v_tenant, v_branch, v_order, 'momo', 80000, 'completed', now(), v_profile)
  RETURNING id INTO v_payment;

  INSERT INTO public.refunds
    (tenant_id, branch_id, payment_id, order_id, amount, reason, status, created_by)
  VALUES
    (v_tenant, v_branch, v_payment, v_order, 30000, 'test partial refund', 'pending', v_profile)
  RETURNING id INTO v_refund;

  v_result := public.reverse_payment_and_post(v_refund);

  IF v_result->>'status' IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: rpc status=% (expected approved)', v_result->>'status';
  END IF;

  IF (SELECT payment_status FROM public.orders WHERE id = v_order) <> 'paid' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: partial refund changed orders.payment_status';
  END IF;

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_dr, v_cr
  FROM public.journal_entry_lines
  WHERE journal_entry_id = (v_result->>'journal_entry_id')::BIGINT;
  IF v_dr <> 30000 OR v_cr <> 30000 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: reversal posted %/% (expected refund amount 30000)',
      v_dr, v_cr;
  END IF;

  RAISE NOTICE 'TEST 2 PASSED: partial refund reverses only the refund amount, order stays paid';
END;
$$;


-- =============================================================
-- TEST 3 — orders CHECK still rejects 'refunded'
-- Pins the chosen fix: the constraint is NOT widened; any write of
-- 'refunded' into orders.payment_status must raise check_violation.
-- =============================================================
DO $$
DECLARE
  v_order BIGINT := current_setting('test.order1_id')::BIGINT;
BEGIN
  BEGIN
    UPDATE public.orders SET payment_status = 'refunded' WHERE id = v_order;
    RAISE EXCEPTION 'TEST 3 FAILED: orders_payment_status_check accepted refunded';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'TEST 3 PASSED: orders_payment_status_check rejects refunded';
  END;
END;
$$;


-- =============================================================
-- TEST 4 — Idempotent re-approval
-- Approving an already-approved refund must return already_approved
-- without posting a second journal entry.
-- =============================================================
DO $$
DECLARE
  v_tenant BIGINT := current_setting('test.tenant_id')::BIGINT;
  v_refund BIGINT := current_setting('test.refund1_id')::BIGINT;
  v_result JSONB;
  v_count  INT;
BEGIN
  v_result := public.reverse_payment_and_post(v_refund);

  IF v_result->>'status' IS DISTINCT FROM 'already_approved' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: rpc status=% (expected already_approved)',
      v_result->>'status';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.journal_entries
  WHERE tenant_id = v_tenant
    AND reference_type = 'refund'
    AND reference_id = v_refund;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: % journal entries for refund (expected 1)', v_count;
  END IF;

  RAISE NOTICE 'TEST 4 PASSED: re-approval is idempotent, no duplicate journal';
END;
$$;


-- =============================================================
-- TEST 5 — Function/constraint contract
-- The live function text must not touch orders, must still flip
-- payments and keep the strict stock-restore guard; the orders
-- CHECK definition must not contain 'refunded'.
-- =============================================================
DO $$
DECLARE
  v_fn_def         TEXT;
  v_constraint_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reverse_payment_and_post(bigint)'::regprocedure)
    INTO v_fn_def;

  IF v_fn_def ILIKE '%UPDATE public.orders%' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: reverse_payment_and_post still updates orders';
  END IF;
  IF v_fn_def NOT ILIKE '%UPDATE public.payments%'
     OR v_fn_def NOT ILIKE '%SET status = ''refunded''%' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: payments refunded flip missing from function';
  END IF;
  IF v_fn_def NOT ILIKE '%stock_consumed_status = ''ok''%' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: strict stock_consumed_status=ok guard missing';
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_constraint_def
  FROM pg_constraint c
  WHERE c.conname = 'orders_payment_status_check'
    AND c.conrelid = 'public.orders'::regclass;
  IF v_constraint_def IS NULL THEN
    RAISE EXCEPTION 'TEST 5 FAILED: orders_payment_status_check missing';
  END IF;
  IF v_constraint_def ILIKE '%refunded%' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: orders_payment_status_check was widened to refunded';
  END IF;

  RAISE NOTICE 'TEST 5 PASSED: function and constraint contracts hold';
END;
$$;

ROLLBACK;
