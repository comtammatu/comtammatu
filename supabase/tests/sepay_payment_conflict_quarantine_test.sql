-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sepay_payment_conflict_quarantine_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_owner_id uuid;
  v_menu_category_id bigint;
  v_menu_item_id bigint;
  v_menu_item_name text;
  v_station_id bigint;
  v_account_number text := '999999999999';
  v_amount numeric := 100000;
  v_code_suffix text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  v_fresh_code text;
  v_pending_code text;
  v_cash_code text;
  v_manual_code text;
  v_fresh_order_id bigint;
  v_fresh_payment_id bigint;
  v_fresh_event_id bigint;
  v_fresh_bank_id bigint;
  v_second_bank_id bigint;
  v_expense_id bigint;
  v_duplicate_payment_blocked boolean := false;
  v_mixed_target_blocked boolean := false;
  v_pending_order_id bigint;
  v_pending_payment_id bigint;
  v_pending_event_id bigint;
  v_duplicate_event_id bigint;
  v_cash_order_id bigint;
  v_cash_payment_id bigint;
  v_cash_event_id bigint;
  v_manual_order_id bigint;
  v_manual_payment_id bigint;
  v_manual_event_id bigint;
  v_denied_event_id bigint;
  v_invalid_event_id bigint;
  v_target_job_id bigint;
  v_other_job_id bigint;
  v_claimed_job_id bigint;
  v_invoice_id bigint;
  v_invoice_provider_ref text;
  v_result jsonb;
  v_before_order jsonb;
  v_before_payment jsonb;
  v_after_order jsonb;
  v_after_payment jsonb;
  v_error_message text;
BEGIN
  SELECT
    b.tenant_id,
    b.id,
    p.id
  INTO
    v_tenant_id,
    v_branch_id,
    v_owner_id
  FROM public.branches b
  JOIN public.profiles p
    ON p.tenant_id = b.tenant_id
   AND COALESCE(p.is_active, true)
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
   AND po.code = 'owner'
  WHERE b.is_active
  ORDER BY b.id, p.id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Seed data missing for SePay conflict quarantine test';
  END IF;

  UPDATE public.tenants
  SET legal_name = 'Công ty Cổ phần Chén Sứ',
      tax_code = '0123456789',
      legal_address = 'Test address',
      representative = 'Test representative'
  WHERE id = v_tenant_id;

  INSERT INTO public.invoice_profiles (
    tenant_id,
    version,
    provider,
    seller_tax_code,
    template_code,
    invoice_series,
    status,
    valid_from,
    created_by
  )
  SELECT
    v_tenant_id,
    next_profile.version,
    'viettel',
    '0123456789',
    '1/001',
    'C26TCS',
    'active',
    now(),
    v_owner_id
  FROM LATERAL (
    SELECT coalesce(max(profile.version), 0) + 1 AS version
    FROM public.invoice_profiles AS profile
    WHERE profile.tenant_id = v_tenant_id
  ) AS next_profile
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.invoice_profiles AS active_profile
    WHERE active_profile.tenant_id = v_tenant_id
      AND active_profile.status = 'active'
  );

  INSERT INTO public.system_settings (tenant_id, key, value)
  VALUES (v_tenant_id, 'payment_vietqr_account_no', v_account_number)
  ON CONFLICT (key, tenant_id)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.menu_categories (tenant_id, name)
  VALUES (v_tenant_id, 'SePay Test ' || v_code_suffix)
  RETURNING id INTO v_menu_category_id;

  v_menu_item_name := 'SePay Test Item ' || v_code_suffix;
  INSERT INTO public.menu_items (
    tenant_id,
    category_id,
    name,
    base_price,
    vat_rate
  ) VALUES (
    v_tenant_id,
    v_menu_category_id,
    v_menu_item_name,
    v_amount,
    0
  ) RETURNING id INTO v_menu_item_id;

  INSERT INTO public.kds_stations (tenant_id, branch_id, name)
  VALUES (v_tenant_id, v_branch_id, 'SePay Test ' || v_code_suffix)
  RETURNING id INTO v_station_id;

  INSERT INTO public.kds_station_categories (
    tenant_id,
    station_id,
    category_id
  ) VALUES (
    v_tenant_id,
    v_station_id,
    v_menu_category_id
  );

  v_fresh_code := 'SP' || v_code_suffix || 'F';
  v_pending_code := 'SP' || v_code_suffix || 'P';
  v_cash_code := 'SP' || v_code_suffix || 'C';
  v_manual_code := 'SP' || v_code_suffix || 'L';

  PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    status,
    subtotal,
    total_amount,
    created_by,
    payment_method,
    payment_status,
    payment_code
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'SEPAY-PENDING-' || v_code_suffix,
    'takeaway',
    'served',
    v_amount,
    v_amount,
    v_owner_id,
    'vietqr',
    'pending',
    v_pending_code
  ) RETURNING id INTO v_pending_order_id;

  INSERT INTO public.order_items (
    tenant_id,
    order_id,
    menu_item_id,
    item_name,
    quantity,
    unit_price,
    subtotal,
    status,
    vat_rate
  ) VALUES (
    v_tenant_id,
    v_pending_order_id,
    v_menu_item_id,
    v_menu_item_name,
    1,
    v_amount,
    v_amount,
    'served',
    0
  );

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    provider_ref,
    provider_data,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    v_pending_order_id,
    'vietqr',
    v_amount,
    'pending',
    v_pending_code,
    jsonb_build_object(
      'invoiceSnapshot',
      jsonb_build_object('buyerNotGetInvoice', true)
    ),
    v_owner_id
  ) RETURNING id INTO v_pending_payment_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tax_invoice_issue_jobs j
    WHERE j.tenant_id = v_tenant_id
      AND j.order_id = v_pending_order_id
      AND j.payment_id = v_pending_payment_id
      AND j.status = 'pending_payment'
  ) THEN
    RAISE EXCEPTION 'Pending VietQR did not create its HĐĐT job';
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload
  ) VALUES (
    v_tenant_id,
    'sepay',
    'pending-' || v_code_suffix,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'accountNumber', v_account_number,
      'referenceCode', 'REF-PENDING-' || v_code_suffix,
      'content', v_pending_code
    )
  ) RETURNING id INTO v_pending_event_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_result := public.reconcile_sepay_order_evidence(
    v_pending_event_id,
    v_pending_code
  );

  IF v_result ->> 'status' <> 'matched'
     OR (v_result ->> 'payment_id')::bigint <> v_pending_payment_id THEN
    RAISE EXCEPTION 'Pending VietQR did not reuse and complete its payment: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    JOIN public.webhook_events e ON e.payment_id = p.id
    WHERE p.id = v_pending_payment_id
      AND p.status = 'completed'
      AND p.method = 'vietqr'
      AND o.payment_status = 'paid'
      AND o.status = 'completed'
      AND o.payment_method = 'vietqr'
      AND e.id = v_pending_event_id
      AND e.processing_status = 'processed'
      AND e.error_code IS NULL
  ) THEN
    RAISE EXCEPTION 'Pending VietQR settlement state is incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tax_invoice_issue_jobs j
    WHERE j.tenant_id = v_tenant_id
      AND j.order_id = v_pending_order_id
      AND j.payment_id = v_pending_payment_id
      AND j.status = 'queued'
      AND j.attempt_count = 0
      AND j.tax_invoice_id IS NOT NULL
  ) <> 1 OR (
    SELECT count(*)
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant_id
      AND ti.order_id = v_pending_order_id
      AND ti.status = 'draft'
      AND ti.invoice_number IS NULL
      AND ti.provider_ref IS NULL
      AND ti.invoice_time IS NOT NULL
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant_id
      AND ti.order_id = v_pending_order_id
      AND ti.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Settled VietQR did not create exactly one untouched HĐĐT draft';
  END IF;

  v_result := public.reconcile_sepay_order_evidence(
    v_pending_event_id,
    v_pending_code
  );
  IF v_result ->> 'status' <> 'matched'
     OR COALESCE((v_result ->> 'idempotent')::boolean, false) IS NOT true THEN
    RAISE EXCEPTION 'Same-event replay was not idempotent: %', v_result;
  END IF;

  IF (
    SELECT count(*)
    FROM public.tax_invoice_issue_jobs j
    WHERE j.tenant_id = v_tenant_id
      AND j.order_id = v_pending_order_id
      AND j.payment_id = v_pending_payment_id
      AND j.status = 'queued'
      AND j.attempt_count = 0
      AND j.tax_invoice_id IS NOT NULL
  ) <> 1 OR (
    SELECT count(*)
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant_id
      AND ti.order_id = v_pending_order_id
      AND ti.status = 'draft'
      AND ti.invoice_number IS NULL
      AND ti.provider_ref IS NULL
      AND ti.invoice_time IS NOT NULL
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant_id
      AND ti.order_id = v_pending_order_id
      AND ti.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Same-event replay changed the queued HĐĐT draft';
  END IF;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    status,
    subtotal,
    total_amount,
    created_by,
    payment_method,
    payment_status,
    payment_code
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'SEPAY-FRESH-' || v_code_suffix,
    'takeaway',
    'served',
    v_amount,
    v_amount,
    v_owner_id,
    NULL,
    'unpaid',
    v_fresh_code
  ) RETURNING id INTO v_fresh_order_id;

  INSERT INTO public.order_items (
    tenant_id,
    order_id,
    menu_item_id,
    item_name,
    quantity,
    unit_price,
    subtotal,
    status,
    vat_rate
  ) VALUES (
    v_tenant_id,
    v_fresh_order_id,
    v_menu_item_id,
    v_menu_item_name,
    1,
    v_amount,
    v_amount,
    'served',
    0
  );

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload
  ) VALUES (
    v_tenant_id,
    'sepay',
    'fresh-' || v_code_suffix,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'accountNumber', v_account_number,
      'referenceCode', 'REF-FRESH-' || v_code_suffix,
      'content', v_fresh_code
    )
  ) RETURNING id INTO v_fresh_event_id;

  v_result := public.reconcile_sepay_order_evidence(
    v_fresh_event_id,
    v_fresh_code
  );
  v_fresh_payment_id := NULLIF(v_result ->> 'payment_id', '')::bigint;

  IF v_result ->> 'status' <> 'matched'
     OR v_fresh_payment_id IS NULL
     OR (
       SELECT count(*)
       FROM public.payments
       WHERE tenant_id = v_tenant_id
         AND order_id = v_fresh_order_id
         AND status <> 'failed'
     ) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.payments p
       JOIN public.orders o ON o.id = p.order_id
       JOIN public.webhook_events e ON e.payment_id = p.id
       WHERE p.id = v_fresh_payment_id
         AND p.order_id = v_fresh_order_id
         AND p.method = 'vietqr'
         AND p.status = 'completed'
         AND p.amount = v_amount
         AND p.provider_ref = v_fresh_code
         AND o.payment_status = 'paid'
         AND o.payment_method = 'vietqr'
         AND e.id = v_fresh_event_id
         AND e.order_id = v_fresh_order_id
         AND e.processing_status = 'processed'
         AND e.error_code IS NULL
     ) THEN
    RAISE EXCEPTION 'Fresh unpaid order did not settle exactly once: %', v_result;
  END IF;

  SELECT match.bank_transaction_id
  INTO v_fresh_bank_id
  FROM public.bank_transaction_reconciliation_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.payment_id = v_fresh_payment_id;

  IF v_fresh_bank_id IS NULL THEN
    RAISE EXCEPTION
      'Fresh SePay settlement did not create canonical bank-payment evidence';
  END IF;

  INSERT INTO public.bank_transactions (
    tenant_id,
    provider_transaction_id,
    occurred_at,
    transfer_type,
    amount,
    account_number,
    ingest_source,
    raw_payload
  ) VALUES (
    v_tenant_id,
    'second-bank-' || v_code_suffix,
    now(),
    'in',
    v_amount,
    v_account_number,
    'sepay_export',
    jsonb_build_object('test', 'duplicate-payment-link')
  ) RETURNING id INTO v_second_bank_id;

  BEGIN
    INSERT INTO public.bank_transaction_reconciliation_matches (
      tenant_id,
      bank_transaction_id,
      payment_id,
      matched_amount,
      created_by
    ) VALUES (
      v_tenant_id,
      v_second_bank_id,
      v_fresh_payment_id,
      v_amount,
      v_owner_id
    );
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_payment_blocked := true;
  END;

  IF NOT v_duplicate_payment_blocked THEN
    RAISE EXCEPTION
      'One payment was linked to two bank transactions';
  END IF;

  INSERT INTO public.expenses (
    tenant_id,
    branch_id,
    expense_date,
    category,
    amount,
    subtotal,
    vat_breakdown,
    vat_amount,
    payment_method,
    paid_at,
    note,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    current_date,
    'other',
    v_amount,
    v_amount,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0, 'taxable_amount', v_amount, 'vat_amount', 0
    )),
    0,
    'transfer',
    now(),
    'Operational truth invariant test',
    v_owner_id
  ) RETURNING id INTO v_expense_id;

  BEGIN
    INSERT INTO public.bank_transaction_reconciliation_matches (
      tenant_id,
      bank_transaction_id,
      expense_id,
      matched_amount,
      created_by
    ) VALUES (
      v_tenant_id,
      v_fresh_bank_id,
      v_expense_id,
      v_amount,
      v_owner_id
    );
  EXCEPTION WHEN unique_violation THEN
    v_mixed_target_blocked := true;
  END;

  IF NOT v_mixed_target_blocked THEN
    RAISE EXCEPTION
      'One bank transaction was linked to payment and expense targets';
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload
  ) VALUES (
    v_tenant_id,
    'sepay',
    'duplicate-' || v_code_suffix,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'accountNumber', v_account_number,
      'referenceCode', 'REF-DUPLICATE-' || v_code_suffix,
      'content', v_pending_code
    )
  ) RETURNING id INTO v_duplicate_event_id;

  v_result := public.reconcile_sepay_order_evidence(
    v_duplicate_event_id,
    v_pending_code
  );
  IF v_result ->> 'review_code' <> 'overpayment_needs_review'
     OR EXISTS (
       SELECT 1 FROM public.webhook_events
       WHERE id = v_duplicate_event_id AND payment_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Distinct second transfer was not quarantined: %', v_result;
  END IF;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    status,
    subtotal,
    total_amount,
    created_by,
    payment_method,
    payment_status,
    payment_code,
    cash_received,
    cash_change
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'SEPAY-CASH-' || v_code_suffix,
    'takeaway',
    'completed',
    v_amount,
    v_amount,
    v_owner_id,
    'cash',
    'paid',
    v_cash_code,
    v_amount + 20000,
    20000
  ) RETURNING id INTO v_cash_order_id;

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    paid_at,
    provider_data,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    v_cash_order_id,
    'cash',
    v_amount,
    'completed',
    now(),
    '{"source":"pos"}'::jsonb,
    v_owner_id
  ) RETURNING id INTO v_cash_payment_id;

  SELECT to_jsonb(o) INTO v_before_order
  FROM public.orders o WHERE o.id = v_cash_order_id;
  SELECT to_jsonb(p) INTO v_before_payment
  FROM public.payments p WHERE p.id = v_cash_payment_id;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload
  ) VALUES (
    v_tenant_id,
    'sepay',
    'cash-' || v_code_suffix,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'accountNumber', v_account_number,
      'referenceCode', 'REF-CASH-' || v_code_suffix,
      'content', v_cash_code
    )
  ) RETURNING id INTO v_cash_event_id;

  v_result := public.reconcile_sepay_order_evidence(v_cash_event_id, v_cash_code);

  SELECT to_jsonb(o) INTO v_after_order
  FROM public.orders o WHERE o.id = v_cash_order_id;
  SELECT to_jsonb(p) INTO v_after_payment
  FROM public.payments p WHERE p.id = v_cash_payment_id;

  IF v_result ->> 'review_code' <> 'payment_method_conflict_needs_review'
     OR v_before_order IS DISTINCT FROM v_after_order
     OR v_before_payment IS DISTINCT FROM v_after_payment THEN
    RAISE EXCEPTION 'Completed cash truth was changed: %', v_result;
  END IF;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    status,
    subtotal,
    total_amount,
    created_by,
    payment_method,
    payment_status,
    payment_code
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'SEPAY-MANUAL-' || v_code_suffix,
    'takeaway',
    'completed',
    v_amount,
    v_amount,
    v_owner_id,
    'vietqr',
    'paid',
    v_manual_code
  ) RETURNING id INTO v_manual_order_id;

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    paid_at,
    provider_ref,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    v_manual_order_id,
    'vietqr',
    v_amount,
    'completed',
    now(),
    v_manual_code,
    v_owner_id
  ) RETURNING id INTO v_manual_payment_id;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload
  ) VALUES (
    v_tenant_id,
    'sepay',
    'manual-' || v_code_suffix,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'accountNumber', v_account_number,
      'referenceCode', 'REF-MANUAL-' || v_code_suffix
    )
  ) RETURNING id INTO v_manual_event_id;

  v_result := public.reconcile_sepay_order_evidence(v_manual_event_id, '');
  IF v_result ->> 'status' <> 'missing_payment_code' THEN
    RAISE EXCEPTION 'Missing-code event was not classified for review: %', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  BEGIN
    PERFORM public.link_sepay_transaction_to_payment(
      v_cash_event_id,
      v_manual_payment_id
    );
    RAISE EXCEPTION 'Owner linked a quarantined cash conflict';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    IF v_error_message <> 'webhook_event_failed' THEN
      RAISE EXCEPTION 'Unexpected cash-conflict denial: %', v_error_message;
    END IF;
  END;

  v_result := public.link_sepay_transaction_to_payment(
    v_manual_event_id,
    v_manual_payment_id
  );

  IF (v_result ->> 'payment_id')::bigint <> v_manual_payment_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events
       WHERE id = v_manual_event_id
         AND order_id = v_manual_order_id
         AND payment_id = v_manual_payment_id
         AND processing_status = 'processed'
         AND error_code IS NULL
     ) THEN
    RAISE EXCEPTION 'Owner could not recover missing-code bank evidence: %', v_result;
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status,
    http_status,
    error_code,
    processed_at
  ) VALUES (
    v_tenant_id,
    'sepay',
    'denied-' || v_code_suffix,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', v_amount,
      'accountNumber', v_account_number
    ),
    'processed',
    200,
    'missing_payment_code_needs_review',
    now()
  ) RETURNING id INTO v_denied_event_id;

  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', current_setting('request.jwt.claim.sub'),
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  BEGIN
    PERFORM public.link_sepay_transaction_to_payment(
      v_denied_event_id,
      v_manual_payment_id
    );
    RAISE EXCEPTION 'Non-Owner linked SePay bank evidence';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload
  ) VALUES (
    v_tenant_id,
    'sepay',
    'invalid-' || v_code_suffix,
    true,
    jsonb_build_object(
      'transferType', 'in',
      'transferAmount', -1,
      'accountNumber', v_account_number,
      'content', v_pending_code
    )
  ) RETURNING id INTO v_invalid_event_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.reconcile_sepay_order_evidence(
    v_invalid_event_id,
    v_pending_code
  );

  IF v_result ->> 'status' <> 'invalid_amount'
     OR NOT EXISTS (
       SELECT 1
       FROM public.webhook_events
       WHERE id = v_invalid_event_id
         AND processing_status = 'failed'
         AND error_code = 'invalid_amount'
     ) THEN
    RAISE EXCEPTION 'Invalid amount was not kept fail-closed: %', v_result;
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.confirm_sepay_payment(bigint,bigint,text,numeric,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role still executes confirm_sepay_payment directly';
  END IF;

  SELECT id INTO v_target_job_id
  FROM public.tax_invoice_issue_jobs
  WHERE order_id = v_pending_order_id;

  PERFORM private.upsert_tax_invoice_issue_job(
    v_tenant_id,
    v_branch_id,
    v_fresh_order_id,
    v_fresh_payment_id,
    jsonb_build_object('buyerNotGetInvoice', true),
    'queued'
  );

  SELECT id INTO v_other_job_id
  FROM public.tax_invoice_issue_jobs
  WHERE order_id = v_fresh_order_id;

  UPDATE public.tax_invoice_issue_jobs
  SET available_at = now() - interval '1 second'
  WHERE id = v_target_job_id;

  SELECT id INTO v_claimed_job_id
  FROM public.claim_tax_invoice_issue_job(v_target_job_id, 300);

  IF v_claimed_job_id IS DISTINCT FROM v_target_job_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.tax_invoice_issue_jobs
       WHERE id = v_target_job_id
         AND status = 'processing'
         AND attempt_count = 1
         AND locked_until > now()
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.tax_invoice_issue_jobs
       WHERE id = v_other_job_id
         AND status = 'queued'
         AND attempt_count = 0
         AND locked_until IS NULL
     ) THEN
    RAISE EXCEPTION 'Scoped HĐĐT claim changed a non-target job';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.claim_tax_invoice_issue_job(v_target_job_id, 300)
  ) THEN
    RAISE EXCEPTION 'Scoped HĐĐT claim reclaimed an active lease';
  END IF;

  v_invoice_provider_ref := 'HDDT-TEST-' || v_code_suffix;
  SELECT tax_invoice_id INTO v_invoice_id
  FROM public.tax_invoice_issue_jobs
  WHERE id = v_target_job_id;

  v_result := public.prepare_tax_invoice_issue_job_as_system(
    v_target_job_id,
    v_invoice_id,
    v_invoice_provider_ref
  );
  IF v_result ->> 'status' <> 'signing' THEN
    RAISE EXCEPTION 'Payment-time HĐĐT draft was not prepared: %', v_result;
  END IF;

  v_result := public.reconcile_tax_invoice_provider_issued(
    v_invoice_id,
    v_invoice_provider_ref,
    'C26MAATEST',
    'M2-TEST',
    jsonb_build_object('transactionUuid', v_invoice_provider_ref),
    now(),
    'cron'
  );

  IF v_result ->> 'status' <> 'issued'
     OR NOT EXISTS (
       SELECT 1
       FROM public.tax_invoice_issue_jobs
       WHERE id = v_target_job_id
         AND status = 'completed'
         AND tax_invoice_id = v_invoice_id
         AND locked_until IS NULL
         AND last_error IS NULL
     ) THEN
    RAISE EXCEPTION 'Provider reconciliation did not bind the completed job: %', v_result;
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.confirm_cash_payment_with_invoice_binding(bigint,numeric)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'private.upsert_tax_invoice_issue_job(bigint,bigint,bigint,bigint,jsonb,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Internal HĐĐT payment helper remains directly executable';
  END IF;
END;
$$;

ROLLBACK;
