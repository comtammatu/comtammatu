-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sepay_payment_conflict_adjudication_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_staff uuid;
  v_account text := '9704360012345678';
  v_amount numeric := 32100;
  v_code_order bigint;
  v_method_order bigint;
  v_pending_order bigint;
  v_success_order bigint;
  v_code_payment bigint;
  v_method_payment bigint;
  v_pending_payment bigint;
  v_success_payment bigint;
  v_code_event bigint;
  v_code_mismatch_event bigint;
  v_method_event bigint;
  v_pending_event bigint;
  v_success_event bigint;
  v_request_seed bigint := (extract(epoch FROM clock_timestamp()) * 1000000)::bigint;
  v_code_request text := (v_request_seed + 1)::text;
  v_code_mismatch_request text := (v_request_seed + 2)::text;
  v_method_request text := (v_request_seed + 3)::text;
  v_pending_request text := (v_request_seed + 4)::text;
  v_success_request text := (v_request_seed + 5)::text;
  v_payment_code text;
BEGIN
  SELECT b.tenant_id, b.id
  INTO v_tenant, v_branch
  FROM public.branches b
  WHERE b.is_active
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.tenant_id = b.tenant_id
        AND pr.is_active
        AND public.auth_is_owner(pr.id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.tenant_id = b.tenant_id
        AND pr.is_active
        AND NOT public.auth_is_owner(pr.id)
    )
  ORDER BY b.id
  LIMIT 1;

  SELECT pr.id
  INTO v_owner
  FROM public.profiles pr
  WHERE pr.tenant_id = v_tenant
    AND pr.is_active
    AND public.auth_is_owner(pr.id)
  ORDER BY pr.id
  LIMIT 1;

  SELECT pr.id
  INTO v_staff
  FROM public.profiles pr
  WHERE pr.tenant_id = v_tenant
    AND pr.is_active
    AND NOT public.auth_is_owner(pr.id)
  ORDER BY pr.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_owner IS NULL OR v_staff IS NULL THEN
    RAISE EXCEPTION 'SePay adjudication test requires tenant, branch, owner, and staff seed data';
  END IF;

  INSERT INTO public.system_settings (tenant_id, key, value)
  VALUES (v_tenant, 'payment_vietqr_account_no', v_account)
  ON CONFLICT (key, tenant_id) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status, payment_method, cash_received, cash_change
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-ADJ-CODE-' || gen_random_uuid()::text,
    'completed', v_amount, v_amount, v_owner, 'paid', 'cash', v_amount, 0
  )
  RETURNING id, payment_code INTO v_code_order, v_payment_code;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, paid_at,
    provider_data, created_by
  ) VALUES (
    v_tenant, v_branch, v_code_order, 'cash', v_amount, 'completed', now(),
    jsonb_build_object('source', 'sepay_adjudication_test'), v_owner
  )
  RETURNING id INTO v_code_payment;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status, http_status, error_code, processed_at, order_id
  ) VALUES (
    v_tenant, 'sepay', v_code_request, true,
    jsonb_build_object(
      'id', v_code_request::bigint,
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'PAY ' || v_payment_code || ' EXACT',
      'description', '',
      'code', '',
      'accountNumber', v_account,
      'referenceCode', 'BANK-CODE-' || v_code_order::text
    ),
    'processed', 200, 'payment_code_conflict_needs_review', now(), v_code_order
  )
  RETURNING id INTO v_code_event;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status, http_status, error_code, processed_at, order_id
  ) VALUES (
    v_tenant, 'sepay', v_code_mismatch_request, true,
    jsonb_build_object(
      'id', v_code_mismatch_request::bigint,
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'UNRELATED PAYMENT TOKEN',
      'description', '',
      'code', '',
      'accountNumber', v_account,
      'referenceCode', 'BANK-CODE-MISMATCH-' || v_code_order::text
    ),
    'processed', 200, 'payment_code_conflict_needs_review', now(), v_code_order
  )
  RETURNING id INTO v_code_mismatch_event;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status, payment_method, cash_received, cash_change
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-ADJ-METHOD-' || gen_random_uuid()::text,
    'completed', v_amount, v_amount, v_owner, 'paid', 'cash', v_amount, 0
  )
  RETURNING id, payment_code INTO v_method_order, v_payment_code;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, created_by
  ) VALUES (
    v_tenant, v_branch, v_method_order, 'momo', v_amount, 'failed',
    'MOMO-FAILED-' || v_method_order::text,
    jsonb_build_object('resultCode', 1006, 'transactionId', 'momo-failed'),
    v_owner
  );

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, paid_at,
    provider_data, created_by
  ) VALUES (
    v_tenant, v_branch, v_method_order, 'cash', v_amount, 'completed', now(),
    jsonb_build_object('source', 'sepay_adjudication_test'), v_owner
  )
  RETURNING id INTO v_method_payment;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status, http_status, error_code, processed_at, order_id
  ) VALUES (
    v_tenant, 'sepay', v_method_request, true,
    jsonb_build_object(
      'id', v_method_request::bigint,
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'PAY ' || v_payment_code || ' EXACT',
      'description', '',
      'code', '',
      'accountNumber', v_account,
      'referenceCode', 'BANK-METHOD-' || v_method_order::text
    ),
    'processed', 200, 'payment_method_conflict_needs_review', now(), v_method_order
  )
  RETURNING id INTO v_method_event;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status, payment_method
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-ADJ-PENDING-' || gen_random_uuid()::text,
    'confirmed', v_amount, v_amount, v_owner, 'pending', 'momo'
  )
  RETURNING id, payment_code INTO v_pending_order, v_payment_code;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, created_by
  ) VALUES (
    v_tenant, v_branch, v_pending_order, 'momo', v_amount, 'pending',
    'MOMO-PENDING-' || v_pending_order::text,
    jsonb_build_object('source', 'self_order_momo'), v_owner
  )
  RETURNING id INTO v_pending_payment;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status, http_status, error_code, processed_at, order_id
  ) VALUES (
    v_tenant, 'sepay', v_pending_request, true,
    jsonb_build_object(
      'id', v_pending_request::bigint,
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'PAY ' || v_payment_code || ' EXACT',
      'description', '',
      'code', '',
      'accountNumber', v_account,
      'referenceCode', 'BANK-PENDING-' || v_pending_order::text
    ),
    'processed', 200, 'payment_method_conflict_needs_review', now(), v_pending_order
  )
  RETURNING id INTO v_pending_event;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status, payment_method
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-ADJ-SUCCESS-' || gen_random_uuid()::text,
    'confirmed', v_amount, v_amount, v_owner, 'unpaid', NULL
  )
  RETURNING id, payment_code INTO v_success_order, v_payment_code;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, created_by
  ) VALUES (
    v_tenant, v_branch, v_success_order, 'momo', v_amount, 'failed',
    'MOMO-SUCCESS-' || v_success_order::text, '{}'::jsonb, v_owner
  )
  RETURNING id INTO v_success_payment;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, payment_id, signature_valid, payload,
    processing_status, http_status, processed_at
  ) VALUES (
    v_tenant, 'momo', 'momo-success-' || gen_random_uuid()::text,
    v_success_payment, true,
    jsonb_build_object(
      'resultCode', 0,
      'transactionId', 'momo-authoritative-success',
      'amount', v_amount
    ),
    'failed', 204, now()
  );

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status, http_status, error_code, processed_at, order_id
  ) VALUES (
    v_tenant, 'sepay', v_success_request, true,
    jsonb_build_object(
      'id', v_success_request::bigint,
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'PAY ' || v_payment_code || ' EXACT',
      'description', '',
      'code', '',
      'accountNumber', v_account,
      'referenceCode', 'BANK-SUCCESS-' || v_success_order::text
    ),
    'processed', 200, 'payment_method_conflict_needs_review', now(), v_success_order
  )
  RETURNING id INTO v_success_event;

  PERFORM set_config('test.sepay_adj_tenant', v_tenant::text, true);
  PERFORM set_config('test.sepay_adj_owner', v_owner::text, true);
  PERFORM set_config('test.sepay_adj_staff', v_staff::text, true);
  PERFORM set_config('test.sepay_adj_amount', v_amount::text, true);
  PERFORM set_config('test.sepay_adj_code_order', v_code_order::text, true);
  PERFORM set_config('test.sepay_adj_method_order', v_method_order::text, true);
  PERFORM set_config('test.sepay_adj_pending_order', v_pending_order::text, true);
  PERFORM set_config('test.sepay_adj_success_order', v_success_order::text, true);
  PERFORM set_config('test.sepay_adj_code_payment', v_code_payment::text, true);
  PERFORM set_config('test.sepay_adj_method_payment', v_method_payment::text, true);
  PERFORM set_config('test.sepay_adj_pending_payment', v_pending_payment::text, true);
  PERFORM set_config('test.sepay_adj_code_event', v_code_event::text, true);
  PERFORM set_config('test.sepay_adj_code_mismatch_event', v_code_mismatch_event::text, true);
  PERFORM set_config('test.sepay_adj_method_event', v_method_event::text, true);
  PERFORM set_config('test.sepay_adj_pending_event', v_pending_event::text, true);
  PERFORM set_config('test.sepay_adj_success_event', v_success_event::text, true);
  PERFORM set_config('test.sepay_adj_code_request', v_code_request, true);
  PERFORM set_config('test.sepay_adj_code_mismatch_request', v_code_mismatch_request, true);
  PERFORM set_config('test.sepay_adj_method_request', v_method_request, true);
  PERFORM set_config('test.sepay_adj_pending_request', v_pending_request, true);
  PERFORM set_config('test.sepay_adj_success_request', v_success_request, true);
END;
$$;

DO $$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.adjudicate_sepay_payment_conflict(bigint,bigint,text,numeric)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.adjudicate_sepay_payment_conflict(bigint,bigint,text,numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.adjudicate_sepay_payment_conflict(bigint,bigint,text,numeric)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'SePay adjudication function grants are unsafe';
  END IF;
END;
$$;

DO $$
DECLARE
  v_tenant bigint := current_setting('test.sepay_adj_tenant')::bigint;
  v_branch bigint;
  v_owner uuid := current_setting('test.sepay_adj_owner')::uuid;
  v_amount numeric := current_setting('test.sepay_adj_amount')::numeric;
  v_same_order_a bigint;
  v_same_order_b bigint;
  v_same_code_a text;
  v_same_code_b text;
  v_diff_order_a bigint;
  v_diff_order_b bigint;
  v_diff_code_a text;
  v_diff_code_b text;
  v_event bigint;
  v_result jsonb;
BEGIN
  SELECT b.id
  INTO v_branch
  FROM public.branches b
  WHERE b.tenant_id = v_tenant
    AND b.is_active
  ORDER BY b.id
  LIMIT 1;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-AMB-SAME-A-' || gen_random_uuid()::text,
    'confirmed', v_amount, v_amount, v_owner, 'unpaid'
  )
  RETURNING id, payment_code INTO v_same_order_a, v_same_code_a;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-AMB-SAME-B-' || gen_random_uuid()::text,
    'confirmed', v_amount, v_amount, v_owner, 'unpaid'
  )
  RETURNING id, payment_code INTO v_same_order_b, v_same_code_b;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_tenant, 'sepay', 'sepay-amb-same-' || gen_random_uuid()::text, true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'PAY ' || v_same_code_a || ' AND ' || v_same_code_b,
      'description', '',
      'code', ''
    ),
    'received'
  )
  RETURNING id INTO v_event;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.reconcile_sepay_order_evidence(v_event, v_same_code_a);

  IF v_result ->> 'status' <> 'ambiguous_payment_code'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       WHERE e.id = v_event
         AND e.processing_status = 'failed'
         AND e.http_status = 200
         AND e.error_code = 'ambiguous_payment_code'
         AND e.order_id IS NULL
         AND e.payment_id IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.order_id IN (v_same_order_a, v_same_order_b)
     ) THEN
    RAISE EXCEPTION 'SePay same-amount multi-code memo was not quarantined: %',
      v_result;
  END IF;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-AMB-DIFF-A-' || gen_random_uuid()::text,
    'confirmed', v_amount, v_amount, v_owner, 'unpaid'
  )
  RETURNING id, payment_code INTO v_diff_order_a, v_diff_code_a;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal, total_amount,
    created_by, payment_status
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-AMB-DIFF-B-' || gen_random_uuid()::text,
    'confirmed', v_amount + 1000, v_amount + 1000, v_owner, 'unpaid'
  )
  RETURNING id, payment_code INTO v_diff_order_b, v_diff_code_b;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_tenant, 'sepay', 'sepay-amb-diff-' || gen_random_uuid()::text, true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'PAY ' || v_diff_code_a || ' AND ' || v_diff_code_b,
      'description', '',
      'code', ''
    ),
    'received'
  )
  RETURNING id INTO v_event;

  v_result := public.reconcile_sepay_order_evidence(v_event, v_diff_code_a);

  IF v_result ->> 'status' <> 'ambiguous_payment_code'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       WHERE e.id = v_event
         AND e.processing_status = 'failed'
         AND e.http_status = 200
         AND e.error_code = 'ambiguous_payment_code'
         AND e.order_id IS NULL
         AND e.payment_id IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.order_id IN (v_diff_order_a, v_diff_order_b)
     ) THEN
    RAISE EXCEPTION 'SePay different-amount multi-code memo was not quarantined: %',
      v_result;
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_tenant, 'sepay', 'sepay-route-code-mismatch-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'content', 'PAY ' || v_same_code_b,
      'description', '',
      'code', ''
    ),
    'received'
  )
  RETURNING id INTO v_event;

  v_result := public.reconcile_sepay_order_evidence(v_event, v_same_code_a);

  IF v_result ->> 'status' <> 'payment_code_conflict_needs_review'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       WHERE e.id = v_event
         AND e.processing_status = 'processed'
         AND e.http_status = 200
         AND e.error_code = 'payment_code_conflict_needs_review'
         AND e.order_id = v_same_order_b
         AND e.payment_id IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.order_id IN (v_same_order_a, v_same_order_b)
     ) THEN
    RAISE EXCEPTION 'SePay route-selected code mismatch was accepted: %',
      v_result;
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.sepay_adj_staff'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.sepay_adj_staff'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.sepay_adj_tenant')::bigint
    )
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.adjudicate_sepay_payment_conflict(
      current_setting('test.sepay_adj_code_event')::bigint,
      current_setting('test.sepay_adj_code_order')::bigint,
      current_setting('test.sepay_adj_code_request'),
      current_setting('test.sepay_adj_amount')::numeric
    );
    RAISE EXCEPTION 'Non-owner adjudicated a SePay conflict';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'forbidden_owner_only' THEN
      RAISE;
    END IF;
  END;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', current_setting('test.sepay_adj_owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.sepay_adj_owner'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.sepay_adj_tenant')::bigint
    )
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    PERFORM public.adjudicate_sepay_payment_conflict(
      current_setting('test.sepay_adj_code_event')::bigint,
      current_setting('test.sepay_adj_code_order')::bigint,
      current_setting('test.sepay_adj_code_request'),
      current_setting('test.sepay_adj_amount')::numeric + 1
    );
    RAISE EXCEPTION 'Stale SePay amount was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'sepay_conflict_amount_changed' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.adjudicate_sepay_payment_conflict(
      current_setting('test.sepay_adj_code_mismatch_event')::bigint,
      current_setting('test.sepay_adj_code_order')::bigint,
      current_setting('test.sepay_adj_code_mismatch_request'),
      current_setting('test.sepay_adj_amount')::numeric
    );
    RAISE EXCEPTION 'Mismatched SePay payment code was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'sepay_conflict_payment_code_evidence_mismatch' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.adjudicate_sepay_payment_conflict(
      current_setting('test.sepay_adj_pending_event')::bigint,
      current_setting('test.sepay_adj_pending_order')::bigint,
      current_setting('test.sepay_adj_pending_request'),
      current_setting('test.sepay_adj_amount')::numeric
    );
    RAISE EXCEPTION 'Pending MoMo was overwritten by SePay';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'momo_payment_pending' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.adjudicate_sepay_payment_conflict(
      current_setting('test.sepay_adj_success_event')::bigint,
      current_setting('test.sepay_adj_success_order')::bigint,
      current_setting('test.sepay_adj_success_request'),
      current_setting('test.sepay_adj_amount')::numeric
    );
    RAISE EXCEPTION 'Signed MoMo success was overwritten by SePay';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'momo_authoritative_success' THEN
      RAISE;
    END IF;
  END;

  v_result := public.adjudicate_sepay_payment_conflict(
    current_setting('test.sepay_adj_code_event')::bigint,
    current_setting('test.sepay_adj_code_order')::bigint,
    current_setting('test.sepay_adj_code_request'),
    current_setting('test.sepay_adj_amount')::numeric
  );
  IF v_result ->> 'status' <> 'matched'
     OR COALESCE((v_result ->> 'adjudicated')::boolean, false) IS NOT true
     OR (v_result ->> 'payment_id')::bigint <>
       current_setting('test.sepay_adj_code_payment')::bigint THEN
    RAISE EXCEPTION 'Code-conflict adjudication failed: %', v_result;
  END IF;
  IF current_setting('request.jwt.claim.role', true) <> 'authenticated' THEN
    RAISE EXCEPTION 'Adjudication leaked service_role claim state';
  END IF;

  BEGIN
    PERFORM public.adjudicate_sepay_payment_conflict(
      current_setting('test.sepay_adj_code_event')::bigint,
      current_setting('test.sepay_adj_code_order')::bigint,
      current_setting('test.sepay_adj_code_request'),
      current_setting('test.sepay_adj_amount')::numeric
    );
    RAISE EXCEPTION 'Resolved SePay event was adjudicated twice';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'sepay_conflict_evidence_changed' THEN
      RAISE;
    END IF;
  END;

  v_result := public.adjudicate_sepay_payment_conflict(
    current_setting('test.sepay_adj_method_event')::bigint,
    current_setting('test.sepay_adj_method_order')::bigint,
    current_setting('test.sepay_adj_method_request'),
    current_setting('test.sepay_adj_amount')::numeric
  );
  IF v_result ->> 'status' <> 'matched'
     OR COALESCE((v_result ->> 'adjudicated')::boolean, false) IS NOT true
     OR (v_result ->> 'payment_id')::bigint <>
       current_setting('test.sepay_adj_method_payment')::bigint THEN
    RAISE EXCEPTION 'Method-conflict adjudication failed: %', v_result;
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       JOIN public.payments p ON p.id = e.payment_id
       JOIN public.orders o ON o.id = e.order_id
       WHERE e.id = current_setting('test.sepay_adj_code_event')::bigint
         AND e.processing_status = 'processed'
         AND e.error_code IS NULL
         AND p.id = current_setting('test.sepay_adj_code_payment')::bigint
         AND p.method = 'vietqr'
         AND p.status = 'completed'
         AND p.amount = current_setting('test.sepay_adj_amount')::numeric
         AND p.provider_ref = o.payment_code
         AND o.payment_status = 'paid'
         AND o.payment_method = 'vietqr'
         AND o.cash_received IS NULL
         AND o.cash_change IS NULL
     ) THEN
    RAISE EXCEPTION 'Code-conflict settlement evidence is incomplete';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       JOIN public.payments p ON p.id = e.payment_id
       JOIN public.orders o ON o.id = e.order_id
       WHERE e.id = current_setting('test.sepay_adj_method_event')::bigint
         AND e.processing_status = 'processed'
         AND e.error_code IS NULL
         AND p.id = current_setting('test.sepay_adj_method_payment')::bigint
         AND p.method = 'vietqr'
         AND p.status = 'completed'
         AND p.amount = current_setting('test.sepay_adj_amount')::numeric
         AND p.provider_ref = o.payment_code
         AND o.payment_status = 'paid'
         AND o.payment_method = 'vietqr'
     ) THEN
    RAISE EXCEPTION 'Method-conflict settlement evidence is incomplete';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.payments p
  WHERE p.order_id IN (
    current_setting('test.sepay_adj_code_order')::bigint,
    current_setting('test.sepay_adj_method_order')::bigint
  )
    AND p.status <> 'failed';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Adjudication created duplicate active payments: %', v_count;
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       JOIN public.payments p ON p.id = current_setting('test.sepay_adj_pending_payment')::bigint
       WHERE e.id = current_setting('test.sepay_adj_pending_event')::bigint
         AND e.payment_id IS NULL
         AND e.error_code = 'payment_method_conflict_needs_review'
         AND p.method = 'momo'
         AND p.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'Pending MoMo blocker mutated payment evidence';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.webhook_events e
       WHERE e.id = current_setting('test.sepay_adj_success_event')::bigint
         AND e.payment_id IS NULL
         AND e.error_code = 'payment_method_conflict_needs_review'
     ) THEN
    RAISE EXCEPTION 'Authoritative MoMo blocker mutated SePay evidence';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.audit_logs a
       WHERE a.tenant_id = current_setting('test.sepay_adj_tenant')::bigint
         AND a.user_id = current_setting('test.sepay_adj_owner')::uuid
         AND a.action = 'adjudicate_sepay_payment_conflict'
         AND a.entity_type = 'webhook_event'
         AND a.entity_id IN (
           current_setting('test.sepay_adj_code_event')::bigint,
           current_setting('test.sepay_adj_method_event')::bigint
         )
       GROUP BY a.tenant_id, a.user_id, a.action, a.entity_type
       HAVING count(*) = 2
     ) THEN
    RAISE EXCEPTION 'Adjudication audit trail is incomplete';
  END IF;
END;
$$;

ROLLBACK;
