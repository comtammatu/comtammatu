-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pr284_sepay_money_acceptance_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_expense_a bigint;
  v_expense_b bigint;
  v_mismatch_a bigint;
  v_mismatch_b bigint;
  v_single_expense bigint;
  v_exact_event bigint;
  v_mismatch_event bigint;
  v_single_event_a bigint;
  v_single_event_b bigint;
  v_cash_event bigint;
  v_dh_order bigint;
  v_dh_payment bigint;
  v_dh_mismatch_order bigint;
  v_dh_event bigint;
  v_dh_mismatch_event bigint;
  v_cash_note text := 'PR284 cash deposit ' || gen_random_uuid()::text;
  v_dh_code text := 'DH' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_dh_mismatch_code text := 'DH' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
BEGIN
  SELECT b.tenant_id, b.id
  INTO v_tenant, v_branch
  FROM public.branches b
  WHERE b.is_active
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.tenant_id = b.tenant_id
        AND p.is_active
        AND public.auth_is_owner(p.id)
    )
  ORDER BY b.id
  LIMIT 1;

  SELECT p.id
  INTO v_owner
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
    AND p.is_active
    AND public.auth_is_owner(p.id)
  ORDER BY p.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'PR284 acceptance requires tenant, branch, and Owner seed data';
  END IF;

  INSERT INTO public.system_settings (tenant_id, key, value)
  VALUES (v_tenant, 'payment_vietqr_account_no', '9704360012345678')
  ON CONFLICT (key, tenant_id) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount, payment_method,
    note, created_by
  ) VALUES (
    v_tenant, v_branch, current_date, 'other', 60000, 'unpaid',
    'PR284 exact allocation A', v_owner
  )
  RETURNING id INTO v_expense_a;

  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount, payment_method,
    note, created_by
  ) VALUES (
    v_tenant, v_branch, current_date, 'other', 40000, 'unpaid',
    'PR284 exact allocation B', v_owner
  )
  RETURNING id INTO v_expense_b;

  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount, payment_method,
    note, created_by
  ) VALUES (
    v_tenant, v_branch, current_date, 'other', 60000, 'unpaid',
    'PR284 mismatch allocation A', v_owner
  )
  RETURNING id INTO v_mismatch_a;

  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount, payment_method,
    note, created_by
  ) VALUES (
    v_tenant, v_branch, current_date, 'other', 40000, 'unpaid',
    'PR284 mismatch allocation B', v_owner
  )
  RETURNING id INTO v_mismatch_b;

  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount, payment_method,
    note, created_by
  ) VALUES (
    v_tenant, v_branch, current_date, 'other', 50000, 'unpaid',
    'PR284 single allocation', v_owner
  ) RETURNING id INTO v_single_expense;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES (
    v_tenant, 'sepay', 'pr284-exact-' || gen_random_uuid()::text, true,
    jsonb_build_object('transferType', 'out', 'transferAmount', 100000), 'received'
  )
  RETURNING id INTO v_exact_event;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES (
    v_tenant, 'sepay', 'pr284-mismatch-' || gen_random_uuid()::text, true,
    jsonb_build_object('transferType', 'out', 'transferAmount', 100001), 'received'
  ) RETURNING id INTO v_mismatch_event;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES (
    v_tenant, 'sepay', 'pr284-single-a-' || gen_random_uuid()::text, true,
    jsonb_build_object('transferType', 'out', 'transferAmount', 50000), 'received'
  ) RETURNING id INTO v_single_event_a;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES (
    v_tenant, 'sepay', 'pr284-single-b-' || gen_random_uuid()::text, true,
    jsonb_build_object('transferType', 'out', 'transferAmount', 50000), 'received'
  ) RETURNING id INTO v_single_event_b;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES (
    v_tenant, 'sepay', 'pr284-cash-' || gen_random_uuid()::text, true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', 70000,
      'transactionDate', to_char(current_date, 'YYYY-MM-DD'),
      'content', v_cash_note
    ), 'received'
  ) RETURNING id INTO v_cash_event;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status, payment_method, cash_received, cash_change,
    payment_code
  ) VALUES (
    v_tenant, v_branch, 'PR284-DH-' || gen_random_uuid()::text,
    'completed', 88000, 88000, v_owner, 'paid', 'cash', 88000, 0,
    v_dh_code
  ) RETURNING id INTO v_dh_order;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, paid_at,
    provider_data, created_by
  ) VALUES (
    v_tenant, v_branch, v_dh_order, 'cash', 88000, 'completed', now(),
    jsonb_build_object('source', 'pr284_dh_cash_correction'), v_owner
  ) RETURNING id INTO v_dh_payment;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status, payment_code
  ) VALUES (
    v_tenant, v_branch, 'PR284-DH-MISMATCH-' || gen_random_uuid()::text,
    'confirmed', 99000, 99000, v_owner, 'unpaid', v_dh_mismatch_code
  ) RETURNING id INTO v_dh_mismatch_order;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES (
    v_tenant, 'sepay', 'pr284-dh-' || gen_random_uuid()::text, true,
    jsonb_build_object(
      'transferType', 'in', 'transferAmount', 88000,
      'content', 'THANH TOAN ' || v_dh_code,
      'accountNumber', '9704360012345678',
      'referenceCode', 'PR284-DH-EXACT'
    ), 'received'
  ) RETURNING id INTO v_dh_event;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES (
    v_tenant, 'sepay', 'pr284-dh-mismatch-' || gen_random_uuid()::text, true,
    jsonb_build_object(
      'transferType', 'in', 'transferAmount', 99001,
      'content', 'THANH TOAN ' || v_dh_mismatch_code,
      'accountNumber', '9704360012345678',
      'referenceCode', 'PR284-DH-MISMATCH'
    ), 'received'
  ) RETURNING id INTO v_dh_mismatch_event;

  PERFORM set_config('test.pr284_tenant', v_tenant::text, true);
  PERFORM set_config('test.pr284_owner', v_owner::text, true);
  PERFORM set_config('test.pr284_expense_a', v_expense_a::text, true);
  PERFORM set_config('test.pr284_expense_b', v_expense_b::text, true);
  PERFORM set_config('test.pr284_mismatch_a', v_mismatch_a::text, true);
  PERFORM set_config('test.pr284_mismatch_b', v_mismatch_b::text, true);
  PERFORM set_config('test.pr284_single_expense', v_single_expense::text, true);
  PERFORM set_config('test.pr284_exact_event', v_exact_event::text, true);
  PERFORM set_config('test.pr284_mismatch_event', v_mismatch_event::text, true);
  PERFORM set_config('test.pr284_single_event_a', v_single_event_a::text, true);
  PERFORM set_config('test.pr284_single_event_b', v_single_event_b::text, true);
  PERFORM set_config('test.pr284_cash_event', v_cash_event::text, true);
  PERFORM set_config('test.pr284_cash_note', v_cash_note, true);
  PERFORM set_config('test.pr284_dh_order', v_dh_order::text, true);
  PERFORM set_config('test.pr284_dh_payment', v_dh_payment::text, true);
  PERFORM set_config('test.pr284_dh_code', v_dh_code, true);
  PERFORM set_config('test.pr284_dh_event', v_dh_event::text, true);
  PERFORM set_config('test.pr284_dh_mismatch_order', v_dh_mismatch_order::text, true);
  PERFORM set_config('test.pr284_dh_mismatch_code', v_dh_mismatch_code, true);
  PERFORM set_config('test.pr284_dh_mismatch_event', v_dh_mismatch_event::text, true);
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.pr284_owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.pr284_owner'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.pr284_tenant')::bigint
    )
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.match_sepay_transaction_expenses(
    current_setting('test.pr284_exact_event')::bigint,
    ARRAY[
      current_setting('test.pr284_expense_a')::bigint,
      current_setting('test.pr284_expense_b')::bigint
    ]
  );
  IF (v_result ->> 'matched_count')::integer <> 2
     OR (v_result ->> 'matched_amount')::numeric <> 100000 THEN
    RAISE EXCEPTION 'Exact expense allocation failed: %', v_result;
  END IF;

  BEGIN
    PERFORM public.match_sepay_transaction_expenses(
      current_setting('test.pr284_mismatch_event')::bigint,
      ARRAY[
        current_setting('test.pr284_mismatch_a')::bigint,
        current_setting('test.pr284_mismatch_b')::bigint
      ]
    );
    RAISE EXCEPTION 'One-VND expense mismatch was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'expense_amount_mismatch' THEN RAISE; END IF;
  END;

  PERFORM public.match_sepay_transaction_expenses(
    current_setting('test.pr284_single_event_a')::bigint,
    ARRAY[current_setting('test.pr284_single_expense')::bigint]
  );
  BEGIN
    PERFORM public.match_sepay_transaction_expenses(
      current_setting('test.pr284_single_event_b')::bigint,
      ARRAY[current_setting('test.pr284_single_expense')::bigint]
    );
    RAISE EXCEPTION 'Expense was matched to two bank events';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    IF SQLERRM <> 'expense_already_matched' THEN RAISE; END IF;
  END;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_first jsonb;
  v_replay jsonb;
  v_exact jsonb;
  v_mismatch jsonb;
BEGIN
  v_first := public.record_sepay_cash_deposit_as_system(
    current_setting('test.pr284_cash_event')::bigint
  );
  v_replay := public.record_sepay_cash_deposit_as_system(
    current_setting('test.pr284_cash_event')::bigint
  );
  IF v_first ->> 'status' <> 'recorded'
     OR v_replay ->> 'status' <> 'already_recorded'
     OR (v_first ->> 'expense_id')::bigint <> (v_replay ->> 'expense_id')::bigint THEN
    RAISE EXCEPTION 'Cash deposit idempotency failed: first=%, replay=%',
      v_first, v_replay;
  END IF;

  v_exact := public.reconcile_sepay_order_evidence(
    current_setting('test.pr284_dh_event')::bigint,
    current_setting('test.pr284_dh_code')
  );
  IF v_exact ->> 'status' <> 'matched' THEN
    RAISE EXCEPTION 'Exact DH memo and amount did not settle: %', v_exact;
  END IF;

  v_mismatch := public.reconcile_sepay_order_evidence(
    current_setting('test.pr284_dh_mismatch_event')::bigint,
    current_setting('test.pr284_dh_mismatch_code')
  );
  IF v_mismatch ->> 'status' <> 'amount_mismatch' THEN
    RAISE EXCEPTION 'DH amount mismatch was not rejected: %', v_mismatch;
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_cash_expense bigint;
BEGIN
  SELECT expense_id INTO v_cash_expense
  FROM public.webhook_events
  WHERE id = current_setting('test.pr284_cash_event')::bigint;

  IF (
       SELECT count(*)
       FROM public.bank_transaction_expense_matches
       WHERE tenant_id = current_setting('test.pr284_tenant')::bigint
         AND webhook_event_id = current_setting('test.pr284_exact_event')::bigint
     ) <> 2
     OR (
       SELECT count(*)
       FROM public.bank_transaction_expense_matches
       WHERE tenant_id = current_setting('test.pr284_tenant')::bigint
         AND webhook_event_id = current_setting('test.pr284_exact_event')::bigint
         AND expense_id IN (
           current_setting('test.pr284_expense_a')::bigint,
           current_setting('test.pr284_expense_b')::bigint
         )
     ) <> 2
     OR (
       SELECT count(*)
       FROM public.expenses
       WHERE id IN (
         current_setting('test.pr284_expense_a')::bigint,
         current_setting('test.pr284_expense_b')::bigint
       )
         AND payment_method = 'transfer'
         AND paid_at IS NOT NULL
     ) <> 2
     OR (
       SELECT expense_id
       FROM public.webhook_events
       WHERE id = current_setting('test.pr284_exact_event')::bigint
     ) IS DISTINCT FROM LEAST(
       current_setting('test.pr284_expense_a')::bigint,
       current_setting('test.pr284_expense_b')::bigint
     )
     OR v_cash_expense IS NULL
     OR (
       SELECT count(*)
       FROM public.expenses
       WHERE id = v_cash_expense
         AND tenant_id = current_setting('test.pr284_tenant')::bigint
         AND category = 'bank_deposit'
         AND payment_method = 'cash'
         AND amount = 70000
         AND note = current_setting('test.pr284_cash_note')
     ) <> 1
     OR (
       SELECT count(*)
       FROM public.expenses
       WHERE tenant_id = current_setting('test.pr284_tenant')::bigint
         AND note = current_setting('test.pr284_cash_note')
     ) <> 1
     OR (SELECT count(*) FROM public.bank_transaction_expense_matches
         WHERE tenant_id = current_setting('test.pr284_tenant')::bigint
           AND expense_id = current_setting('test.pr284_single_expense')::bigint) <> 1
     OR (SELECT count(*) FROM public.bank_transaction_expense_matches
         WHERE tenant_id = current_setting('test.pr284_tenant')::bigint
           AND webhook_event_id = current_setting('test.pr284_single_event_a')::bigint
           AND expense_id = current_setting('test.pr284_single_expense')::bigint) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events
       WHERE id = current_setting('test.pr284_single_event_a')::bigint
         AND expense_id = current_setting('test.pr284_single_expense')::bigint
     )
     OR EXISTS (
       SELECT 1
       FROM public.bank_transaction_expense_matches
       WHERE tenant_id = current_setting('test.pr284_tenant')::bigint
         AND webhook_event_id = current_setting('test.pr284_single_event_b')::bigint
     )
     OR EXISTS (
       SELECT 1
       FROM public.webhook_events
       WHERE id = current_setting('test.pr284_single_event_b')::bigint
         AND expense_id IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.bank_transaction_expense_matches
       WHERE webhook_event_id = current_setting('test.pr284_mismatch_event')::bigint
     )
     OR EXISTS (
       SELECT 1
       FROM public.expenses
       WHERE id IN (
         current_setting('test.pr284_mismatch_a')::bigint,
         current_setting('test.pr284_mismatch_b')::bigint
       )
         AND (payment_method <> 'unpaid' OR paid_at IS NOT NULL)
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.orders o
       JOIN public.payments p ON p.order_id = o.id
       JOIN public.webhook_events e ON e.payment_id = p.id
       WHERE o.id = current_setting('test.pr284_dh_order')::bigint
         AND p.id = current_setting('test.pr284_dh_payment')::bigint
         AND o.payment_status = 'paid'
         AND o.payment_method = 'vietqr'
         AND o.cash_received IS NULL
         AND o.cash_change IS NULL
         AND p.status = 'completed'
         AND p.method = 'vietqr'
         AND p.amount = 88000
         AND p.provider_ref = current_setting('test.pr284_dh_code')
         AND e.id = current_setting('test.pr284_dh_event')::bigint
     )
     OR (
       SELECT count(*)
       FROM public.payments
       WHERE order_id = current_setting('test.pr284_dh_order')::bigint
         AND status <> 'failed'
     ) <> 1
     OR EXISTS (
       SELECT 1 FROM public.payments
       WHERE order_id = current_setting('test.pr284_dh_mismatch_order')::bigint
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.orders
       WHERE id = current_setting('test.pr284_dh_mismatch_order')::bigint
         AND status = 'confirmed'
         AND payment_status = 'unpaid'
         AND payment_method IS NULL
         AND cash_received IS NULL
         AND cash_change IS NULL
         AND total_amount = 99000
         AND payment_code = current_setting('test.pr284_dh_mismatch_code')
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events
       WHERE id = current_setting('test.pr284_dh_mismatch_event')::bigint
         AND processing_status = 'failed'
         AND error_code = 'amount_mismatch'
         AND payment_id IS NULL
     ) THEN
    RAISE EXCEPTION 'PR284 final money evidence is inconsistent';
  END IF;
END;
$$;

ROLLBACK;
