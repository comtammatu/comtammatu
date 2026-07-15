\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_tenant_id bigint;
  v_branch_id bigint;
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

  SELECT branch.id
  INTO v_branch_id
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant_id
  ORDER BY branch.id
  LIMIT 1;

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
  PERFORM set_config('test.transfer_intent_owner', v_owner::text, true);
  PERFORM set_config('test.transfer_intent_tenant', v_tenant_id::text, true);
  PERFORM set_config('test.transfer_intent_branch', v_branch_id::text, true);
  PERFORM set_config(
    'test.transfer_intent_expense_id',
    nextval('public.expenses_id_seq'::regclass)::text,
    true
  );
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner uuid := current_setting('test.transfer_intent_owner')::uuid;
  v_tenant_id bigint := current_setting('test.transfer_intent_tenant')::bigint;
  v_branch_id bigint := current_setting('test.transfer_intent_branch')::bigint;
  v_expense_id bigint :=
    current_setting('test.transfer_intent_expense_id')::bigint;
  v_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.expenses (
      id,
      tenant_id,
      branch_id,
      expense_date,
      category,
      amount,
      payment_method,
      paid_at,
      created_by,
      transfer_content
    ) OVERRIDING SYSTEM VALUE
    VALUES (
      v_expense_id,
      v_tenant_id,
      v_branch_id,
      current_date,
      'utilities',
      250000,
      'unpaid',
      NULL,
      v_owner,
      'MATU CHI ' || v_expense_id::text
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_direct_insert_accepted';
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_owner uuid;
  v_non_owner uuid;
  v_tenant_id bigint;
  v_branch_id bigint;
  v_other_tenant_id bigint;
  v_other_branch_id bigint;
  v_expense_id bigint;
  v_transfer_content text;
  v_original_content text;
  v_mismatch_event_id bigint;
  v_wrong_amount_event_id bigint;
  v_match_event_id bigint;
  v_duplicate_event_id bigint;
  v_multi_event_id bigint;
  v_existing_event_id bigint;
  v_generic_expense_id bigint;
  v_existing_expense_id bigint;
  v_result jsonb;
  v_rejected boolean;
  v_count integer;
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

  SELECT branch.id
  INTO v_branch_id
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant_id
  ORDER BY branch.id
  LIMIT 1;

  SELECT profile.id
  INTO v_non_owner
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant_id
    AND position.code <> 'owner'
    AND COALESCE(profile.is_active, true)
  ORDER BY profile.id
  LIMIT 1;

  IF v_owner IS NULL
    OR v_tenant_id IS NULL
    OR v_branch_id IS NULL
    OR v_non_owner IS NULL
  THEN
    RAISE EXCEPTION 'finance_transfer_intent_seed_missing';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_expense_transfer_intent(bigint,date,text,numeric,text,text)',
    'EXECUTE'
  )
    OR has_function_privilege(
      'service_role',
      'public.create_expense_transfer_intent(bigint,date,text,numeric,text,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.create_expense_transfer_intent(bigint,date,text,numeric,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.match_sepay_transfer_intent_event(bigint)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.match_sepay_transfer_intent_event(bigint)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.match_sepay_transfer_intent_event(bigint)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'finance_transfer_intent_acl_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy policy
    WHERE policy.polrelid = 'public.expenses'::regclass
      AND policy.polname = 'expenses_transfer_content_insert_via_rpc'
      AND policy.polpermissive IS FALSE
  ) THEN
    RAISE EXCEPTION 'finance_transfer_intent_rpc_only_policy_missing';
  END IF;

  INSERT INTO public.tenants (
    name,
    slug,
    owner_user_id
  ) VALUES (
    'Transfer Intent Cross Tenant',
    'transfer-intent-' || replace(gen_random_uuid()::text, '-', ''),
    v_owner
  )
  RETURNING id INTO v_other_tenant_id;

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    code
  ) VALUES (
    v_other_tenant_id,
    'Cross Tenant Branch',
    'branch',
    'ZZ'
  )
  RETURNING id INTO v_other_branch_id;

  PERFORM set_config('request.jwt.claim.sub', v_non_owner::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
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
    PERFORM *
    FROM public.create_expense_transfer_intent(
      v_branch_id,
      current_date,
      'utilities',
      250000,
      'Non-owner vendor',
      NULL
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_non_owner_accepted';
  END IF;

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

  v_rejected := false;
  BEGIN
    PERFORM *
    FROM public.create_expense_transfer_intent(
      v_other_branch_id,
      current_date,
      'utilities',
      250000,
      'Cross-tenant vendor',
      NULL
    );
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_cross_tenant_branch_accepted';
  END IF;

  SELECT result.expense_id, result.transfer_content
  INTO v_expense_id, v_transfer_content
  FROM public.create_expense_transfer_intent(
    v_branch_id,
    current_date,
    'utilities',
    250000,
    'EVN',
    'Monthly electricity'
  ) result;

  IF v_transfer_content !~ (
    '^[A-Z0-9]{2,16} [A-Z0-9]{2,16} '
    || v_expense_id::text
    || '$'
  ) THEN
    RAISE EXCEPTION 'finance_transfer_intent_content_invalid:%',
      v_transfer_content;
  END IF;

  SELECT expense.transfer_content
  INTO v_original_content
  FROM public.expenses expense
  WHERE expense.id = v_expense_id
    AND expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'unpaid'
    AND expense.paid_at IS NULL;

  IF v_original_content IS DISTINCT FROM v_transfer_content THEN
    RAISE EXCEPTION 'finance_transfer_intent_pending_state_invalid';
  END IF;

  INSERT INTO public.system_settings (tenant_id, key, value)
  VALUES
    (v_tenant_id, 'payment_content_prefix', 'ROTATED'),
    (v_tenant_id, 'payment_content_expense_token', 'NEWCHI')
  ON CONFLICT (key, tenant_id)
  DO UPDATE SET value = EXCLUDED.value;

  SELECT expense.transfer_content
  INTO v_original_content
  FROM public.expenses expense
  WHERE expense.id = v_expense_id;

  IF v_original_content IS DISTINCT FROM v_transfer_content THEN
    RAISE EXCEPTION 'finance_transfer_intent_changed_after_settings_rotation';
  END IF;

  v_rejected := false;
  BEGIN
    DELETE FROM public.expenses
    WHERE id = v_expense_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected OR NOT EXISTS (
    SELECT 1 FROM public.expenses WHERE id = v_expense_id
  ) THEN
    RAISE EXCEPTION 'finance_transfer_intent_pending_delete_not_blocked';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.expenses
    SET note = 'Mutated after issue'
    WHERE id = v_expense_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_pending_update_not_blocked';
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant_id,
    'sepay',
    'transfer-intent-mismatch-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'out',
      'transferAmount', 250000,
      'content', 'MATU CHI 999999999'
    ),
    'received'
  )
  RETURNING id INTO v_mismatch_event_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );

  v_rejected := false;
  BEGIN
    PERFORM public.match_sepay_transaction_expenses(
      v_mismatch_event_id,
      ARRAY[v_expense_id]
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_mismatched_content_accepted';
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant_id,
    'sepay',
    'transfer-intent-amount-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'out',
      'transferAmount', 250001,
      'content', v_transfer_content
    ),
    'received'
  )
  RETURNING id INTO v_wrong_amount_event_id;

  v_rejected := false;
  BEGIN
    PERFORM public.match_sepay_transaction_expenses(
      v_wrong_amount_event_id,
      ARRAY[v_expense_id]
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_wrong_amount_accepted';
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.bank_transaction_expense_matches match
  WHERE match.expense_id = v_expense_id;

  IF v_count <> 0 OR NOT EXISTS (
    SELECT 1
    FROM public.expenses expense
    WHERE expense.id = v_expense_id
      AND expense.payment_method = 'unpaid'
      AND expense.paid_at IS NULL
  ) THEN
    RAISE EXCEPTION 'finance_transfer_intent_failure_left_partial_evidence';
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant_id,
    'sepay',
    'transfer-intent-match-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'out',
      'transferAmount', 250000,
      'content', 'MB transaction ' || v_transfer_content || ' completed'
    ),
    'received'
  )
  RETURNING id INTO v_match_event_id;

  SET CONSTRAINTS ALL IMMEDIATE;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role', 'service_role'
    )::text,
    true
  );

  v_result := public.match_sepay_transfer_intent_event(
    v_match_event_id
  );

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

  IF (v_result->>'matched')::boolean IS NOT TRUE
    OR (v_result->>'matched_count')::integer <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.expenses expense
      JOIN public.bank_transaction_expense_matches match
        ON match.tenant_id = expense.tenant_id
       AND match.expense_id = expense.id
      JOIN public.webhook_events event
        ON event.tenant_id = match.tenant_id
       AND event.id = match.webhook_event_id
      WHERE expense.id = v_expense_id
        AND expense.payment_method = 'transfer'
        AND expense.paid_at IS NOT DISTINCT FROM event.created_at
        AND expense.transfer_content = v_transfer_content
        AND match.webhook_event_id = v_match_event_id
        AND event.expense_id = v_expense_id
        AND event.processing_status = 'processed'
    )
  THEN
    RAISE EXCEPTION 'finance_transfer_intent_match_state_invalid:%', v_result;
  END IF;

  v_result := public.match_sepay_transaction_expenses(
    v_match_event_id,
    ARRAY[v_expense_id]
  );
  IF (v_result->>'matched_count')::integer <> 1 THEN
    RAISE EXCEPTION 'finance_transfer_intent_same_event_not_idempotent:%',
      v_result;
  END IF;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant_id,
    'sepay',
    'transfer-intent-duplicate-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'out',
      'transferAmount', 250000,
      'description', v_transfer_content
    ),
    'received'
  )
  RETURNING id INTO v_duplicate_event_id;

  v_rejected := false;
  BEGIN
    PERFORM public.match_sepay_transaction_expenses(
      v_duplicate_event_id,
      ARRAY[v_expense_id]
    );
  EXCEPTION
    WHEN SQLSTATE '23505' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_second_event_accepted';
  END IF;

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

  v_rejected := false;
  BEGIN
    PERFORM public.match_sepay_transaction_expenses(
      v_match_event_id,
      ARRAY[]::bigint[]
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_detach_accepted';
  END IF;

  INSERT INTO public.expenses (
    tenant_id,
    branch_id,
    expense_date,
    category,
    amount,
    payment_method,
    paid_at,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    current_date,
    'repair',
    100000,
    'unpaid',
    NULL,
    v_owner
  )
  RETURNING id INTO v_generic_expense_id;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant_id,
    'sepay',
    'transfer-intent-multi-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'out',
      'transferAmount', 350000,
      'content', v_transfer_content
    ),
    'received'
  )
  RETURNING id INTO v_multi_event_id;

  v_rejected := false;
  BEGIN
    PERFORM public.match_sepay_transaction_expenses(
      v_multi_event_id,
      ARRAY[v_expense_id, v_generic_expense_id]
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_multi_expense_match_accepted';
  END IF;

  INSERT INTO public.expenses (
    tenant_id,
    branch_id,
    expense_date,
    category,
    amount,
    payment_method,
    paid_at,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    current_date,
    'repair',
    125000,
    'unpaid',
    NULL,
    v_owner
  )
  RETURNING id INTO v_existing_expense_id;

  INSERT INTO public.webhook_events (
    tenant_id,
    provider,
    request_id,
    signature_valid,
    payload,
    processing_status
  ) VALUES (
    v_tenant_id,
    'sepay',
    'transfer-intent-existing-' || gen_random_uuid()::text,
    true,
    jsonb_build_object(
      'transferType', 'out',
      'transferAmount', 125000,
      'content', 'Legacy manual reconciliation'
    ),
    'received'
  )
  RETURNING id INTO v_existing_event_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );
  PERFORM public.match_sepay_transaction_expenses(
    v_existing_event_id,
    ARRAY[v_existing_expense_id]
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.expenses expense
    JOIN public.bank_transaction_expense_matches match
      ON match.tenant_id = expense.tenant_id
     AND match.expense_id = expense.id
    WHERE expense.id = v_existing_expense_id
      AND expense.transfer_content IS NULL
      AND expense.payment_method = 'transfer'
      AND match.webhook_event_id = v_existing_event_id
  ) THEN
    RAISE EXCEPTION 'finance_transfer_intent_existing_match_regressed';
  END IF;

  v_rejected := false;
  BEGIN
    DELETE FROM public.expenses
    WHERE id = v_expense_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'finance_transfer_intent_matched_delete_not_blocked';
  END IF;
END;
$$;

SET CONSTRAINTS ALL IMMEDIATE;

SELECT 'finance_transfer_intent_test: ok' AS result;

ROLLBACK;
