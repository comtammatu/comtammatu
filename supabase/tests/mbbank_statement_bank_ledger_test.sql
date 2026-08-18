\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_non_owner uuid;
  v_tenant_id bigint;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_reference text := 'FTRESTORE' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_sepay_id text := 'sepay-restore-' || v_suffix;
  v_conflict_id text := 'sepay-conflict-' || v_suffix;
  v_statement_at timestamptz := TIMESTAMPTZ '2026-07-29 11:53:12+07';
  v_opening_key uuid := gen_random_uuid();
  v_restore_key uuid := gen_random_uuid();
  v_pre_key uuid := gen_random_uuid();
  v_restore jsonb;
  v_replay jsonb;
  v_pre_restore jsonb;
  v_funds jsonb;
  v_bank public.bank_transactions%ROWTYPE;
  v_bank_count integer;
  v_bank_in_before numeric;
  v_bank_in_after numeric;
  v_rejected boolean;
  v_rows jsonb;
  v_pre_rows jsonb;
  v_pre_reference text := 'FTPREOPEN' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_pre_opening_at timestamptz := TIMESTAMPTZ '2026-07-13 13:11:46+07';
  v_statement_start timestamptz := TIMESTAMPTZ '2026-07-13 00:00:00+07';
  v_parked_opening_at timestamptz := TIMESTAMPTZ '2026-07-28 00:50:28+07';
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

  IF v_owner IS NULL
    OR v_non_owner IS NULL
    OR v_tenant_id IS NULL
  THEN
    RAISE EXCEPTION 'mbbank_statement_restore_seed_missing';
  END IF;

  IF to_regprocedure(
    'public.restore_mbbank_statement_gap(jsonb,numeric,text,uuid,timestamptz)'
  ) IS NULL
    OR to_regprocedure(
      'public.repoint_finance_fund_opening(timestamptz,text)'
    ) IS NULL
    OR to_regprocedure(
      'private.upsert_canonical_bank_transaction(bigint,text,timestamptz,text,numeric,numeric,text,text,text,text,text,bigint,jsonb)'
    ) IS NULL
    OR NOT has_function_privilege(
    'authenticated',
    'public.restore_mbbank_statement_gap(jsonb,numeric,text,uuid,timestamptz)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.restore_mbbank_statement_gap(jsonb,numeric,text,uuid,timestamptz)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.repoint_finance_fund_opening(timestamptz,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.repoint_finance_fund_opening(timestamptz,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'private.upsert_canonical_bank_transaction(bigint,text,timestamptz,text,numeric,numeric,text,text,text,text,text,bigint,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'mbbank_statement_restore_rpc_acl_invalid';
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

  BEGIN
    PERFORM public.initialize_finance_funds(
      1000,
      0,
      NULL,
      'MB statement restore test opening',
      v_opening_key
    );
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT LIKE '%finance_funds_already_initialized%' THEN
        RAISE;
      END IF;
  END;

  v_rows := jsonb_build_array(
    jsonb_build_object(
      'provider_transaction_id', 'mbbank:' || v_reference,
      'occurred_at', v_statement_at,
      'transfer_type', 'in',
      'amount', 100000,
      'account_number', '888899555',
      'content', 'MB restore fixture',
      'reference_code', v_reference,
      'raw_payload', jsonb_build_object('source', 'mbbank_statement')
    )
  );

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
    PERFORM public.restore_mbbank_statement_gap(
      v_rows,
      17,
      'MB statement restore forbidden probe',
      gen_random_uuid()
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := SQLERRM LIKE '%forbidden_owner_only%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'mbbank_statement_restore_non_owner_not_blocked';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.repoint_finance_fund_opening(
      v_statement_start,
      'Non-owner opening repoint probe'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := SQLERRM LIKE '%forbidden_owner_only%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'mbbank_statement_repoint_non_owner_not_blocked';
  END IF;

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

  v_restore := public.restore_mbbank_statement_gap(
    v_rows,
    17,
    'MB statement restore opening correction',
    v_restore_key
  );
  v_replay := public.restore_mbbank_statement_gap(
    v_rows,
    17,
    'MB statement restore opening correction',
    v_restore_key
  );

  IF (v_restore ->> 'inserted_count')::integer <> 1
    OR (v_replay ->> 'inserted_count')::integer <> 0
    OR (v_replay ->> 'existing_count')::integer <> 1
    OR (v_restore ->> 'adjustment_id') IS DISTINCT FROM (v_replay ->> 'adjustment_id')
  THEN
    RAISE EXCEPTION 'mbbank_statement_restore_not_idempotent: % %', v_restore, v_replay;
  END IF;

  SELECT transaction.*
  INTO v_bank
  FROM public.bank_transactions transaction
  WHERE transaction.tenant_id = v_tenant_id
    AND transaction.reference_code = v_reference
    AND transaction.amount = 100000
    AND transaction.transfer_type = 'in';

  IF v_bank.id IS NULL
    OR v_bank.ingest_source <> 'mbbank_statement'
    OR v_bank.provider_transaction_id <> 'mbbank:' || v_reference
    OR v_bank.occurred_at <> v_statement_at
  THEN
    RAISE EXCEPTION 'mbbank_statement_row_not_inserted';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.finance_fund_entries
    SET effective_at = v_statement_start
    WHERE tenant_id = v_tenant_id
      AND entry_type = 'opening';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN
      v_rejected := SQLERRM LIKE '%finance_fund_entries_append_only%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'mbbank_statement_opening_update_not_blocked';
  END IF;

  PERFORM public.repoint_finance_fund_opening(
    v_parked_opening_at,
    'Park opening after statement start for restore test'
  );

  v_pre_rows := jsonb_build_array(
    jsonb_build_object(
      'provider_transaction_id', 'mbbank:' || v_pre_reference,
      'occurred_at', v_pre_opening_at,
      'transfer_type', 'in',
      'amount', 50000,
      'account_number', '888899555',
      'content', 'MB restore before parked opening',
      'reference_code', v_pre_reference,
      'raw_payload', jsonb_build_object('source', 'mbbank_statement')
    )
  );

  PERFORM public.restore_mbbank_statement_gap(
    v_pre_rows,
    0,
    'Insert statement row before parked opening',
    v_pre_key
  );

  v_funds := public.get_finance_current_funds();
  v_bank_in_before := COALESCE((v_funds ->> 'bank_in')::numeric, 0);
  IF (v_funds ->> 'opening_effective_at')::timestamptz <> v_parked_opening_at
    OR EXISTS (
      SELECT 1
      FROM public.finance_fund_entries entry
      WHERE entry.tenant_id = v_tenant_id
        AND entry.entry_type = 'adjustment'
        AND entry.idempotency_key = v_pre_key
    )
  THEN
    RAISE EXCEPTION 'mbbank_statement_zero_delta_changed_opening_or_posted_adj: %',
      v_funds;
  END IF;

  v_pre_restore := public.restore_mbbank_statement_gap(
    v_pre_rows,
    0,
    'Backdate opening to statement start for restore test',
    v_pre_key,
    v_statement_start
  );

  v_funds := public.get_finance_current_funds();
  v_bank_in_after := COALESCE((v_funds ->> 'bank_in')::numeric, 0);
  IF (v_pre_restore ->> 'inserted_count')::integer <> 0
    OR (v_pre_restore ->> 'existing_count')::integer <> 1
    OR (v_pre_restore ->> 'adjustment_id') IS NOT NULL
    OR (v_funds ->> 'opening_effective_at')::timestamptz <> v_statement_start
    OR v_bank_in_after <> v_bank_in_before + 50000
  THEN
    RAISE EXCEPTION 'mbbank_statement_repoint_did_not_include_pre_opening_row: % % % %',
      v_pre_restore,
      v_funds,
      v_bank_in_before,
      v_bank_in_after;
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
    'mbbank-attach-' || v_suffix,
    true,
    jsonb_build_object(
      'id', v_sepay_id,
      'transferType', 'in',
      'transferAmount', 100000,
      'transactionDate', '2026-07-29 11:53:00',
      'accountNumber', '888899555',
      'referenceCode', v_reference,
      'content', 'SePay attach'
    )
  );

  SELECT count(*)
  INTO v_bank_count
  FROM public.bank_transactions transaction
  WHERE transaction.tenant_id = v_tenant_id
    AND transaction.reference_code = v_reference
    AND transaction.amount = 100000
    AND transaction.transfer_type = 'in';

  SELECT transaction.*
  INTO v_bank
  FROM public.bank_transactions transaction
  WHERE transaction.tenant_id = v_tenant_id
    AND transaction.reference_code = v_reference
    AND transaction.amount = 100000
    AND transaction.transfer_type = 'in';

  IF v_bank_count <> 1
    OR v_bank.ingest_source <> 'sepay_webhook'
    OR v_bank.provider_transaction_id <> v_sepay_id
    OR v_bank.occurred_at <> v_statement_at
  THEN
    RAISE EXCEPTION 'mbbank_statement_webhook_did_not_attach: %', v_bank;
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.webhook_events (
      tenant_id,
      provider,
      request_id,
      signature_valid,
      payload
    ) VALUES (
      v_tenant_id,
      'sepay',
      'mbbank-conflict-' || v_suffix,
      true,
      jsonb_build_object(
        'id', v_conflict_id,
        'transferType', 'in',
        'transferAmount', 100000,
        'transactionDate', '2026-07-29 12:01:00',
        'accountNumber', '888899555',
        'referenceCode', v_reference,
        'content', 'SePay time conflict'
      )
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_rejected := SQLERRM LIKE '%bank_transaction_conflict%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'mbbank_statement_time_mismatch_not_conflicted';
  END IF;
END;
$$;

ROLLBACK;
