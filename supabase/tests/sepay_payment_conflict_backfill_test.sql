-- Rehearses the migration backfill against legacy SePay failure rows.
-- The database test runner expands the relative migration include before piping SQL.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE sepay_backfill_fixture (
  kind text PRIMARY KEY,
  event_id bigint NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_tenant_id bigint;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_event_id bigint;
BEGIN
  SELECT tenant_id
  INTO v_tenant_id
  FROM public.branches
  WHERE is_active
  ORDER BY id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Seed data missing for SePay backfill rehearsal';
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
    'backfill-missing-' || v_suffix,
    true,
    '{"transferType":"in","transferAmount":100000}'::jsonb,
    'failed',
    200,
    'missing_payment_code',
    now()
  ) RETURNING id INTO v_event_id;
  INSERT INTO sepay_backfill_fixture VALUES ('missing', v_event_id);

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
    'backfill-order-' || v_suffix,
    true,
    '{"transferType":"in","transferAmount":100000}'::jsonb,
    'failed',
    200,
    'order_not_found',
    now()
  ) RETURNING id INTO v_event_id;
  INSERT INTO sepay_backfill_fixture VALUES ('order', v_event_id);

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
    'backfill-invalid-' || v_suffix,
    true,
    '{"transferType":"in","transferAmount":-1}'::jsonb,
    'failed',
    200,
    'invalid_amount',
    now()
  ) RETURNING id INTO v_event_id;
  INSERT INTO sepay_backfill_fixture VALUES ('invalid', v_event_id);

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
    'backfill-unsigned-' || v_suffix,
    false,
    '{"transferType":"in","transferAmount":100000}'::jsonb,
    'failed',
    200,
    'missing_payment_code',
    now()
  ) RETURNING id INTO v_event_id;
  INSERT INTO sepay_backfill_fixture VALUES ('unsigned', v_event_id);
END;
$$;

\ir ../migrations/20260715135031_harden_sepay_payment_conflicts.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.webhook_events e
    JOIN sepay_backfill_fixture f ON f.event_id = e.id
    WHERE f.kind = 'missing'
      AND e.processing_status = 'processed'
      AND e.http_status = 200
      AND e.error_code = 'missing_payment_code_needs_review'
  ) THEN
    RAISE EXCEPTION 'Legacy missing-code row was not backfilled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.webhook_events e
    JOIN sepay_backfill_fixture f ON f.event_id = e.id
    WHERE f.kind = 'order'
      AND e.processing_status = 'processed'
      AND e.http_status = 200
      AND e.error_code = 'order_not_found_needs_review'
  ) THEN
    RAISE EXCEPTION 'Legacy order-not-found row was not backfilled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.webhook_events e
    JOIN sepay_backfill_fixture f ON f.event_id = e.id
    WHERE f.kind = 'invalid'
      AND e.processing_status = 'failed'
      AND e.error_code = 'invalid_amount'
  ) THEN
    RAISE EXCEPTION 'Technical invalid-amount row was changed by backfill';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.webhook_events e
    JOIN sepay_backfill_fixture f ON f.event_id = e.id
    WHERE f.kind = 'unsigned'
      AND e.processing_status = 'failed'
      AND e.error_code = 'missing_payment_code'
  ) THEN
    RAISE EXCEPTION 'Unsigned legacy row was changed by backfill';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.confirm_sepay_payment(bigint,bigint,text,numeric,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role still executes confirm_sepay_payment directly';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.reconcile_sepay_order_evidence(bigint,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute the guarded reconciliation RPC';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.link_sepay_transaction_to_payment(bigint,bigint)',
    'EXECUTE'
  ) OR has_function_privilege(
    'service_role',
    'public.link_sepay_transaction_to_payment(bigint,bigint)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Manual-link privileges do not match the Owner-authenticated boundary';
  END IF;
END;
$$;

ROLLBACK;
