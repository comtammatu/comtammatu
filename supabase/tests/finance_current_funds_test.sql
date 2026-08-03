\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_non_owner uuid;
  v_tenant_id bigint;
  v_branch_id bigint;
  v_cutoff timestamptz := statement_timestamp() - interval '1 day';
  v_before timestamptz := statement_timestamp() - interval '2 days';
  v_after timestamptz := statement_timestamp() - interval '1 hour';
  v_opening_key uuid := gen_random_uuid();
  v_adjustment_key uuid := gen_random_uuid();
  v_opening jsonb;
  v_opening_replay jsonb;
  v_adjustment jsonb;
  v_adjustment_replay jsonb;
  v_summary jsonb;
  v_order_after bigint;
  v_order_before bigint;
  v_payment_after bigint;
  v_payment_before bigint;
  v_bank_deposit_transaction bigint;
  v_supplier bigint;
  v_supplier_invoice bigint;
  v_bank_supplier_invoice bigint;
  v_cash_supplier_payment bigint;
  v_bank_supplier_payment bigint;
  v_bank_supplier_transaction bigint;
  v_test_bank_transaction bigint;
  v_other_tenant_id bigint;
  v_rejected boolean;
  v_audit_count integer;
  v_legacy_setting_id bigint;
BEGIN
  SELECT profile.id, profile.tenant_id
  INTO v_owner, v_tenant_id
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND COALESCE(profile.is_active, true)
  ORDER BY profile.id
  LIMIT 1;

  SELECT profile.id
  INTO v_non_owner
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant_id
    AND position.code IN ('cashier', 'chef')
    AND COALESCE(profile.is_active, true)
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id
  INTO v_branch_id
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant_id
  ORDER BY branch.id
  LIMIT 1;

  IF v_owner IS NULL
    OR v_non_owner IS NULL
    OR v_tenant_id IS NULL
    OR v_branch_id IS NULL
  THEN
    RAISE EXCEPTION 'finance_current_funds_seed_missing';
  END IF;

  IF to_regprocedure(
    'public.set_finance_cash_opening(numeric,numeric,date)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'legacy_finance_opening_rpc_still_exists';
  END IF;

  IF has_table_privilege(
    'authenticated',
    'public.finance_fund_entries',
    'INSERT'
  ) OR has_table_privilege(
    'authenticated',
    'public.finance_fund_entries',
    'UPDATE'
  ) OR has_table_privilege(
    'authenticated',
    'public.finance_fund_entries',
    'DELETE'
  ) OR has_table_privilege(
    'service_role',
    'public.finance_fund_entries',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'finance_fund_entries_direct_dml_exposed';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.initialize_finance_funds(numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.initialize_finance_funds(numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'service_role',
    'public.initialize_finance_funds(numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.create_finance_fund_adjustment(numeric,numeric,text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.get_finance_current_funds()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'finance_fund_rpc_acl_invalid';
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
    created_at,
    payment_method,
    payment_status,
    cash_received,
    cash_change
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'FUND ' || floor(random() * 1000000000)::bigint::text,
    'takeaway',
    'completed',
    100,
    100,
    v_owner,
    v_after,
    'cash',
    'paid',
    100,
    0
  )
  RETURNING id INTO v_order_after;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    status,
    subtotal,
    total_amount,
    created_by,
    created_at,
    payment_method,
    payment_status,
    cash_received,
    cash_change
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'FUND ' || floor(random() * 1000000000)::bigint::text,
    'takeaway',
    'completed',
    999,
    999,
    v_owner,
    v_before,
    'cash',
    'paid',
    999,
    0
  )
  RETURNING id INTO v_order_before;

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    paid_at,
    created_by,
    created_at
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    v_order_after,
    'cash',
    100,
    'completed',
    v_after,
    v_owner,
    v_after
  )
  RETURNING id INTO v_payment_after;

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    paid_at,
    created_by,
    created_at
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    v_order_before,
    'cash',
    999,
    'completed',
    v_before,
    v_owner,
    v_before
  )
  RETURNING id INTO v_payment_before;

  INSERT INTO public.refunds (
    tenant_id,
    branch_id,
    payment_id,
    order_id,
    amount,
    reason,
    status,
    created_by,
    approved_by,
    created_at,
    approved_at,
    payout_method
  ) VALUES
    (
      v_tenant_id,
      v_branch_id,
      v_payment_after,
      v_order_after,
      10,
      'finance current funds after cutoff',
      'approved',
      v_owner,
      v_owner,
      v_after,
      v_after,
      'cash'
    ),
    (
      v_tenant_id,
      v_branch_id,
      v_payment_before,
      v_order_before,
      99,
      'finance current funds before cutoff',
      'approved',
      v_owner,
      v_owner,
      v_before,
      v_before,
      'cash'
    );

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
    created_by,
    created_at
  ) VALUES
    (
      v_tenant_id,
      v_branch_id,
      v_after::date,
      'utilities',
      20,
      20,
      jsonb_build_array(jsonb_build_object(
        'vat_rate', 0, 'taxable_amount', 20, 'vat_amount', 0
      )),
      0,
      'cash',
      v_after,
      v_owner,
      v_after
    ),
    (
      v_tenant_id,
      v_branch_id,
      v_before::date,
      'other',
      99,
      99,
      jsonb_build_array(jsonb_build_object(
        'vat_rate', 0, 'taxable_amount', 99, 'vat_amount', 0
      )),
      0,
      'cash',
      v_before,
      v_owner,
      v_before
    );

  INSERT INTO public.suppliers (tenant_id, name)
  VALUES (
    v_tenant_id,
    'Finance fund test ' || gen_random_uuid()::text
  )
  RETURNING id INTO v_supplier;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    invoice_date,
    subtotal,
    vat_rate,
    vat_breakdown,
    vat_amount,
    total_amount,
    matching_status,
    created_by,
    payment_status,
    paid_amount,
    paid_at
  ) VALUES (
    v_tenant_id,
    v_supplier,
    v_before,
    129,
    0,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0, 'taxable_amount', 129, 'vat_amount', 0
    )),
    0,
    129,
    'approved',
    v_owner,
    'paid',
    129,
    v_after
  )
  RETURNING id INTO v_supplier_invoice;

  INSERT INTO public.supplier_payments (
    tenant_id,
    supplier_id,
    supplier_invoice_id,
    payment_method,
    amount,
    payment_date,
    created_by,
    created_at
  ) VALUES
    (
      v_tenant_id,
      v_supplier,
      v_supplier_invoice,
      'cash',
      30,
      v_after,
      v_owner,
      v_after
    ),
    (
      v_tenant_id,
      v_supplier,
      v_supplier_invoice,
      'cash',
      99,
      v_before,
      v_owner,
      v_before
    );

  SELECT payment.id
  INTO v_cash_supplier_payment
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.supplier_invoice_id = v_supplier_invoice
    AND payment.payment_method = 'cash'
    AND payment.amount = 30
    AND payment.payment_date = v_after;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    invoice_date,
    subtotal,
    vat_rate,
    vat_breakdown,
    vat_amount,
    total_amount,
    matching_status,
    created_by,
    payment_status,
    paid_amount,
    paid_at
  ) VALUES (
    v_tenant_id,
    v_supplier,
    v_after,
    25,
    0,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0, 'taxable_amount', 25, 'vat_amount', 0
    )),
    0,
    25,
    'approved',
    v_owner,
    'paid',
    25,
    v_after
  )
  RETURNING id INTO v_bank_supplier_invoice;

  INSERT INTO public.supplier_payments (
    tenant_id,
    supplier_id,
    supplier_invoice_id,
    payment_method,
    amount,
    payment_date,
    created_by,
    created_at
  ) VALUES (
    v_tenant_id,
    v_supplier,
    v_bank_supplier_invoice,
    'bank_transfer',
    25,
    v_after,
    v_owner,
    v_after
  )
  RETURNING id INTO v_bank_supplier_payment;

  INSERT INTO public.pos_sessions (
    tenant_id,
    branch_id,
    opened_by,
    closed_by,
    opened_at,
    closed_at,
    opening_cash,
    closing_cash,
    expected_cash,
    cash_difference,
    status,
    variance_approval_note,
    variance_approver_user_id,
    variance_resolution_type,
    variance_settlement_amount,
    variance_resolved_at
  ) VALUES
    (
      v_tenant_id,
      v_branch_id,
      v_owner,
      v_owner,
      v_after - interval '2 hours',
      v_after,
      500,
      505,
      500,
      5,
      'closed',
      'accepted_adjustment test',
      v_owner,
      'accepted_adjustment',
      0,
      v_after
    ),
    (
      v_tenant_id,
      v_branch_id,
      v_owner,
      v_owner,
      v_after - interval '3 hours',
      v_after,
      600,
      591,
      600,
      -9,
      'closed',
      'staff_repaid test',
      v_owner,
      'staff_repaid',
      9,
      v_after
    ),
    (
      v_tenant_id,
      v_branch_id,
      v_owner,
      v_owner,
      v_before - interval '2 hours',
      v_before,
      700,
      799,
      700,
      99,
      'closed',
      'accepted before cutoff',
      v_owner,
      'accepted_adjustment',
      0,
      v_before
    ),
    (
      v_tenant_id,
      v_branch_id,
      v_owner,
      v_owner,
      v_after - interval '4 hours',
      v_after,
      5295000,
      0,
      5295000,
      -5295000,
      'closed',
      'accepted negative variance is report only',
      v_owner,
      'accepted_adjustment',
      0,
      v_after
    );

  INSERT INTO public.bank_transactions (
    tenant_id,
    provider_transaction_id,
    occurred_at,
    transfer_type,
    amount,
    ingest_source,
    raw_payload,
    created_at
  ) VALUES
    (
      v_tenant_id,
      'fund-in-' || gen_random_uuid()::text,
      v_after,
      'in',
      70,
      'sepay_export',
      '{}'::jsonb,
      v_after
    ),
    (
      v_tenant_id,
      'fund-out-' || gen_random_uuid()::text,
      v_after,
      'out',
      20,
      'sepay_export',
      '{}'::jsonb,
      v_after
    ),
    (
      v_tenant_id,
      'fund-at-cutoff-' || gen_random_uuid()::text,
      v_cutoff,
      'in',
      1,
      'sepay_export',
      '{}'::jsonb,
      v_cutoff
    ),
    (
      v_tenant_id,
      'fund-before-in-' || gen_random_uuid()::text,
      v_before,
      'in',
      99,
      'sepay_export',
      '{}'::jsonb,
      v_before
    ),
    (
      v_tenant_id,
      'fund-before-out-' || gen_random_uuid()::text,
      v_before,
      'out',
      99,
      'sepay_export',
      '{}'::jsonb,
      v_before
    );

  INSERT INTO public.bank_transactions (
    tenant_id,
    provider_transaction_id,
    occurred_at,
    transfer_type,
    amount,
    ingest_source,
    raw_payload,
    created_at
  ) VALUES (
    v_tenant_id,
    'fund-deposit-' || gen_random_uuid()::text,
    v_after,
    'in',
    40,
    'sepay_export',
    '{}'::jsonb,
    v_after
  )
  RETURNING id INTO v_bank_deposit_transaction;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  PERFORM public.record_bank_transaction_cash_deposit(
    v_bank_deposit_transaction
  );

  v_rejected := false;
  BEGIN
    PERFORM public.initialize_finance_funds(
      1000,
      2000,
      '-infinity'::timestamptz,
      'Non finite boundary must fail',
      gen_random_uuid()
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := SQLERRM LIKE '%finance_fund_opening_invalid%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_opening_non_finite_boundary_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    v_opening := public.initialize_finance_funds(
      1000,
      2000,
      NULL,
      'Verified server cutover boundary',
      v_opening_key
    );
    v_opening_replay := public.initialize_finance_funds(
      1000,
      2000,
      NULL,
      'Verified server cutover boundary',
      v_opening_key
    );

    IF (v_opening ->> 'id') <> (v_opening_replay ->> 'id')
      OR (v_opening ->> 'effective_at') <> (v_opening ->> 'created_at')
    THEN
      RAISE EXCEPTION 'finance_server_cutover_retry_invalid';
    END IF;

    RAISE EXCEPTION 'finance_server_cutover_test_rollback';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'finance_server_cutover_test_rollback' THEN
        v_rejected := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_server_cutover_test_not_executed';
  END IF;

  ALTER TABLE public.system_settings
    DISABLE TRIGGER system_settings_guard_legacy_finance_opening;
  INSERT INTO public.system_settings (tenant_id, key, value)
  VALUES (v_tenant_id, 'cash_opening_balance', 'legacy-evidence')
  RETURNING id INTO v_legacy_setting_id;
  ALTER TABLE public.system_settings
    ENABLE TRIGGER system_settings_guard_legacy_finance_opening;

  v_rejected := false;
  BEGIN
    PERFORM public.initialize_finance_funds(
      1000,
      2000,
      v_cutoff,
      'Legacy evidence requires controlled cutover',
      gen_random_uuid()
    );
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected :=
        SQLERRM LIKE '%finance_fund_legacy_cutover_required%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_legacy_cutover_gate_not_enforced';
  END IF;

  v_opening_key := gen_random_uuid();
  PERFORM set_config(
    'app.finance_legacy_cutover_idempotency_key',
    v_opening_key::text,
    true
  );
  v_opening := public.initialize_finance_funds(
    1000,
    2000,
    v_cutoff,
    'Verified controlled legacy cutover boundary',
    v_opening_key
  );
  PERFORM set_config(
    'app.finance_legacy_cutover_idempotency_key',
    '',
    true
  );
  v_opening_replay := public.initialize_finance_funds(
    1000,
    2000,
    v_cutoff,
    'Verified controlled legacy cutover boundary',
    v_opening_key
  );

  IF (v_opening ->> 'id') <> (v_opening_replay ->> 'id') THEN
    RAISE EXCEPTION 'finance_opening_retry_not_idempotent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.system_settings setting
    WHERE setting.id = v_legacy_setting_id
      AND setting.value = 'legacy-evidence'
  ) THEN
    RAISE EXCEPTION 'finance_legacy_evidence_not_preserved';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.initialize_finance_funds(
      1001,
      2000,
      v_cutoff,
      'Verified controlled legacy cutover boundary',
      v_opening_key
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_rejected :=
        SQLERRM LIKE '%finance_fund_idempotency_conflict%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_opening_payload_conflict_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.initialize_finance_funds(
      1000,
      2000,
      v_cutoff,
      'Second opening must fail',
      gen_random_uuid()
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_rejected :=
        SQLERRM LIKE '%finance_funds_already_initialized%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_second_opening_not_rejected';
  END IF;

  v_adjustment := public.create_finance_fund_adjustment(
    7,
    -4,
    'Audited correction from verified evidence',
    v_adjustment_key
  );
  v_adjustment_replay := public.create_finance_fund_adjustment(
    7,
    -4,
    'Audited correction from verified evidence',
    v_adjustment_key
  );

  IF (v_adjustment ->> 'id') <> (v_adjustment_replay ->> 'id') THEN
    RAISE EXCEPTION 'finance_adjustment_retry_not_idempotent';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.create_finance_fund_adjustment(
      8,
      -4,
      'Audited correction from verified evidence',
      v_adjustment_key
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_rejected :=
        SQLERRM LIKE '%finance_fund_idempotency_conflict%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_adjustment_payload_conflict_not_rejected';
  END IF;

  SELECT count(*)
  INTO v_audit_count
  FROM public.audit_logs audit
  WHERE audit.tenant_id = v_tenant_id
    AND audit.user_id = v_owner
    AND audit.action = 'finance_fund_adjustment_created'
    AND audit.entity_type = 'finance_fund_entry'
    AND audit.entity_id = (v_adjustment ->> 'id')::bigint
    AND audit.new_data ->> 'reason' =
      'Audited correction from verified evidence';

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'finance_adjustment_audit_count_invalid: %', v_audit_count;
  END IF;

  v_summary := public.get_finance_current_funds();

  IF NOT (v_summary ->> 'has_opening')::boolean
    OR (v_summary ->> 'opening_cash')::numeric <> 1000
    OR (v_summary ->> 'opening_bank')::numeric <> 2000
    OR (v_summary ->> 'cash_collections')::numeric <> 100
    OR (v_summary ->> 'cash_refunds')::numeric <> 10
    OR (v_summary ->> 'cash_expenses')::numeric <> 60
    OR (v_summary ->> 'cash_supplier_payments')::numeric <> 30
    OR (v_summary ->> 'cash_variance_adjustments')::numeric <> 0
    OR (v_summary ->> 'cash_adjustments')::numeric <> 7
    OR (v_summary ->> 'cash_current')::numeric <> 1007
    OR (v_summary ->> 'bank_in')::numeric <> 111
    OR (v_summary ->> 'bank_out')::numeric <> 20
    OR (v_summary ->> 'bank_adjustments')::numeric <> -4
    OR (v_summary ->> 'bank_current')::numeric <> 2087
  THEN
    RAISE EXCEPTION 'finance_current_funds_formula_invalid: %', v_summary;
  END IF;

  IF (v_summary ->> 'cash_current')::numeric
      + (v_summary ->> 'bank_current')::numeric <> 3094
  THEN
    RAISE EXCEPTION 'cash_to_bank_transfer_changed_total_funds';
  END IF;

  INSERT INTO public.bank_transactions (
    tenant_id,
    provider_transaction_id,
    occurred_at,
    transfer_type,
    amount,
    ingest_source,
    raw_payload,
    created_at
  ) VALUES (
    v_tenant_id,
    'fund-supplier-out-' || gen_random_uuid()::text,
    v_after,
    'out',
    25,
    'sepay_export',
    '{}'::jsonb,
    v_after
  )
  RETURNING id INTO v_bank_supplier_transaction;

  v_rejected := false;
  BEGIN
    PERFORM public.reconcile_bank_transaction_targets(
      v_bank_supplier_transaction,
      'supplier_payment',
      ARRAY[v_cash_supplier_payment]
    );
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      v_rejected :=
        SQLERRM LIKE '%bank_reconciliation_target_not_found%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'cash_supplier_payment_bank_match_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.bank_transactions (
      tenant_id,
      provider_transaction_id,
      occurred_at,
      transfer_type,
      amount,
      ingest_source,
      raw_payload,
      created_at
    ) VALUES (
      v_tenant_id,
      'fund-supplier-in-' || gen_random_uuid()::text,
      v_after,
      'in',
      25,
      'sepay_export',
      '{}'::jsonb,
      v_after
    )
    RETURNING id INTO v_test_bank_transaction;

    PERFORM public.reconcile_bank_transaction_targets(
      v_test_bank_transaction,
      'supplier_payment',
      ARRAY[v_bank_supplier_payment]
    );
  EXCEPTION
    WHEN check_violation THEN
      v_rejected :=
        SQLERRM LIKE '%bank_transaction_direction_mismatch%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'supplier_payment_wrong_direction_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.bank_transactions (
      tenant_id,
      provider_transaction_id,
      occurred_at,
      transfer_type,
      amount,
      ingest_source,
      raw_payload,
      created_at
    ) VALUES (
      v_tenant_id,
      'fund-supplier-mismatch-' || gen_random_uuid()::text,
      v_after,
      'out',
      24,
      'sepay_export',
      '{}'::jsonb,
      v_after
    )
    RETURNING id INTO v_test_bank_transaction;

    PERFORM public.reconcile_bank_transaction_targets(
      v_test_bank_transaction,
      'supplier_payment',
      ARRAY[v_bank_supplier_payment]
    );
  EXCEPTION
    WHEN check_violation THEN
      v_rejected :=
        SQLERRM LIKE '%bank_reconciliation_amount_mismatch%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'supplier_payment_amount_mismatch_not_rejected';
  END IF;

  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    'Finance fund other tenant',
    'finance-fund-other-' || gen_random_uuid()::text,
    v_owner
  )
  RETURNING id INTO v_other_tenant_id;

  v_rejected := false;
  BEGIN
    INSERT INTO public.bank_transactions (
      tenant_id,
      provider_transaction_id,
      occurred_at,
      transfer_type,
      amount,
      ingest_source,
      raw_payload,
      created_at
    ) VALUES (
      v_other_tenant_id,
      'fund-supplier-other-tenant-' || gen_random_uuid()::text,
      v_after,
      'out',
      25,
      'sepay_export',
      '{}'::jsonb,
      v_after
    )
    RETURNING id INTO v_test_bank_transaction;

    PERFORM public.reconcile_bank_transaction_targets(
      v_test_bank_transaction,
      'supplier_payment',
      ARRAY[v_bank_supplier_payment]
    );
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      v_rejected := SQLERRM LIKE '%bank_transaction_not_found%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'supplier_payment_cross_tenant_match_not_rejected';
  END IF;

  PERFORM public.reconcile_bank_transaction_targets(
    v_bank_supplier_transaction,
    'supplier_payment',
    ARRAY[v_bank_supplier_payment]
  );

  v_summary := public.get_finance_current_funds();
  IF (v_summary ->> 'cash_current')::numeric <> 1007
    OR (v_summary ->> 'bank_out')::numeric <> 45
    OR (v_summary ->> 'bank_current')::numeric <> 2062
  THEN
    RAISE EXCEPTION 'bank_supplier_payment_formula_invalid: %', v_summary;
  END IF;

  PERFORM public.reconcile_bank_transaction_targets(
    v_bank_supplier_transaction,
    'supplier_payment',
    ARRAY[]::bigint[]
  );

  v_summary := public.get_finance_current_funds();
  IF (v_summary ->> 'cash_current')::numeric <> 1007
    OR (v_summary ->> 'bank_out')::numeric <> 45
    OR (v_summary ->> 'bank_current')::numeric <> 2062
  THEN
    RAISE EXCEPTION 'supplier_payment_unmatch_changed_funds: %', v_summary;
  END IF;

  PERFORM public.reconcile_bank_transaction_targets(
    v_bank_supplier_transaction,
    'supplier_payment',
    ARRAY[v_bank_supplier_payment]
  );

  v_summary := public.get_finance_current_funds();
  IF (v_summary ->> 'cash_current')::numeric <> 1007
    OR (v_summary ->> 'bank_out')::numeric <> 45
    OR (v_summary ->> 'bank_current')::numeric <> 2062
  THEN
    RAISE EXCEPTION 'supplier_payment_rematch_changed_funds: %', v_summary;
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.bank_transactions (
      tenant_id,
      provider_transaction_id,
      occurred_at,
      transfer_type,
      amount,
      ingest_source,
      raw_payload,
      created_at
    ) VALUES (
      v_tenant_id,
      'fund-supplier-duplicate-' || gen_random_uuid()::text,
      v_after,
      'out',
      25,
      'sepay_export',
      '{}'::jsonb,
      v_after
    )
    RETURNING id INTO v_test_bank_transaction;

    PERFORM public.reconcile_bank_transaction_targets(
      v_test_bank_transaction,
      'supplier_payment',
      ARRAY[v_bank_supplier_payment]
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'supplier_payment_duplicate_match_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.finance_fund_entries
    SET reason = 'Mutation must fail'
    WHERE id = (v_opening ->> 'id')::bigint;
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected :=
        SQLERRM LIKE '%finance_fund_entries_append_only%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_opening_update_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    DELETE FROM public.finance_fund_entries
    WHERE id = (v_opening ->> 'id')::bigint;
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected :=
        SQLERRM LIKE '%finance_fund_entries_append_only%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_opening_delete_not_rejected';
  END IF;

  ALTER TABLE public.system_settings
    DISABLE TRIGGER system_settings_guard_legacy_finance_opening;
  INSERT INTO public.system_settings (
    tenant_id,
    key,
    value
  ) VALUES (
    v_tenant_id,
    'cash_opening_balance',
    'legacy-evidence'
  )
  ON CONFLICT (key, tenant_id) DO NOTHING;
  ALTER TABLE public.system_settings
    ENABLE TRIGGER system_settings_guard_legacy_finance_opening;

  SELECT id
  INTO v_legacy_setting_id
  FROM public.system_settings
  WHERE tenant_id = v_tenant_id
    AND key = 'cash_opening_balance';

  v_rejected := false;
  BEGIN
    UPDATE public.system_settings
    SET value = 'changed'
    WHERE id = v_legacy_setting_id;
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected := SQLERRM LIKE '%legacy_finance_setting_locked%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'legacy_finance_setting_update_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.system_settings
    SET key = 'renamed_away'
    WHERE id = v_legacy_setting_id;
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected := SQLERRM LIKE '%legacy_finance_setting_locked%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'legacy_finance_setting_rename_away_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    DELETE FROM public.system_settings
    WHERE id = v_legacy_setting_id;
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected := SQLERRM LIKE '%legacy_finance_setting_locked%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'legacy_finance_setting_delete_not_rejected';
  END IF;

  INSERT INTO public.system_settings (
    tenant_id,
    key,
    value
  ) VALUES (
    v_tenant_id,
    'finance_fund_test_unprotected_' || gen_random_uuid()::text,
    'test'
  )
  RETURNING id INTO v_legacy_setting_id;

  v_rejected := false;
  BEGIN
    UPDATE public.system_settings
    SET key = 'bank_opening_balance'
    WHERE id = v_legacy_setting_id;
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected := SQLERRM LIKE '%legacy_finance_setting_locked%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'legacy_finance_setting_rename_into_not_rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_non_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_non_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  v_rejected := false;
  BEGIN
    PERFORM public.get_finance_current_funds();
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := SQLERRM = 'forbidden';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_current_funds_non_owner_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.initialize_finance_funds(
      1,
      1,
      v_cutoff,
      'Non owner opening must fail',
      gen_random_uuid()
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := SQLERRM LIKE '%forbidden_owner_only%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_opening_non_owner_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.create_finance_fund_adjustment(
      1,
      0,
      'Non owner adjustment must fail',
      gen_random_uuid()
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := SQLERRM LIKE '%forbidden_owner_only%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_adjustment_non_owner_not_rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id',
        v_tenant_id + 999999
      )
    )::text,
    true
  );

  v_summary := public.get_finance_current_funds();
  IF (v_summary ->> 'opening_entry_id')::bigint <>
    (v_opening ->> 'id')::bigint
  THEN
    RAISE EXCEPTION 'finance_current_funds_tenant_claim_spoofed';
  END IF;

  PERFORM set_config('test.finance_fund_owner', v_owner::text, true);
  PERFORM set_config('test.finance_fund_non_owner', v_non_owner::text, true);
  PERFORM set_config('test.finance_fund_tenant', v_tenant_id::text, true);
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner uuid := current_setting('test.finance_fund_owner')::uuid;
  v_tenant_id bigint := current_setting('test.finance_fund_tenant')::bigint;
  v_rejected boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  BEGIN
    INSERT INTO public.finance_fund_entries (
      tenant_id,
      entry_type,
      cash_delta,
      bank_delta,
      effective_at,
      reason,
      created_by,
      idempotency_key
    ) VALUES (
      v_tenant_id,
      'adjustment',
      1,
      0,
      statement_timestamp(),
      'Direct DML must fail',
      v_owner,
      gen_random_uuid()
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_fund_direct_insert_not_rejected';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.system_settings (tenant_id, key, value)
    VALUES (v_tenant_id, 'cash_opening_date', '2026-01-01');
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected := SQLERRM LIKE '%legacy_finance_setting_locked%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'legacy_finance_setting_insert_not_rejected';
  END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_non_owner uuid := current_setting('test.finance_fund_non_owner')::uuid;
  v_tenant_id bigint := current_setting('test.finance_fund_tenant')::bigint;
  v_visible_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_non_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_non_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  SELECT count(*)
  INTO v_visible_count
  FROM public.finance_fund_entries;

  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION 'finance_fund_entries_visible_to_non_owner';
  END IF;
END;
$$;

ROLLBACK;
