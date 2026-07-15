-- Run against a non-production database with active migrations and dev seed.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_definition text := pg_get_functiondef(
    'public.confirm_cash_payment(bigint,numeric)'::regprocedure
  );
  v_advisory_position integer;
  v_order_lock_position integer;
BEGIN
  v_advisory_position := strpos(
    v_definition,
    'PERFORM pg_advisory_xact_lock(p_order_id);'
  );
  v_order_lock_position := strpos(v_definition, 'FOR UPDATE');

  IF v_advisory_position = 0
    OR v_order_lock_position = 0
    OR v_advisory_position > v_order_lock_position
  THEN
    RAISE EXCEPTION 'confirm_cash_payment_lock_order_regressed';
  END IF;

  IF strpos(
      v_definition,
      'v_print_warning := ''receipt_enqueue_failed'';'
    ) = 0
    OR strpos(v_definition, 'v_print_warning := SQLERRM;') > 0
    OR strpos(
      v_definition,
      'RAISE LOG ''[confirm_cash_payment] receipt enqueue skipped'
    ) = 0
  THEN
    RAISE EXCEPTION 'confirm_cash_payment_print_warning_contract_regressed';
  END IF;
END;
$$;

CREATE TEMP TABLE payment_guard_ctx (
  tenant_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  other_branch_id bigint NOT NULL,
  cashier_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  intent_order_id bigint,
  stale_order_id bigint,
  legacy_momo_order_id bigint,
  legacy_vietqr_order_id bigint,
  legacy_vietqr_payment_id bigint,
  protected_payment_id bigint,
  other_branch_payment_id bigint,
  completed_payment_id bigint,
  momo_pending_payment_id bigint,
  momo_pending_event_id bigint,
  momo_completed_payment_id bigint,
  momo_completed_event_id bigint,
  momo_mismatch_payment_id bigint,
  momo_mismatch_event_id bigint,
  momo_success_event_id bigint
);

INSERT INTO payment_guard_ctx (
  tenant_id,
  branch_id,
  other_branch_id,
  cashier_id,
  owner_id
)
SELECT
  tenant.id,
  main_branch.id,
  other_branch.id,
  'a0000004-0000-4000-8000-000000000004'::uuid,
  'a0000001-0000-4000-8000-000000000001'::uuid
FROM public.tenants tenant
JOIN public.branches main_branch
  ON main_branch.tenant_id = tenant.id
 AND main_branch.name = 'Chi nhánh Đất Đỏ'
JOIN public.branches other_branch
  ON other_branch.tenant_id = tenant.id
 AND other_branch.name = 'Chi nhánh Phước Hải'
WHERE tenant.slug = 'comtammatu';

DO $$
DECLARE
  v_ctx payment_guard_ctx%ROWTYPE;
  v_intent_order bigint;
  v_protected_order bigint;
  v_other_order bigint;
  v_completed_order bigint;
  v_momo_pending_order bigint;
  v_momo_completed_order bigint;
  v_momo_mismatch_order bigint;
  v_stale_order bigint;
  v_legacy_momo_order bigint;
  v_legacy_vietqr_order bigint;
  v_menu_category bigint;
  v_menu_item bigint;
BEGIN
  SELECT * INTO v_ctx FROM payment_guard_ctx;
  IF v_ctx.tenant_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = v_ctx.cashier_id
        AND profile.tenant_id = v_ctx.tenant_id
        AND profile.is_active = true
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = v_ctx.owner_id
        AND profile.tenant_id = v_ctx.tenant_id
        AND profile.is_active = true
    )
  THEN
    RAISE EXCEPTION 'payment guard seed context missing';
  END IF;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, subtotal, total_amount,
    created_by, status, payment_status, payment_code
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    'PGR-INTENT-' || replace(gen_random_uuid()::text, '-', ''),
    'takeaway',
    45000,
    45000,
    v_ctx.cashier_id,
    'new',
    'unpaid',
    'DHP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9))
  ) RETURNING id INTO v_intent_order;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, subtotal, total_amount,
    created_by, status, payment_status
  ) VALUES
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-PROTECTED-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.cashier_id, 'new', 'unpaid'
    ),
    (
      v_ctx.tenant_id, v_ctx.other_branch_id,
      'PGR-OTHER-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.owner_id, 'new', 'unpaid'
    ),
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-COMPLETED-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.cashier_id, 'completed', 'paid'
    ),
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-MOMO-PENDING-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.cashier_id, 'new', 'pending'
    ),
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-MOMO-COMPLETED-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.cashier_id, 'completed', 'paid'
    ),
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-MOMO-MISMATCH-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.cashier_id, 'new', 'pending'
    ),
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-STALE-TOTAL-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 46000, 46000, v_ctx.cashier_id, 'new', 'unpaid'
    ),
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-LEGACY-MOMO-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.cashier_id, 'new', 'unpaid'
    ),
    (
      v_ctx.tenant_id, v_ctx.branch_id,
      'PGR-LEGACY-VIETQR-' || replace(gen_random_uuid()::text, '-', ''),
      'takeaway', 45000, 45000, v_ctx.cashier_id, 'new', 'unpaid'
    );

  SELECT id INTO v_protected_order
  FROM public.orders WHERE order_number LIKE 'PGR-PROTECTED-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_other_order
  FROM public.orders WHERE order_number LIKE 'PGR-OTHER-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_completed_order
  FROM public.orders WHERE order_number LIKE 'PGR-COMPLETED-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_momo_pending_order
  FROM public.orders WHERE order_number LIKE 'PGR-MOMO-PENDING-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_momo_completed_order
  FROM public.orders WHERE order_number LIKE 'PGR-MOMO-COMPLETED-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_momo_mismatch_order
  FROM public.orders WHERE order_number LIKE 'PGR-MOMO-MISMATCH-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_stale_order
  FROM public.orders WHERE order_number LIKE 'PGR-STALE-TOTAL-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_legacy_momo_order
  FROM public.orders WHERE order_number LIKE 'PGR-LEGACY-MOMO-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_legacy_vietqr_order
  FROM public.orders WHERE order_number LIKE 'PGR-LEGACY-VIETQR-%'
  ORDER BY id DESC LIMIT 1;

  UPDATE public.orders
  SET payment_code =
    'DHP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9))
  WHERE id IN (v_protected_order, v_stale_order, v_legacy_vietqr_order);

  INSERT INTO public.menu_categories (tenant_id, name)
  VALUES (
    v_ctx.tenant_id,
    'PGR-' || replace(gen_random_uuid()::text, '-', '')
  ) RETURNING id INTO v_menu_category;
  INSERT INTO public.menu_items (
    tenant_id, category_id, name, base_price
  ) VALUES (
    v_ctx.tenant_id,
    v_menu_category,
    'PGR payment guard item',
    45000
  ) RETURNING id INTO v_menu_item;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name, quantity, unit_price,
    subtotal, vat_rate
  ) VALUES
    (
      v_ctx.tenant_id, v_intent_order, v_menu_item, 'PGR intent line',
      1, 45000, 45000, 0
    ),
    (
      v_ctx.tenant_id, v_protected_order, v_menu_item, 'PGR protected line',
      1, 45000, 45000, 0
    ),
    (
      v_ctx.tenant_id, v_stale_order, v_menu_item, 'PGR stale line',
      1, 45000, 45000, 0
    ),
    (
      v_ctx.tenant_id, v_legacy_momo_order, v_menu_item, 'PGR legacy MoMo line',
      1, 45000, 45000, 0
    ),
    (
      v_ctx.tenant_id, v_legacy_vietqr_order, v_menu_item, 'PGR legacy line',
      1, 45000, 45000, 0
    ),
    (
      v_ctx.tenant_id, v_momo_mismatch_order, v_menu_item,
      'PGR MoMo success line', 1, 45000, 45000, 0
    );

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    v_protected_order,
    'vietqr',
    45000,
    'pending',
    'PGR-SELF-ORDER',
    '{"source":"qr_self_order","invoicePayload":{"buyer":"kept"}}',
    NULL,
    v_ctx.cashier_id
  ) RETURNING id INTO v_ctx.protected_payment_id;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.other_branch_id,
    v_other_order,
    'vietqr',
    45000,
    'pending',
    'PGR-OTHER',
    '{}',
    NULL,
    v_ctx.cashier_id
  ) RETURNING id INTO v_ctx.other_branch_payment_id;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    v_legacy_vietqr_order,
    'vietqr',
    45000,
    'pending',
    'PGR-LEGACY-MISMATCH',
    '{"description":"PGR-LEGACY-MISMATCH"}',
    NULL,
    v_ctx.cashier_id
  ) RETURNING id INTO v_ctx.legacy_vietqr_payment_id;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    v_completed_order,
    'vietqr',
    45000,
    'completed',
    'PGR-REVIEW',
    '{"existing":"keep"}',
    now(),
    v_ctx.cashier_id
  ) RETURNING id INTO v_ctx.completed_payment_id;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    v_momo_pending_order,
    'momo',
    45000,
    'pending',
    'PGR-MOMO-PENDING',
    '{"existing":"keep"}',
    NULL,
    v_ctx.cashier_id
  ) RETURNING id INTO v_ctx.momo_pending_payment_id;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    v_momo_completed_order,
    'momo',
    45000,
    'completed',
    'PGR-MOMO-COMPLETED',
    '{"completedEvidence":"keep"}',
    now(),
    v_ctx.cashier_id
  ) RETURNING id INTO v_ctx.momo_completed_payment_id;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    v_momo_mismatch_order,
    'momo',
    45000,
    'pending',
    'PGR-MOMO-MISMATCH',
    '{"existing":"untouched"}',
    NULL,
    v_ctx.cashier_id
  ) RETURNING id INTO v_ctx.momo_mismatch_payment_id;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_ctx.tenant_id,
    'momo',
    'PGR-REQ-PENDING-' || replace(gen_random_uuid()::text, '-', ''),
    v_momo_pending_order,
    true,
    '{}'::jsonb,
    'received'
  ) RETURNING id
    INTO v_ctx.momo_pending_event_id;

  UPDATE public.webhook_events event
  SET payload = jsonb_build_object(
    'requestId', event.request_id,
    'orderId', 'PGR-MOMO-PENDING',
    'amount', 45000,
    'resultCode', 7002,
    'message', 'provider processing',
    'responseTime', 1784100000000
  )
  WHERE event.id = v_ctx.momo_pending_event_id;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_ctx.tenant_id,
    'momo',
    'PGR-REQ-COMPLETED-' || replace(gen_random_uuid()::text, '-', ''),
    v_momo_completed_order,
    true,
    '{}'::jsonb,
    'received'
  ) RETURNING id INTO v_ctx.momo_completed_event_id;

  UPDATE public.webhook_events event
  SET payload = jsonb_build_object(
    'requestId', event.request_id,
    'orderId', 'PGR-MOMO-COMPLETED',
    'amount', 45000,
    'resultCode', 1006
  )
  WHERE event.id = v_ctx.momo_completed_event_id;

  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES
    (
      v_ctx.tenant_id,
      'momo',
      'PGR-REQ-MISMATCH-' || replace(gen_random_uuid()::text, '-', ''),
      v_momo_mismatch_order,
      true,
      '{}'::jsonb,
      'received'
    ),
    (
      v_ctx.tenant_id,
      'momo',
      'PGR-REQ-SUCCESS-' || replace(gen_random_uuid()::text, '-', ''),
      v_momo_mismatch_order,
      true,
      '{}'::jsonb,
      'received'
    );

  SELECT id INTO v_ctx.momo_mismatch_event_id
  FROM public.webhook_events
  WHERE request_id LIKE 'PGR-REQ-MISMATCH-%'
  ORDER BY id DESC LIMIT 1;
  SELECT id INTO v_ctx.momo_success_event_id
  FROM public.webhook_events
  WHERE request_id LIKE 'PGR-REQ-SUCCESS-%'
  ORDER BY id DESC LIMIT 1;

  UPDATE public.webhook_events event
  SET payload = jsonb_build_object(
    'requestId', event.request_id,
    'orderId', 'PGR-MOMO-MISMATCH',
    'amount', CASE
      WHEN event.id = v_ctx.momo_mismatch_event_id THEN 44000
      ELSE 45000
    END,
    'resultCode', CASE
      WHEN event.id = v_ctx.momo_success_event_id THEN 9000
      ELSE 1006
    END
  )
  WHERE event.id IN (
    v_ctx.momo_mismatch_event_id,
    v_ctx.momo_success_event_id
  );

  UPDATE payment_guard_ctx
  SET intent_order_id = v_intent_order,
      stale_order_id = v_stale_order,
      legacy_momo_order_id = v_legacy_momo_order,
      legacy_vietqr_order_id = v_legacy_vietqr_order,
      legacy_vietqr_payment_id = v_ctx.legacy_vietqr_payment_id,
      protected_payment_id = v_ctx.protected_payment_id,
      other_branch_payment_id = v_ctx.other_branch_payment_id,
      completed_payment_id = v_ctx.completed_payment_id,
      momo_pending_payment_id = v_ctx.momo_pending_payment_id,
      momo_pending_event_id = v_ctx.momo_pending_event_id,
      momo_completed_payment_id = v_ctx.momo_completed_payment_id,
      momo_completed_event_id = v_ctx.momo_completed_event_id,
      momo_mismatch_payment_id = v_ctx.momo_mismatch_payment_id,
      momo_mismatch_event_id = v_ctx.momo_mismatch_event_id,
      momo_success_event_id = v_ctx.momo_success_event_id;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure(
    'public.create_payment(bigint,bigint,bigint,text,numeric,uuid,text,text)'
  ) IS NULL
  THEN
    RAISE EXCEPTION 'legacy create_payment signature was removed before rollout completed';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.create_payment(bigint,bigint,bigint,text,numeric,uuid,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.create_payment(bigint,bigint,bigint,text,numeric,uuid,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'service_role',
    'public.create_payment(bigint,bigint,bigint,text,numeric,uuid,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'legacy create_payment compatibility ACL mismatch';
  END IF;

  IF has_table_privilege('anon', 'public.payments', 'INSERT')
    OR has_table_privilege('anon', 'public.payments', 'UPDATE')
    OR has_table_privilege('anon', 'public.payments', 'DELETE')
    OR has_table_privilege('authenticated', 'public.payments', 'INSERT')
    OR NOT has_table_privilege('authenticated', 'public.payments', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.payments', 'DELETE')
  THEN
    RAISE EXCEPTION 'payment direct DML compatibility ACL mismatch';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'create_remote_payment_intent ACL mismatch';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.record_momo_pending_result(bigint,bigint,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.record_momo_pending_result(bigint,bigint,jsonb)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.record_momo_pending_result(bigint,bigint,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MoMo pending RPC ACL mismatch';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.review_completed_vietqr_bank_webhook(bigint,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'service_role',
    'public.review_completed_vietqr_bank_webhook(bigint,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Owner review RPC ACL mismatch';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.finalize_momo_failed_payment(bigint,bigint,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.finalize_momo_failed_payment(bigint,bigint,jsonb)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.finalize_momo_failed_payment(bigint,bigint,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MoMo failure RPC ACL mismatch';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.finalize_momo_successful_payment(bigint,bigint,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.finalize_momo_successful_payment(bigint,bigint,jsonb)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.finalize_momo_successful_payment(bigint,bigint,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MoMo success RPC ACL mismatch';
  END IF;
END;
$$;

SELECT set_config(
  'test.tenant_id',
  (SELECT tenant_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.branch_id',
  (SELECT branch_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.other_branch_id',
  (SELECT other_branch_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.other_order_id',
  (
    SELECT payment.order_id::text
    FROM public.payments payment
    JOIN payment_guard_ctx context
      ON context.other_branch_payment_id = payment.id
  ),
  true
);
SELECT set_config(
  'test.cashier_id',
  (SELECT cashier_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.owner_id',
  (SELECT owner_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.intent_order_id',
  (SELECT intent_order_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.intent_payment_code',
  (
    SELECT payment_code
    FROM public.orders
    WHERE id = current_setting('test.intent_order_id')::bigint
  ),
  true
);
SELECT set_config(
  'test.stale_order_id',
  (SELECT stale_order_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.legacy_momo_order_id',
  (SELECT legacy_momo_order_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.stale_payment_code',
  (
    SELECT payment_code
    FROM public.orders
    WHERE id = current_setting('test.stale_order_id')::bigint
  ),
  true
);
SELECT set_config(
  'test.legacy_vietqr_order_id',
  (SELECT legacy_vietqr_order_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.legacy_vietqr_payment_id',
  (SELECT legacy_vietqr_payment_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.legacy_vietqr_payment_code',
  (
    SELECT payment_code
    FROM public.orders
    WHERE id = current_setting('test.legacy_vietqr_order_id')::bigint
  ),
  true
);
SELECT set_config(
  'test.protected_payment_id',
  (SELECT protected_payment_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.other_branch_payment_id',
  (SELECT other_branch_payment_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.completed_payment_id',
  (SELECT completed_payment_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.momo_pending_payment_id',
  (SELECT momo_pending_payment_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.momo_pending_event_id',
  (SELECT momo_pending_event_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.momo_completed_payment_id',
  (SELECT momo_completed_payment_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.momo_completed_event_id',
  (SELECT momo_completed_event_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.momo_mismatch_payment_id',
  (SELECT momo_mismatch_payment_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.momo_mismatch_event_id',
  (SELECT momo_mismatch_event_id::text FROM payment_guard_ctx),
  true
);
SELECT set_config(
  'test.momo_success_event_id',
  (SELECT momo_success_event_id::text FROM payment_guard_ctx),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.cashier_id'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.cashier_id'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.tenant_id')::bigint,
      'branch_id', current_setting('test.branch_id')::bigint
    )
  )::text,
  true
);

DO $$
DECLARE
  v_payload jsonb;
  v_protected_order_id bigint;
  v_legacy_result jsonb;
  v_legacy_payment_id bigint;
  v_error_message text;
BEGIN
  BEGIN
    PERFORM public.create_remote_payment_intent(
      current_setting('test.tenant_id')::bigint,
      current_setting('test.branch_id')::bigint,
      current_setting('test.intent_order_id')::bigint,
      'vietqr',
      45000,
      current_setting('test.cashier_id')::uuid,
      current_setting('test.intent_payment_code'),
      jsonb_build_object(
        'providerRef', current_setting('test.intent_payment_code'),
        'qrData', 'authenticated-direct'
      )
    );
    RAISE EXCEPTION 'authenticated create_remote_payment_intent unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_payment(
      current_setting('test.tenant_id')::bigint,
      current_setting('test.branch_id')::bigint,
      current_setting('test.legacy_momo_order_id')::bigint,
      'momo',
      45000,
      current_setting('test.cashier_id')::uuid,
      'PGR-LEGACY-MOMO',
      'completed'
    );
    RAISE EXCEPTION 'legacy remote completion unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE order_id = current_setting('test.legacy_momo_order_id')::bigint
  ) OR EXISTS (
    SELECT 1
    FROM public.orders
    WHERE id = current_setting('test.legacy_momo_order_id')::bigint
      AND payment_status <> 'unpaid'
  ) THEN
    RAISE EXCEPTION 'legacy remote completion rejection mutated money state';
  END IF;

  BEGIN
    PERFORM public.create_payment(
      current_setting('test.tenant_id')::bigint,
      current_setting('test.branch_id')::bigint,
      current_setting('test.stale_order_id')::bigint,
      'momo',
      46000,
      current_setting('test.cashier_id')::uuid,
      'PGR-LEGACY-STALE-TOTAL',
      'pending'
    );
    RAISE EXCEPTION 'legacy stale-total payment unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    IF v_error_message NOT LIKE 'amount_mismatch_recomputed:%' THEN
      RAISE EXCEPTION 'unexpected legacy stale-total error: %', v_error_message;
    END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE order_id = current_setting('test.stale_order_id')::bigint
  ) THEN
    RAISE EXCEPTION 'legacy stale-total rejection created a payment';
  END IF;

  v_legacy_result := public.create_payment(
    current_setting('test.tenant_id')::bigint,
    current_setting('test.branch_id')::bigint,
    current_setting('test.legacy_momo_order_id')::bigint,
    'momo',
    45000,
    current_setting('test.cashier_id')::uuid,
    'PGR-LEGACY-MOMO',
    'pending'
  );
  v_legacy_payment_id := (v_legacy_result ->> 'payment_id')::bigint;

  UPDATE public.payments
  SET provider_ref = 'PGR-LEGACY-MOMO',
      provider_data = jsonb_build_object(
        'providerRef', 'PGR-LEGACY-MOMO',
        'momoOrderId', 'PGR-LEGACY-MOMO',
        'requestId', 'PGR-LEGACY-REQUEST',
        'qrCodeUrl', 'PGR-LEGACY-QR'
      )
  WHERE id = v_legacy_payment_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE id = v_legacy_payment_id
      AND status = 'pending'
      AND paid_at IS NULL
      AND provider_data ->> 'providerRef' = 'PGR-LEGACY-MOMO'
  ) THEN
    RAISE EXCEPTION 'legacy pending provider metadata compatibility failed';
  END IF;

  BEGIN
    PERFORM public.create_payment(
      current_setting('test.tenant_id')::bigint,
      current_setting('test.branch_id')::bigint,
      current_setting('test.legacy_momo_order_id')::bigint,
      'momo',
      45000,
      current_setting('test.cashier_id')::uuid,
      'PGR-LEGACY-MOMO-ROTATED',
      'pending'
    );
    RAISE EXCEPTION 'legacy provider-ref rotation unexpectedly succeeded';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'legacy provider-ref conflict leaked a 23505 retry signal';
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
      IF v_error_message IS DISTINCT FROM 'payment_pending_conflict' THEN
        RAISE EXCEPTION 'unexpected legacy provider-ref error: %', v_error_message;
      END IF;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE id = v_legacy_payment_id
      AND provider_ref = 'PGR-LEGACY-MOMO'
      AND provider_data ->> 'providerRef' = 'PGR-LEGACY-MOMO'
      AND provider_data ->> 'qrCodeUrl' = 'PGR-LEGACY-QR'
  ) THEN
    RAISE EXCEPTION 'legacy provider-ref conflict replaced canonical evidence';
  END IF;

  BEGIN
    UPDATE public.payments
    SET status = 'completed',
        paid_at = now(),
        provider_data = '{"forged":true}'::jsonb
    WHERE id = v_legacy_payment_id;
    RAISE EXCEPTION 'direct pending payment completion unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.payments
    SET provider_data = '{"forged":true}'::jsonb
    WHERE id = current_setting('test.completed_payment_id')::bigint;
    RAISE EXCEPTION 'completed provider evidence overwrite unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.payments
    SET provider_data = provider_data || jsonb_build_object(
      'bankWebhookReview',
      jsonb_build_object(
        'status', 'reviewing',
        'reviewedAt', now()::text,
        'reviewedBy', current_setting('test.cashier_id')
      )
    )
    WHERE id = current_setting('test.completed_payment_id')::bigint;
    RAISE EXCEPTION 'cashier direct bank review unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE id = current_setting('test.completed_payment_id')::bigint
      AND provider_data = '{"existing":"keep"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'completed provider evidence changed after rejected overwrite';
  END IF;

  SELECT payload INTO v_payload
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_pending_event_id')::bigint;

  BEGIN
    PERFORM public.record_momo_pending_result(
      current_setting('test.momo_pending_event_id')::bigint,
      current_setting('test.momo_pending_payment_id')::bigint,
      v_payload
    );
    RAISE EXCEPTION 'authenticated MoMo pending write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.finalize_momo_successful_payment(
      current_setting('test.momo_success_event_id')::bigint,
      current_setting('test.momo_mismatch_payment_id')::bigint,
      (
        SELECT payload
        FROM public.webhook_events
        WHERE id = current_setting('test.momo_success_event_id')::bigint
      )
    );
    RAISE EXCEPTION 'authenticated MoMo success write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      current_setting('test.momo_pending_event_id')::bigint,
      current_setting('test.momo_pending_payment_id')::bigint,
      v_payload
    );
    RAISE EXCEPTION 'authenticated MoMo failure write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.cancel_pending_payment(
      current_setting('test.momo_pending_payment_id')::bigint,
      current_setting('test.tenant_id')::bigint,
      current_setting('test.branch_id')::bigint
    );
    RAISE EXCEPTION 'unconfirmed MoMo cancellation unexpectedly succeeded';
  EXCEPTION WHEN lock_not_available THEN
    NULL;
  END;

  BEGIN
    PERFORM public.confirm_cash_payment_with_invoice_binding(
      (
        SELECT order_id
        FROM public.payments
        WHERE id = current_setting('test.momo_pending_payment_id')::bigint
      ),
      45000
    );
    RAISE EXCEPTION 'cash replaced a pending MoMo payment';
  EXCEPTION WHEN lock_not_available THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    IF v_error_message IS DISTINCT FROM
      'pending_momo_payment_requires_provider_resolution'
    THEN
      RAISE EXCEPTION 'unexpected pending MoMo cash error: %', v_error_message;
    END IF;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payments payment
    JOIN public.orders order_row ON order_row.id = payment.order_id
    WHERE payment.id = current_setting('test.momo_pending_payment_id')::bigint
      AND payment.method = 'momo'
      AND payment.status = 'pending'
      AND payment.provider_ref = 'PGR-MOMO-PENDING'
      AND payment.provider_data = '{"existing":"keep"}'::jsonb
      AND order_row.payment_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'cash rejection mutated pending MoMo evidence';
  END IF;

  SELECT order_id INTO v_protected_order_id
  FROM public.payments
  WHERE id = current_setting('test.protected_payment_id')::bigint;

  BEGIN
    PERFORM public.cancel_pending_payment(
      current_setting('test.protected_payment_id')::bigint,
      current_setting('test.tenant_id')::bigint,
      current_setting('test.branch_id')::bigint
    );
    RAISE EXCEPTION 'self-order payment cancellation unexpectedly succeeded';
  EXCEPTION WHEN lock_not_available THEN
    NULL;
  END;

  BEGIN
    PERFORM public.review_completed_vietqr_bank_webhook(
      current_setting('test.completed_payment_id')::bigint,
      'resolved'
    );
    RAISE EXCEPTION 'cashier Owner-review call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

DELETE FROM public.payments
WHERE order_id = current_setting('test.legacy_momo_order_id')::bigint;
UPDATE public.orders
SET payment_method = NULL,
    updated_at = now()
WHERE id = current_setting('test.legacy_momo_order_id')::bigint;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  v_result jsonb;
  v_payment_id bigint;
  v_momo_payment_id bigint;
  v_momo_order_id bigint;
  v_menu_item_id bigint;
  v_tenant_id bigint := current_setting('test.tenant_id')::bigint;
  v_branch_id bigint := current_setting('test.branch_id')::bigint;
  v_cashier_id uuid := current_setting('test.cashier_id')::uuid;
  v_provider_ref text := current_setting('test.intent_payment_code');
  v_momo_ref text := 'PGR-MOMO-ATOMIC-' || replace(gen_random_uuid()::text, '-', '');
  v_momo_request_id text := 'PGR-MOMO-REQUEST-' || replace(gen_random_uuid()::text, '-', '');
  v_momo_data jsonb;
  v_stored_data jsonb;
  v_error_message text;
  v_protected_order_id bigint;
BEGIN
  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      current_setting('test.intent_order_id')::bigint,
      'vietqr',
      45000,
      v_cashier_id,
      '   ',
      '{"providerRef":"   ","qrData":"blank"}'::jsonb
    );
    RAISE EXCEPTION 'blank provider ref unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      current_setting('test.stale_order_id')::bigint,
      'vietqr',
      46000,
      v_cashier_id,
      current_setting('test.stale_payment_code'),
      jsonb_build_object(
        'providerRef', current_setting('test.stale_payment_code'),
        'qrData', 'stale'
      )
    );
    RAISE EXCEPTION 'stale-total payment unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    IF v_error_message NOT LIKE 'amount_mismatch_recomputed:%' THEN
      RAISE EXCEPTION 'unexpected stale-total error: %', v_error_message;
    END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE order_id = current_setting('test.stale_order_id')::bigint
  ) THEN
    RAISE EXCEPTION 'stale-total rejection created a payment';
  END IF;

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id + 999,
      v_branch_id,
      current_setting('test.intent_order_id')::bigint,
      'vietqr',
      45000,
      v_cashier_id,
      v_provider_ref,
      jsonb_build_object('providerRef', v_provider_ref, 'qrData', 'wrong-tenant')
    );
    RAISE EXCEPTION 'tenant spoof unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      current_setting('test.other_branch_id')::bigint,
      (
        SELECT order_id
        FROM public.payments
        WHERE id = current_setting('test.other_branch_payment_id')::bigint
      ),
      'vietqr',
      45000,
      v_cashier_id,
      'PGR-CROSS-BRANCH',
      '{"providerRef":"PGR-CROSS-BRANCH","qrData":"cross-branch"}'::jsonb
    );
    RAISE EXCEPTION 'cross-branch create unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;

  SELECT order_id INTO v_protected_order_id
  FROM public.payments
  WHERE id = current_setting('test.protected_payment_id')::bigint;

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      v_protected_order_id,
      'vietqr',
      45000,
      v_cashier_id,
      (
        SELECT payment_code
        FROM public.orders
        WHERE id = v_protected_order_id
      ),
      jsonb_build_object(
        'providerRef',
        (SELECT payment_code FROM public.orders WHERE id = v_protected_order_id),
        'qrData',
        'self-order'
      )
    );
    RAISE EXCEPTION 'self-order create unexpectedly succeeded';
  EXCEPTION WHEN lock_not_available THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      current_setting('test.intent_order_id')::bigint,
      'vietqr',
      45000,
      v_cashier_id,
      'PGR-ARBITRARY-CONTENT',
      '{"providerRef":"PGR-ARBITRARY-CONTENT","qrData":"arbitrary"}'::jsonb
    );
    RAISE EXCEPTION 'arbitrary VietQR content unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      current_setting('test.intent_order_id')::bigint,
      'vietqr',
      45000,
      v_cashier_id,
      v_provider_ref,
      jsonb_build_object(
        'providerRef', v_provider_ref,
        'qrData', 'reserved',
        'bankWebhookReview', jsonb_build_object('status', 'resolved')
      )
    );
    RAISE EXCEPTION 'reserved provider key unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  v_result := public.create_remote_payment_intent(
    v_tenant_id,
    v_branch_id,
    current_setting('test.intent_order_id')::bigint,
    'vietqr',
    45000,
    v_cashier_id,
    v_provider_ref,
    jsonb_build_object('providerRef', v_provider_ref, 'qrData', 'qr-ok')
  );
  v_payment_id := (v_result ->> 'payment_id')::bigint;
  PERFORM set_config('test.intent_payment_id', v_payment_id::text, true);

  IF v_result ->> 'status' IS DISTINCT FROM 'pending'
    OR COALESCE((v_result ->> 'idempotent')::boolean, true)
  THEN
    RAISE EXCEPTION 'remote intent result invalid: %', v_result;
  END IF;

  v_result := public.create_remote_payment_intent(
    v_tenant_id,
    v_branch_id,
    current_setting('test.intent_order_id')::bigint,
    'vietqr',
    45000,
    v_cashier_id,
    lower(v_provider_ref),
    jsonb_build_object(
      'providerRef', lower(v_provider_ref),
      'qrData', 'losing-vietqr-session'
    )
  );
  IF COALESCE((v_result ->> 'idempotent')::boolean, false) IS NOT TRUE
    OR v_result ->> 'provider_ref' IS DISTINCT FROM v_provider_ref
  THEN
    RAISE EXCEPTION 'pending replay rotated canonical provider ref: %', v_result;
  END IF;

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      current_setting('test.intent_order_id')::bigint,
      'cash',
      45000,
      v_cashier_id,
      v_provider_ref,
      jsonb_build_object('providerRef', v_provider_ref)
    );
    RAISE EXCEPTION 'cash create_remote_payment_intent attack unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  SELECT order_item.menu_item_id INTO v_menu_item_id
  FROM public.order_items order_item
  WHERE order_item.order_id = current_setting('test.intent_order_id')::bigint
  LIMIT 1;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, subtotal, total_amount,
    created_by, status, payment_status
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'PGR-MOMO-ATOMIC-ORDER-' || replace(gen_random_uuid()::text, '-', ''),
    'takeaway',
    45000,
    45000,
    v_cashier_id,
    'new',
    'unpaid'
  ) RETURNING id INTO v_momo_order_id;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name, quantity, unit_price,
    subtotal, vat_rate
  ) VALUES (
    v_tenant_id,
    v_momo_order_id,
    v_menu_item_id,
    'PGR atomic MoMo line',
    1,
    45000,
    45000,
    0
  );

  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      v_momo_order_id,
      'momo',
      45000,
      v_cashier_id,
      v_momo_ref,
      jsonb_build_object('providerRef', v_momo_ref)
    );
    RAISE EXCEPTION 'incomplete MoMo metadata unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.payments WHERE order_id = v_momo_order_id
  ) THEN
    RAISE EXCEPTION 'incomplete MoMo metadata left an orphan payment';
  END IF;

  v_momo_data := jsonb_build_object(
    'providerRef', v_momo_ref,
    'momoOrderId', v_momo_ref,
    'requestId', v_momo_request_id,
    'qrCodeUrl', 'QR-ATOMIC',
    'qrData', 'QR-ATOMIC'
  );
  v_result := public.create_remote_payment_intent(
    v_tenant_id,
    v_branch_id,
    v_momo_order_id,
    'momo',
    45000,
    v_cashier_id,
    v_momo_ref,
    v_momo_data
  );
  v_momo_payment_id := (v_result ->> 'payment_id')::bigint;

  v_result := public.create_remote_payment_intent(
    v_tenant_id,
    v_branch_id,
    v_momo_order_id,
    'momo',
    45000,
    v_cashier_id,
    v_momo_ref || '-LOSER',
    jsonb_build_object(
      'providerRef', v_momo_ref || '-LOSER',
      'momoOrderId', v_momo_ref || '-LOSER',
      'requestId', v_momo_request_id || '-LOSER',
      'qrCodeUrl', 'QR-LOSER',
      'qrData', 'QR-LOSER'
    )
  );

  SELECT provider_data INTO v_stored_data
  FROM public.payments
  WHERE id = v_momo_payment_id;

  IF COALESCE((v_result ->> 'idempotent')::boolean, false) IS NOT TRUE
    OR (v_result ->> 'payment_id')::bigint IS DISTINCT FROM v_momo_payment_id
    OR v_result ->> 'provider_ref' IS DISTINCT FROM v_momo_ref
    OR v_stored_data IS DISTINCT FROM v_momo_data
  THEN
    RAISE EXCEPTION 'MoMo idempotent replay replaced canonical evidence';
  END IF;

  UPDATE public.profiles
  SET is_active = false
  WHERE id = v_cashier_id;
  BEGIN
    PERFORM public.create_remote_payment_intent(
      v_tenant_id,
      v_branch_id,
      v_momo_order_id,
      'momo',
      45000,
      v_cashier_id,
      v_momo_ref,
      v_momo_data
    );
    RAISE EXCEPTION 'inactive actor unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  UPDATE public.profiles
  SET is_active = true
  WHERE id = v_cashier_id;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_payment public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = current_setting('test.intent_payment_id')::bigint;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending intent payment missing';
  END IF;

  IF v_payment.status IS DISTINCT FROM 'pending'
    OR v_payment.provider_ref
      IS DISTINCT FROM current_setting('test.intent_payment_code')
    OR v_payment.provider_data ->> 'qrData' IS DISTINCT FROM 'qr-ok'
    OR v_payment.provider_data ? 'bankWebhookReview'
  THEN
    RAISE EXCEPTION 'pending provider metadata contract failed: %', row_to_json(v_payment);
  END IF;

  IF (SELECT payment_status FROM public.orders WHERE id = v_payment.order_id)
    IS DISTINCT FROM 'unpaid'
  THEN
    RAISE EXCEPTION 'remote intent marked order paid';
  END IF;

  IF (SELECT provider_data FROM public.payments
      WHERE id = current_setting('test.protected_payment_id')::bigint)
      -> 'invoicePayload' IS NULL
    OR (SELECT status FROM public.payments
        WHERE id = current_setting('test.protected_payment_id')::bigint)
      IS DISTINCT FROM 'pending'
  THEN
    RAISE EXCEPTION 'self-order evidence was lost';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.owner_id'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.owner_id'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.tenant_id')::bigint,
      'branch_id', current_setting('test.branch_id')::bigint
    )
  )::text,
  true
);

UPDATE public.payments
SET provider_data = provider_data || jsonb_build_object(
  'bankWebhookReview',
  jsonb_build_object(
    'status', 'reviewing',
    'reviewedAt', now()::text,
    'reviewedBy', current_setting('test.owner_id')
  )
)
WHERE id = current_setting('test.completed_payment_id')::bigint;

DO $$
DECLARE
  v_provider_data jsonb;
BEGIN
  SELECT provider_data INTO v_provider_data
  FROM public.payments
  WHERE id = current_setting('test.completed_payment_id')::bigint;

  IF v_provider_data ->> 'existing' IS DISTINCT FROM 'keep'
    OR v_provider_data #>> '{bankWebhookReview,status}'
      IS DISTINCT FROM 'reviewing'
    OR v_provider_data #>> '{bankWebhookReview,reviewedBy}'
      IS DISTINCT FROM current_setting('test.owner_id')
  THEN
    RAISE EXCEPTION 'legacy Owner review compatibility failed: %', v_provider_data;
  END IF;
END;
$$;

SELECT public.review_completed_vietqr_bank_webhook(
  current_setting('test.completed_payment_id')::bigint,
  'resolved'
);
RESET ROLE;

DO $$
DECLARE
  v_provider_data jsonb;
  v_audit_count integer;
BEGIN
  SELECT provider_data INTO v_provider_data
  FROM public.payments
  WHERE id = current_setting('test.completed_payment_id')::bigint;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner review payment missing';
  END IF;

  IF v_provider_data ->> 'existing' IS DISTINCT FROM 'keep'
    OR v_provider_data #>> '{bankWebhookReview,status}' IS DISTINCT FROM 'resolved'
    OR v_provider_data #>> '{bankWebhookReview,reviewedBy}'
      IS DISTINCT FROM current_setting('test.owner_id')
  THEN
    RAISE EXCEPTION 'Owner review evidence merge failed: %', v_provider_data;
  END IF;

  SELECT count(*) INTO v_audit_count
  FROM public.audit_logs
  WHERE entity_type = 'payment'
    AND entity_id = current_setting('test.completed_payment_id')::bigint
    AND action = 'update_bank_webhook_review'
    AND user_id = current_setting('test.owner_id')::uuid;

  IF v_audit_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Owner review audit count invalid: %', v_audit_count;
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  v_result jsonb;
  v_pending_payload jsonb;
  v_failure_payload jsonb;
  v_success_payload jsonb;
  v_replay_payload jsonb;
  v_original_payload jsonb;
  v_payment public.payments%ROWTYPE;
  v_event public.webhook_events%ROWTYPE;
  v_event_id bigint;
  v_request_id text;
  v_refunded_order_id bigint;
  v_refunded_payment_id bigint;
  v_bound_payment_id bigint;
BEGIN
  SELECT payload INTO v_pending_payload
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_pending_event_id')::bigint;

  v_result := public.record_momo_pending_result(
    current_setting('test.momo_pending_event_id')::bigint,
    current_setting('test.momo_pending_payment_id')::bigint,
    v_pending_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'MoMo pending outcome invalid: %', v_result;
  END IF;

  SELECT * INTO v_event
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_pending_event_id')::bigint;
  IF v_event.processing_status IS DISTINCT FROM 'received'
    OR v_event.http_status IS DISTINCT FROM 204
    OR v_event.error_code IS DISTINCT FROM 'provider_pending'
    OR v_event.payment_id IS DISTINCT FROM
      current_setting('test.momo_pending_payment_id')::bigint
    OR v_event.payload IS DISTINCT FROM v_pending_payload
  THEN
    RAISE EXCEPTION 'MoMo pending event evidence invalid';
  END IF;

  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      current_setting('test.momo_pending_event_id')::bigint,
      current_setting('test.momo_pending_payment_id')::bigint,
      v_pending_payload
    );
    RAISE EXCEPTION 'pending result entered failure transition';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  v_failure_payload := jsonb_set(
    jsonb_set(v_pending_payload, '{resultCode}', '1006'::jsonb),
    '{message}',
    '"provider rejected"'::jsonb
  );
  v_result := public.finalize_momo_failed_payment(
    current_setting('test.momo_pending_event_id')::bigint,
    current_setting('test.momo_pending_payment_id')::bigint,
    v_failure_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'MoMo failure outcome invalid: %', v_result;
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = current_setting('test.momo_pending_payment_id')::bigint;
  SELECT * INTO v_event
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_pending_event_id')::bigint;
  IF v_payment.status IS DISTINCT FROM 'failed'
    OR v_payment.provider_data ->> 'existing' IS DISTINCT FROM 'keep'
    OR v_payment.provider_data #>> '{momoFailure,resultCode}'
      IS DISTINCT FROM '1006'
    OR (
      SELECT payment_status
      FROM public.orders
      WHERE id = v_payment.order_id
    ) IS DISTINCT FROM 'unpaid'
    OR v_event.processing_status IS DISTINCT FROM 'processed'
    OR v_event.http_status IS DISTINCT FROM 204
    OR v_event.error_code IS DISTINCT FROM 'provider_result_failed'
    OR v_event.payment_id IS DISTINCT FROM v_payment.id
    OR v_event.payload IS DISTINCT FROM v_failure_payload
  THEN
    RAISE EXCEPTION 'MoMo failure transaction contract invalid';
  END IF;

  v_replay_payload := jsonb_set(
    v_failure_payload,
    '{resultCode}',
    '7002'::jsonb
  );
  v_result := public.record_momo_pending_result(
    v_event.id,
    v_payment.id,
    v_replay_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'already_final' THEN
    RAISE EXCEPTION 'terminal event accepted pending downgrade: %', v_result;
  END IF;

  SELECT * INTO v_event
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_pending_event_id')::bigint;
  IF v_event.payload IS DISTINCT FROM v_failure_payload
    OR v_event.processing_status IS DISTINCT FROM 'processed'
  THEN
    RAISE EXCEPTION 'pending replay overwrote terminal failure evidence';
  END IF;

  v_result := public.finalize_momo_failed_payment(
    v_event.id,
    v_payment.id,
    v_failure_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'already_final' THEN
    RAISE EXCEPTION 'same-event failure replay invalid: %', v_result;
  END IF;

  SELECT payload INTO v_original_payload
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_completed_event_id')::bigint;
  v_result := public.finalize_momo_failed_payment(
    current_setting('test.momo_completed_event_id')::bigint,
    current_setting('test.momo_completed_payment_id')::bigint,
    v_original_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'already_completed' THEN
    RAISE EXCEPTION 'late failure changed completed payment: %', v_result;
  END IF;
  SELECT * INTO v_event
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_completed_event_id')::bigint;
  IF v_event.processing_status IS DISTINCT FROM 'ignored'
    OR v_event.error_code IS DISTINCT FROM 'payment_already_final'
    OR v_event.payload IS DISTINCT FROM v_original_payload
    OR (
      SELECT provider_data ->> 'completedEvidence'
      FROM public.payments
      WHERE id = current_setting('test.momo_completed_payment_id')::bigint
    ) IS DISTINCT FROM 'keep'
  THEN
    RAISE EXCEPTION 'late failure downgraded completed evidence';
  END IF;

  SELECT payload INTO v_original_payload
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_mismatch_event_id')::bigint;
  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      current_setting('test.momo_mismatch_event_id')::bigint,
      current_setting('test.momo_mismatch_payment_id')::bigint,
      v_original_payload
    );
    RAISE EXCEPTION 'amount-mismatched evidence unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT * INTO v_event
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_mismatch_event_id')::bigint;
  IF v_event.processing_status IS DISTINCT FROM 'received'
    OR v_event.payment_id IS NOT NULL
    OR v_event.payload IS DISTINCT FROM v_original_payload
    OR (
      SELECT status
      FROM public.payments
      WHERE id = current_setting('test.momo_mismatch_payment_id')::bigint
    ) IS DISTINCT FROM 'pending'
  THEN
    RAISE EXCEPTION 'amount mismatch mutated payment or event';
  END IF;

  SELECT payload INTO v_success_payload
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_success_event_id')::bigint;
  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      current_setting('test.momo_success_event_id')::bigint,
      current_setting('test.momo_mismatch_payment_id')::bigint,
      v_success_payload
    );
    RAISE EXCEPTION 'success result entered failure transition';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  v_result := public.finalize_momo_successful_payment(
    current_setting('test.momo_success_event_id')::bigint,
    current_setting('test.momo_mismatch_payment_id')::bigint,
    v_success_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'MoMo success settlement invalid: %', v_result;
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = current_setting('test.momo_mismatch_payment_id')::bigint;
  SELECT * INTO v_event
  FROM public.webhook_events
  WHERE id = current_setting('test.momo_success_event_id')::bigint;
  IF v_payment.status IS DISTINCT FROM 'completed'
    OR v_payment.provider_data ->> 'existing' IS DISTINCT FROM 'untouched'
    OR v_payment.provider_data ->> 'resultCode' IS DISTINCT FROM '9000'
    OR (
      SELECT payment_status
      FROM public.orders
      WHERE id = v_payment.order_id
    ) IS DISTINCT FROM 'paid'
    OR v_event.processing_status IS DISTINCT FROM 'processed'
    OR v_event.http_status IS DISTINCT FROM 204
    OR v_event.error_code IS NOT NULL
    OR v_event.payment_id IS DISTINCT FROM v_payment.id
    OR v_event.payload IS DISTINCT FROM v_success_payload
  THEN
    RAISE EXCEPTION 'MoMo success transaction contract invalid';
  END IF;

  v_replay_payload := jsonb_set(
    v_success_payload,
    '{resultCode}',
    '7000'::jsonb
  );
  v_result := public.record_momo_pending_result(
    v_event.id,
    v_payment.id,
    v_replay_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'already_final' THEN
    RAISE EXCEPTION 'terminal success accepted pending downgrade: %', v_result;
  END IF;
  IF (
    SELECT payload
    FROM public.webhook_events
    WHERE id = v_event.id
  ) IS DISTINCT FROM v_success_payload THEN
    RAISE EXCEPTION 'pending replay overwrote terminal success payload';
  END IF;

  v_request_id := 'PGR-REQ-INVALID-SIGNATURE-' ||
    replace(gen_random_uuid()::text, '-', '');
  v_original_payload := jsonb_build_object(
    'requestId', v_request_id,
    'orderId', v_payment.provider_ref,
    'amount', v_payment.amount,
    'resultCode', 1006
  );
  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_payment.tenant_id,
    'momo',
    v_request_id,
    v_payment.order_id,
    false,
    v_original_payload,
    'received'
  ) RETURNING id INTO v_event_id;
  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      v_event_id,
      v_payment.id,
      v_original_payload
    );
    RAISE EXCEPTION 'invalid-signature event unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT * INTO v_event FROM public.webhook_events WHERE id = v_event_id;
  IF v_event.processing_status IS DISTINCT FROM 'received'
    OR v_event.payload IS DISTINCT FROM v_original_payload
  THEN
    RAISE EXCEPTION 'invalid-signature event was mutated';
  END IF;

  v_request_id := 'PGR-REQ-REQUEST-MISMATCH-' ||
    replace(gen_random_uuid()::text, '-', '');
  v_original_payload := jsonb_build_object(
    'requestId', v_request_id,
    'orderId', v_payment.provider_ref,
    'amount', v_payment.amount,
    'resultCode', 1006
  );
  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_payment.tenant_id,
    'momo',
    v_request_id,
    v_payment.order_id,
    true,
    v_original_payload,
    'received'
  ) RETURNING id INTO v_event_id;
  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      v_event_id,
      v_payment.id,
      jsonb_set(
        v_original_payload,
        '{requestId}',
        to_jsonb(v_request_id || '-WRONG')
      )
    );
    RAISE EXCEPTION 'request-mismatched evidence unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT * INTO v_event FROM public.webhook_events WHERE id = v_event_id;
  IF v_event.processing_status IS DISTINCT FROM 'received'
    OR v_event.payload IS DISTINCT FROM v_original_payload
  THEN
    RAISE EXCEPTION 'request mismatch mutated event';
  END IF;

  v_request_id := 'PGR-REQ-REF-MISMATCH-' ||
    replace(gen_random_uuid()::text, '-', '');
  v_original_payload := jsonb_build_object(
    'requestId', v_request_id,
    'orderId', v_payment.provider_ref,
    'amount', v_payment.amount,
    'resultCode', 1006
  );
  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_payment.tenant_id,
    'momo',
    v_request_id,
    v_payment.order_id,
    true,
    v_original_payload,
    'received'
  ) RETURNING id INTO v_event_id;
  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      v_event_id,
      v_payment.id,
      jsonb_set(
        v_original_payload,
        '{orderId}',
        '"WRONG-PROVIDER-REF"'::jsonb
      )
    );
    RAISE EXCEPTION 'provider-ref mismatch unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT * INTO v_event FROM public.webhook_events WHERE id = v_event_id;
  IF v_event.processing_status IS DISTINCT FROM 'received'
    OR v_event.payload IS DISTINCT FROM v_original_payload
  THEN
    RAISE EXCEPTION 'provider-ref mismatch mutated event';
  END IF;

  v_request_id := 'PGR-REQ-ORDER-MISMATCH-' ||
    replace(gen_random_uuid()::text, '-', '');
  v_original_payload := jsonb_build_object(
    'requestId', v_request_id,
    'orderId', v_payment.provider_ref,
    'amount', v_payment.amount,
    'resultCode', 1006
  );
  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_payment.tenant_id,
    'momo',
    v_request_id,
    (
      SELECT order_id
      FROM public.payments
      WHERE id = current_setting('test.momo_completed_payment_id')::bigint
    ),
    true,
    v_original_payload,
    'received'
  ) RETURNING id INTO v_event_id;
  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      v_event_id,
      v_payment.id,
      v_original_payload
    );
    RAISE EXCEPTION 'event-order mismatch unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT * INTO v_event FROM public.webhook_events WHERE id = v_event_id;
  IF v_event.processing_status IS DISTINCT FROM 'received'
    OR v_event.payload IS DISTINCT FROM v_original_payload
  THEN
    RAISE EXCEPTION 'event-order mismatch mutated event';
  END IF;

  v_request_id := 'PGR-REQ-BINDING-' ||
    replace(gen_random_uuid()::text, '-', '');
  v_original_payload := jsonb_build_object(
    'requestId', v_request_id,
    'orderId', v_payment.provider_ref,
    'amount', v_payment.amount,
    'resultCode', 1006
  );
  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, payment_id, signature_valid,
    payload, processing_status, http_status, error_code
  ) VALUES (
    v_payment.tenant_id,
    'momo',
    v_request_id,
    v_payment.order_id,
    current_setting('test.momo_completed_payment_id')::bigint,
    true,
    v_original_payload,
    'failed',
    500,
    'rpc_failed'
  ) RETURNING id INTO v_event_id;
  BEGIN
    PERFORM public.finalize_momo_failed_payment(
      v_event_id,
      v_payment.id,
      v_original_payload
    );
    RAISE EXCEPTION 'payment-binding conflict unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT payment_id INTO v_bound_payment_id
  FROM public.webhook_events
  WHERE id = v_event_id;
  IF v_bound_payment_id IS DISTINCT FROM
    current_setting('test.momo_completed_payment_id')::bigint
  THEN
    RAISE EXCEPTION 'payment-binding conflict overwrote event';
  END IF;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, subtotal, total_amount,
    created_by, status, payment_status
  ) VALUES (
    v_payment.tenant_id,
    v_payment.branch_id,
    'PGR-MOMO-REFUNDED-' || replace(gen_random_uuid()::text, '-', ''),
    'takeaway',
    45000,
    45000,
    current_setting('test.cashier_id')::uuid,
    'completed',
    'paid'
  ) RETURNING id INTO v_refunded_order_id;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, provider_ref,
    provider_data, paid_at, created_by
  ) VALUES (
    v_payment.tenant_id,
    v_payment.branch_id,
    v_refunded_order_id,
    'momo',
    45000,
    'refunded',
    'PGR-MOMO-REFUNDED',
    '{"refundEvidence":"keep"}',
    now(),
    current_setting('test.cashier_id')::uuid
  ) RETURNING id INTO v_refunded_payment_id;

  v_request_id := 'PGR-REQ-REFUNDED-' ||
    replace(gen_random_uuid()::text, '-', '');
  v_original_payload := jsonb_build_object(
    'requestId', v_request_id,
    'orderId', 'PGR-MOMO-REFUNDED',
    'amount', 45000,
    'resultCode', 1006
  );
  INSERT INTO public.webhook_events (
    tenant_id, provider, request_id, order_id, signature_valid, payload,
    processing_status
  ) VALUES (
    v_payment.tenant_id,
    'momo',
    v_request_id,
    v_refunded_order_id,
    true,
    v_original_payload,
    'received'
  ) RETURNING id INTO v_event_id;

  v_result := public.finalize_momo_failed_payment(
    v_event_id,
    v_refunded_payment_id,
    v_original_payload
  );
  IF v_result ->> 'status' IS DISTINCT FROM 'already_refunded'
    OR (
      SELECT provider_data ->> 'refundEvidence'
      FROM public.payments
      WHERE id = v_refunded_payment_id
    ) IS DISTINCT FROM 'keep'
    OR (
      SELECT processing_status
      FROM public.webhook_events
      WHERE id = v_event_id
    ) IS DISTINCT FROM 'ignored'
  THEN
    RAISE EXCEPTION 'late failure downgraded refunded evidence';
  END IF;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_order_id bigint;
BEGIN
  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, subtotal, total_amount,
    created_by, status, payment_status
  ) VALUES (
    current_setting('test.tenant_id')::bigint,
    current_setting('test.branch_id')::bigint,
    'PGR-PRINT-WARNING-' || replace(gen_random_uuid()::text, '-', ''),
    'takeaway',
    0,
    0,
    current_setting('test.cashier_id')::uuid,
    'new',
    'unpaid'
  ) RETURNING id INTO v_order_id;

  PERFORM set_config('test.print_warning_order_id', v_order_id::text, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id bigint,
  p_cash_received numeric DEFAULT NULL,
  p_cash_change numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'test-sensitive-printer-detail';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.cashier_id'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.cashier_id'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.tenant_id')::bigint,
      'branch_id', current_setting('test.branch_id')::bigint
    )
  )::text,
  true
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.confirm_cash_payment(
    current_setting('test.print_warning_order_id')::bigint,
    0
  );

  IF v_result ->> 'status' IS DISTINCT FROM 'completed'
    OR v_result ->> 'print_warning' IS DISTINCT FROM 'receipt_enqueue_failed'
    OR v_result ->> 'print_job_id' IS NOT NULL
    OR v_result::text LIKE '%test-sensitive-printer-detail%'
  THEN
    RAISE EXCEPTION 'unsafe receipt warning response: %', v_result;
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
