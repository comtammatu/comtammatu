-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sepay_supplier_payment_link_acceptance_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_supplier bigint;
  v_invoice bigint;
  v_payment_a bigint;
  v_payment_b bigint;
  v_payment_cash bigint;
  v_payment_expense_first bigint;
  v_payment_supplier_first bigint;
  v_payment_invalid_event bigint;
  v_event_exact bigint;
  v_event_mismatch bigint;
  v_event_double_link bigint;
  v_event_cash bigint;
  v_event_expense_first bigint;
  v_event_supplier_first bigint;
  v_event_unsigned bigint;
  v_event_inbound bigint;
  v_event_inflight bigint;
  v_event_order bigint;
  v_event_payment bigint;
  v_expense_first bigint;
  v_expense_supplier_first bigint;
  v_order bigint;
  v_order_payment bigint;
  v_seed text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT branch.tenant_id, branch.id
  INTO v_tenant, v_branch
  FROM public.branches branch
  WHERE branch.is_active
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.tenant_id = branch.tenant_id
        AND profile.is_active
        AND public.auth_is_owner(profile.id)
    )
  ORDER BY branch.id
  LIMIT 1;

  SELECT profile.id
  INTO v_owner
  FROM public.profiles profile
  WHERE profile.tenant_id = v_tenant
    AND profile.is_active
    AND public.auth_is_owner(profile.id)
  ORDER BY profile.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION
      'SePay supplier-payment test requires tenant, branch, and Owner seed data';
  END IF;

  INSERT INTO public.suppliers (tenant_id, name)
  VALUES (v_tenant, 'SePay supplier link test ' || v_seed)
  RETURNING id INTO v_supplier;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    invoice_number,
    invoice_date,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    matching_status,
    created_by
  ) VALUES (
    v_tenant,
    v_supplier,
    'SEPAY-LINK-' || v_seed,
    now(),
    500000,
    0,
    0,
    500000,
    'matched',
    v_owner
  )
  RETURNING id INTO v_invoice;

  INSERT INTO public.supplier_payments (
    tenant_id, supplier_invoice_id, payment_method, amount, created_by
  ) VALUES
    (v_tenant, v_invoice, 'bank_transfer', 60000, v_owner),
    (v_tenant, v_invoice, 'bank_transfer', 40000, v_owner),
    (v_tenant, v_invoice, 'cash', 100000, v_owner),
    (v_tenant, v_invoice, 'bank_transfer', 70000, v_owner),
    (v_tenant, v_invoice, 'bank_transfer', 80000, v_owner),
    (v_tenant, v_invoice, 'bank_transfer', 90000, v_owner);

  SELECT payment.id INTO v_payment_a
  FROM public.supplier_payments payment
  WHERE payment.supplier_invoice_id = v_invoice AND payment.amount = 60000;
  SELECT payment.id INTO v_payment_b
  FROM public.supplier_payments payment
  WHERE payment.supplier_invoice_id = v_invoice AND payment.amount = 40000;
  SELECT payment.id INTO v_payment_cash
  FROM public.supplier_payments payment
  WHERE payment.supplier_invoice_id = v_invoice AND payment.payment_method = 'cash';
  SELECT payment.id INTO v_payment_expense_first
  FROM public.supplier_payments payment
  WHERE payment.supplier_invoice_id = v_invoice AND payment.amount = 70000;
  SELECT payment.id INTO v_payment_supplier_first
  FROM public.supplier_payments payment
  WHERE payment.supplier_invoice_id = v_invoice AND payment.amount = 80000;
  SELECT payment.id INTO v_payment_invalid_event
  FROM public.supplier_payments payment
  WHERE payment.supplier_invoice_id = v_invoice AND payment.amount = 90000;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload, processing_status
  ) VALUES
    (v_tenant, 'sepay', 'supplier-exact-' || v_seed, true,
      '{"transferType":"out","transferAmount":100000}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-mismatch-' || v_seed, true,
      '{"transferType":"out","transferAmount":100001}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-double-' || v_seed, true,
      '{"transferType":"out","transferAmount":60000}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-cash-' || v_seed, true,
      '{"transferType":"out","transferAmount":100000}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-expense-first-' || v_seed, true,
      '{"transferType":"out","transferAmount":70000}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-supplier-first-' || v_seed, true,
      '{"transferType":"out","transferAmount":80000}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-unsigned-' || v_seed, false,
      '{"transferType":"out","transferAmount":90000}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-inbound-' || v_seed, true,
      '{"transferType":"in","transferAmount":90000}'::jsonb, 'ignored'),
    (v_tenant, 'sepay', 'supplier-inflight-' || v_seed, true,
      '{"transferType":"out","transferAmount":90000}'::jsonb, 'received');

  SELECT id INTO v_event_exact FROM public.webhook_events
    WHERE request_id = 'supplier-exact-' || v_seed;
  SELECT id INTO v_event_mismatch FROM public.webhook_events
    WHERE request_id = 'supplier-mismatch-' || v_seed;
  SELECT id INTO v_event_double_link FROM public.webhook_events
    WHERE request_id = 'supplier-double-' || v_seed;
  SELECT id INTO v_event_cash FROM public.webhook_events
    WHERE request_id = 'supplier-cash-' || v_seed;
  SELECT id INTO v_event_expense_first FROM public.webhook_events
    WHERE request_id = 'supplier-expense-first-' || v_seed;
  SELECT id INTO v_event_supplier_first FROM public.webhook_events
    WHERE request_id = 'supplier-supplier-first-' || v_seed;
  SELECT id INTO v_event_unsigned FROM public.webhook_events
    WHERE request_id = 'supplier-unsigned-' || v_seed;
  SELECT id INTO v_event_inbound FROM public.webhook_events
    WHERE request_id = 'supplier-inbound-' || v_seed;
  SELECT id INTO v_event_inflight FROM public.webhook_events
    WHERE request_id = 'supplier-inflight-' || v_seed;

  UPDATE public.webhook_events
  SET error_code = 'transfer_type_out'
  WHERE id = v_event_exact;

  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount,
    payment_method, note, created_by
  ) VALUES (
    v_tenant, v_branch, current_date, 'other', 70000,
    'unpaid', 'SePay supplier exclusion expense first', v_owner
  ) RETURNING id INTO v_expense_first;

  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount,
    payment_method, note, created_by
  ) VALUES (
    v_tenant, v_branch, current_date, 'other', 80000,
    'unpaid', 'SePay supplier exclusion supplier first', v_owner
  ) RETURNING id INTO v_expense_supplier_first;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, subtotal,
    total_amount, created_by, payment_status
  ) VALUES (
    v_tenant, v_branch, 'SEPAY-LINK-' || v_seed, 'confirmed', 90000,
    90000, v_owner, 'unpaid'
  ) RETURNING id INTO v_order;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_order, 'cash', 90000, 'completed', v_owner
  ) RETURNING id INTO v_order_payment;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status, order_id
  ) VALUES (
    v_tenant, 'sepay', 'supplier-order-' || v_seed, true,
    '{"transferType":"out","transferAmount":90000}'::jsonb,
    'ignored', v_order
  ) RETURNING id INTO v_event_order;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, signature_valid, payload,
    processing_status, payment_id
  ) VALUES (
    v_tenant, 'sepay', 'supplier-payment-' || v_seed, true,
    '{"transferType":"out","transferAmount":90000}'::jsonb,
    'ignored', v_order_payment
  ) RETURNING id INTO v_event_payment;

  PERFORM set_config('test.supplier_link_tenant', v_tenant::text, true);
  PERFORM set_config('test.supplier_link_owner', v_owner::text, true);
  PERFORM set_config('test.supplier_link_invoice', v_invoice::text, true);
  PERFORM set_config('test.supplier_link_payment_a', v_payment_a::text, true);
  PERFORM set_config('test.supplier_link_payment_b', v_payment_b::text, true);
  PERFORM set_config('test.supplier_link_payment_cash', v_payment_cash::text, true);
  PERFORM set_config(
    'test.supplier_link_payment_expense_first',
    v_payment_expense_first::text,
    true
  );
  PERFORM set_config(
    'test.supplier_link_payment_supplier_first',
    v_payment_supplier_first::text,
    true
  );
  PERFORM set_config(
    'test.supplier_link_payment_invalid_event',
    v_payment_invalid_event::text,
    true
  );
  PERFORM set_config('test.supplier_link_event_exact', v_event_exact::text, true);
  PERFORM set_config('test.supplier_link_event_mismatch', v_event_mismatch::text, true);
  PERFORM set_config('test.supplier_link_event_double', v_event_double_link::text, true);
  PERFORM set_config('test.supplier_link_event_cash', v_event_cash::text, true);
  PERFORM set_config(
    'test.supplier_link_event_expense_first',
    v_event_expense_first::text,
    true
  );
  PERFORM set_config(
    'test.supplier_link_event_supplier_first',
    v_event_supplier_first::text,
    true
  );
  PERFORM set_config('test.supplier_link_event_unsigned', v_event_unsigned::text, true);
  PERFORM set_config('test.supplier_link_event_inbound', v_event_inbound::text, true);
  PERFORM set_config('test.supplier_link_event_inflight', v_event_inflight::text, true);
  PERFORM set_config('test.supplier_link_event_order', v_event_order::text, true);
  PERFORM set_config('test.supplier_link_event_payment', v_event_payment::text, true);
  PERFORM set_config('test.supplier_link_expense_first', v_expense_first::text, true);
  PERFORM set_config(
    'test.supplier_link_expense_supplier_first',
    v_expense_supplier_first::text,
    true
  );
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('test.supplier_link_owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.supplier_link_owner'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.supplier_link_tenant')::bigint
    )
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_result jsonb;
  v_exact_event bigint := current_setting('test.supplier_link_event_exact')::bigint;
  v_payment_a bigint := current_setting('test.supplier_link_payment_a')::bigint;
  v_payment_b bigint := current_setting('test.supplier_link_payment_b')::bigint;
  v_non_owner uuid := gen_random_uuid();
BEGIN
  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_mismatch')::bigint,
      ARRAY[v_payment_a, v_payment_a]
    );
    RAISE EXCEPTION 'Duplicate supplier-payment IDs were accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'supplier_payment_link_invalid' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_mismatch')::bigint,
      ARRAY[v_payment_a, NULL::bigint]
    );
    RAISE EXCEPTION 'Null supplier-payment ID was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'supplier_payment_link_invalid' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_mismatch')::bigint,
      ARRAY[9223372036854770000::bigint]
    );
    RAISE EXCEPTION 'Missing supplier payment was accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    IF SQLERRM <> 'supplier_payment_not_found' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_mismatch')::bigint,
      ARRAY[v_payment_a, v_payment_b]
    );
    RAISE EXCEPTION 'Supplier-payment amount mismatch was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'supplier_payment_amount_mismatch' THEN RAISE; END IF;
  END;

  v_result := public.set_sepay_supplier_payment_links(
    v_exact_event,
    ARRAY[v_payment_b, v_payment_a]
  );
  IF (v_result->>'matched_count')::integer <> 2
    OR (v_result->>'matched_amount')::numeric <> 100000
  THEN
    RAISE EXCEPTION 'Exact supplier-payment link failed: %', v_result;
  END IF;

  v_result := public.set_sepay_supplier_payment_links(
    v_exact_event,
    ARRAY[v_payment_a, v_payment_b]
  );
  IF (v_result->>'matched_count')::integer <> 2 THEN
    RAISE EXCEPTION 'Supplier-payment link replay failed: %', v_result;
  END IF;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_double')::bigint,
      ARRAY[v_payment_a]
    );
    RAISE EXCEPTION 'Supplier payment was linked to two SePay events';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    IF SQLERRM <> 'supplier_payment_already_linked' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_cash')::bigint,
      ARRAY[current_setting('test.supplier_link_payment_cash')::bigint]
    );
    RAISE EXCEPTION 'Cash supplier payment was linked to SePay';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'supplier_payment_not_bank_transfer' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_unsigned')::bigint,
      ARRAY[current_setting('test.supplier_link_payment_invalid_event')::bigint]
    );
    RAISE EXCEPTION 'Unsigned SePay event was linked to a supplier payment';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'webhook_event_signature_invalid' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_inbound')::bigint,
      ARRAY[current_setting('test.supplier_link_payment_invalid_event')::bigint]
    );
    RAISE EXCEPTION 'Money-in SePay event was linked to a supplier payment';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'webhook_event_not_out' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_inflight')::bigint,
      ARRAY[current_setting('test.supplier_link_payment_invalid_event')::bigint]
    );
    RAISE EXCEPTION 'In-flight SePay event was linked to a supplier payment';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'webhook_event_not_final_unclassified' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_order')::bigint,
      ARRAY[current_setting('test.supplier_link_payment_invalid_event')::bigint]
    );
    RAISE EXCEPTION 'Order-linked SePay event was linked to a supplier payment';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'webhook_event_matches_payment' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_payment')::bigint,
      ARRAY[current_setting('test.supplier_link_payment_invalid_event')::bigint]
    );
    RAISE EXCEPTION 'Payment-linked SePay event was linked to a supplier payment';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'webhook_event_matches_payment' THEN RAISE; END IF;
  END;

  PERFORM public.set_sepay_expense_allocations(
    current_setting('test.supplier_link_event_expense_first')::bigint,
    jsonb_build_array(jsonb_build_object(
      'expense_id', current_setting('test.supplier_link_expense_first')::bigint,
      'amount', 70000
    ))
  );

  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      current_setting('test.supplier_link_event_expense_first')::bigint,
      ARRAY[current_setting('test.supplier_link_payment_expense_first')::bigint]
    );
    RAISE EXCEPTION 'Expense-linked event was linked to a supplier payment';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'webhook_event_matches_expense' THEN RAISE; END IF;
  END;

  PERFORM public.set_sepay_supplier_payment_links(
    current_setting('test.supplier_link_event_supplier_first')::bigint,
    ARRAY[current_setting('test.supplier_link_payment_supplier_first')::bigint]
  );

  BEGIN
    PERFORM public.set_sepay_expense_allocations(
      current_setting('test.supplier_link_event_supplier_first')::bigint,
      jsonb_build_array(jsonb_build_object(
        'expense_id',
        current_setting('test.supplier_link_expense_supplier_first')::bigint,
        'amount',
        80000
      ))
    );
    RAISE EXCEPTION 'Supplier-linked event was allocated to an expense';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'webhook_event_matches_supplier_payment' THEN RAISE; END IF;
  END;

  v_result := public.set_sepay_supplier_payment_links(
    v_exact_event,
    ARRAY[]::bigint[]
  );
  IF (v_result->>'matched_count')::integer <> 0
    OR EXISTS (
      SELECT 1
      FROM public.supplier_payments payment
      WHERE payment.id = ANY(ARRAY[v_payment_a, v_payment_b])
        AND payment.sepay_webhook_event_id IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'Supplier-payment link clear failed: %', v_result;
  END IF;

  PERFORM public.set_sepay_supplier_payment_links(
    v_exact_event,
    ARRAY[]::bigint[]
  );
  PERFORM public.set_sepay_supplier_payment_links(
    v_exact_event,
    ARRAY[v_payment_a, v_payment_b]
  );

  BEGIN
    UPDATE public.supplier_payments
    SET reference_note = 'direct authenticated write'
    WHERE id = v_payment_a;
    RAISE EXCEPTION 'Direct authenticated supplier-payment DML was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_non_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_non_owner,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', current_setting('test.supplier_link_tenant')::bigint
      )
    )::text,
    true
  );
  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      v_exact_event,
      ARRAY[v_payment_a, v_payment_b]
    );
    RAISE EXCEPTION 'Non-Owner supplier-payment link caller was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'forbidden_owner_only' THEN RAISE; END IF;
  END;

  PERFORM set_config(
    'request.jwt.claim.sub',
    current_setting('test.supplier_link_owner'),
    true
  );
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', current_setting('test.supplier_link_owner'),
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', current_setting('test.supplier_link_tenant')::bigint + 1000000000
      )
    )::text,
    true
  );
  BEGIN
    PERFORM public.set_sepay_supplier_payment_links(
      v_exact_event,
      ARRAY[v_payment_a, v_payment_b]
    );
    RAISE EXCEPTION 'Cross-tenant SePay event access was accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    IF SQLERRM <> 'webhook_event_not_found' THEN RAISE; END IF;
  END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_constraint text;
  v_privilege text;
  v_exact_event bigint := current_setting('test.supplier_link_event_exact')::bigint;
  v_mismatch_event bigint :=
    current_setting('test.supplier_link_event_mismatch')::bigint;
  v_payment_a bigint := current_setting('test.supplier_link_payment_a')::bigint;
  v_payment_b bigint := current_setting('test.supplier_link_payment_b')::bigint;
  v_old_data jsonb;
  v_new_data jsonb;
BEGIN
  SELECT pg_get_constraintdef(constraint_row.oid)
  INTO v_constraint
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid = 'public.supplier_payments'::regclass
    AND constraint_row.conname = 'supplier_payments_sepay_event_tenant_fkey';

  IF v_constraint IS NULL
    OR v_constraint NOT LIKE
      'FOREIGN KEY (tenant_id, sepay_webhook_event_id) REFERENCES %webhook_events(tenant_id, id)%ON DELETE RESTRICT%'
  THEN
    RAISE EXCEPTION 'Tenant-safe supplier-payment SePay FK is missing: %', v_constraint;
  END IF;

  IF NOT has_table_privilege(
    'authenticated', 'public.supplier_payments', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Authenticated supplier-payment SELECT was removed';
  END IF;

  FOREACH v_privilege IN ARRAY ARRAY[
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ] LOOP
    IF has_table_privilege(
      'authenticated', 'public.supplier_payments', v_privilege
    ) OR has_table_privilege(
      'anon', 'public.supplier_payments', v_privilege
    ) THEN
      RAISE EXCEPTION 'Direct supplier-payment privilege remains: %', v_privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.supplier_payments', 'SELECT') THEN
    RAISE EXCEPTION 'Anon supplier-payment SELECT remains';
  END IF;

  FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'USAGE', 'UPDATE'] LOOP
    IF has_sequence_privilege(
      'authenticated', 'public.supplier_payments_id_seq', v_privilege
    ) OR has_sequence_privilege(
      'anon', 'public.supplier_payments_id_seq', v_privilege
    ) THEN
      RAISE EXCEPTION 'Direct supplier-payment sequence privilege remains: %',
        v_privilege;
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'authenticated',
    'public.create_supplier_payment(bigint,bigint,numeric,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Existing create_supplier_payment RPC is not executable';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.set_sepay_supplier_payment_links(bigint,bigint[])',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.set_sepay_supplier_payment_links(bigint,bigint[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supplier-payment link RPC allowlist is incomplete';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.set_sepay_supplier_payment_links(bigint,bigint[])',
    'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc function_row
    CROSS JOIN LATERAL aclexplode(
      COALESCE(
        function_row.proacl,
        acldefault('f', function_row.proowner)
      )
    ) acl
    WHERE function_row.oid =
      'public.set_sepay_supplier_payment_links(bigint,bigint[])'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supplier-payment link RPC remains executable by anon/PUBLIC';
  END IF;

  SELECT audit.old_data, audit.new_data
  INTO v_old_data, v_new_data
  FROM public.audit_logs audit
  WHERE audit.action = 'set_sepay_supplier_payment_links'
    AND audit.entity_type = 'webhook_event'
    AND audit.entity_id = v_exact_event
  ORDER BY audit.id DESC
  LIMIT 1;

  IF v_old_data IS NULL
    OR v_new_data IS NULL
    OR v_old_data->'supplier_payment_ids' <> '[]'::jsonb
    OR v_new_data->'supplier_payment_ids' <>
      to_jsonb(ARRAY[least(v_payment_a, v_payment_b), greatest(v_payment_a, v_payment_b)])
    OR (v_new_data->>'matched_amount')::numeric <> 100000
  THEN
    RAISE EXCEPTION 'Supplier-payment atomic audit payload is invalid: old=%, new=%',
      v_old_data, v_new_data;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_logs audit
    WHERE audit.action = 'set_sepay_supplier_payment_links'
      AND audit.entity_type = 'webhook_event'
      AND audit.entity_id = v_mismatch_event
  ) THEN
    RAISE EXCEPTION 'Rejected supplier-payment link wrote an audit row';
  END IF;

  BEGIN
    DELETE FROM public.webhook_events WHERE id = v_exact_event;
    RAISE EXCEPTION 'Linked SePay evidence deletion was accepted';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
