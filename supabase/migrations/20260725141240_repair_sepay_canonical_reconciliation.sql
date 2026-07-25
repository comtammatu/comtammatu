DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_reconciliation_matches match
    WHERE match.payment_id IS NOT NULL
    GROUP BY match.tenant_id, match.bank_transaction_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_bank_payment_reconciliation_requires_review'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_reconciliation_matches match
    GROUP BY match.tenant_id, match.bank_transaction_id
    HAVING count(*) FILTER (WHERE match.payment_id IS NOT NULL) > 0
      AND count(*) > 1
  ) THEN
    RAISE EXCEPTION 'bank_payment_mixed_target_requires_review'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  bank_transaction_reconciliation_matches_payment_key
ON public.bank_transaction_reconciliation_matches (
  payment_id,
  tenant_id
)
WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_bank_payment_key
ON public.bank_transaction_reconciliation_matches (
    bank_transaction_id,
    tenant_id
  )
  WHERE payment_id IS NOT NULL;

CREATE FUNCTION private.guard_bank_payment_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bank public.bank_transactions%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_reconciliation_matches existing
    WHERE existing.tenant_id = NEW.tenant_id
      AND existing.bank_transaction_id = NEW.bank_transaction_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND (
        NEW.payment_id IS NOT NULL
        OR existing.payment_id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'bank_payment_reconciliation_conflict'
      USING ERRCODE = '23505';
  END IF;

  SELECT *
  INTO v_bank
  FROM public.bank_transactions bank_record
  WHERE bank_record.id = NEW.bank_transaction_id
    AND bank_record.tenant_id = NEW.tenant_id;

  IF NEW.payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = NEW.payment_id
    AND payment.tenant_id = NEW.tenant_id;

  IF v_bank.id IS NULL
    OR v_payment.id IS NULL
    OR v_bank.transfer_type <> 'in'
    OR v_payment.method <> 'vietqr'
    OR v_payment.status <> 'completed'
    OR v_bank.amount <> v_payment.amount
    OR NEW.matched_amount <> v_payment.amount
  THEN
    RAISE EXCEPTION 'invalid_bank_payment_reconciliation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_bank_payment_reconciliation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_bank_payment_reconciliation_guard
BEFORE INSERT OR UPDATE OF
  tenant_id,
  bank_transaction_id,
  payment_id,
  matched_amount
ON public.bank_transaction_reconciliation_matches
FOR EACH ROW
EXECUTE FUNCTION private.guard_bank_payment_reconciliation();

CREATE FUNCTION private.ensure_sepay_payment_reconciliation(
  p_event_id bigint,
  p_payment_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_bank public.bank_transactions%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_provider_transaction_id text;
  v_event_amount numeric(15,2);
  v_payment_match public.bank_transaction_reconciliation_matches%ROWTYPE;
  v_bank_match public.bank_transaction_reconciliation_matches%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  SELECT *
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id
    AND event.provider = 'sepay'
  FOR UPDATE;

  IF v_event.id IS NULL
    OR v_event.signature_valid IS NOT TRUE
    OR v_event.processing_status <> 'processed'
    OR v_event.error_code IS NOT NULL
    OR v_event.payment_id IS DISTINCT FROM p_payment_id
    OR lower(COALESCE(v_event.payload->>'transferType', '')) <> 'in'
    OR COALESCE(v_event.payload->>'transferAmount', '')
      !~ '^[0-9]+([.][0-9]+)?$'
  THEN
    RETURN jsonb_build_object(
      'status', 'needs_review',
      'code', 'invalid_webhook_evidence'
    );
  END IF;

  v_event_amount := (v_event.payload->>'transferAmount')::numeric;
  v_provider_transaction_id := COALESCE(
    NULLIF(btrim(v_event.payload->>'id'), ''),
    NULLIF(btrim(v_event.request_id), '')
  );

  SELECT *
  INTO v_bank
  FROM public.bank_transactions bank_record
  WHERE bank_record.tenant_id = v_event.tenant_id
    AND bank_record.provider_transaction_id = v_provider_transaction_id
  FOR UPDATE;

  SELECT *
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
  FOR UPDATE;

  IF v_payment.id IS NOT NULL THEN
    SELECT *
    INTO v_order
    FROM public.orders orders
    WHERE orders.id = v_payment.order_id
      AND orders.tenant_id = v_payment.tenant_id
    FOR UPDATE;
  END IF;

  IF v_bank.id IS NULL
    OR v_payment.id IS NULL
    OR v_order.id IS NULL
    OR v_provider_transaction_id IS NULL
    OR v_bank.transfer_type <> 'in'
    OR v_bank.amount <> v_event_amount
    OR v_payment.method <> 'vietqr'
    OR v_payment.status <> 'completed'
    OR v_payment.amount <> v_event_amount
    OR v_event.order_id IS DISTINCT FROM v_order.id
    OR v_order.branch_id IS DISTINCT FROM v_payment.branch_id
  THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_data,
      new_data
    ) VALUES (
      v_event.tenant_id,
      auth.uid(),
      'sepay_canonical_reconciliation_needs_review',
      'webhook_event',
      v_event.id,
      NULL,
      jsonb_build_object(
        'code', 'bank_payment_evidence_mismatch',
        'payment_id', p_payment_id,
        'provider_transaction_id', v_provider_transaction_id
      )
    );

    RETURN jsonb_build_object(
      'status', 'needs_review',
      'code', 'bank_payment_evidence_mismatch'
    );
  END IF;

  SELECT *
  INTO v_payment_match
  FROM public.bank_transaction_reconciliation_matches match
  WHERE match.tenant_id = v_event.tenant_id
    AND match.payment_id = v_payment.id
  FOR UPDATE;

  SELECT *
  INTO v_bank_match
  FROM public.bank_transaction_reconciliation_matches match
  WHERE match.tenant_id = v_event.tenant_id
    AND match.bank_transaction_id = v_bank.id
  FOR UPDATE;

  IF v_payment_match.id IS NOT NULL
    AND v_payment_match.bank_transaction_id = v_bank.id
    AND (
      v_bank_match.id IS NULL
      OR v_bank_match.payment_id = v_payment.id
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'matched',
      'bank_transaction_id', v_bank.id,
      'payment_id', v_payment.id,
      'idempotent', true
    );
  END IF;

  IF (
    v_payment_match.id IS NOT NULL
    AND v_payment_match.bank_transaction_id <> v_bank.id
  ) OR (
    v_bank_match.id IS NOT NULL
    AND v_bank_match.payment_id IS DISTINCT FROM v_payment.id
  ) THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_data,
      new_data
    ) VALUES (
      v_event.tenant_id,
      auth.uid(),
      'sepay_canonical_reconciliation_needs_review',
      'webhook_event',
      v_event.id,
      NULL,
      jsonb_build_object(
        'code', 'canonical_match_conflict',
        'bank_transaction_id', v_bank.id,
        'payment_id', v_payment.id
      )
    );

    RETURN jsonb_build_object(
      'status', 'needs_review',
      'code', 'canonical_match_conflict'
    );
  END IF;

  INSERT INTO public.bank_transaction_reconciliation_matches (
    tenant_id,
    bank_transaction_id,
    payment_id,
    matched_amount,
    created_by
  ) VALUES (
    v_event.tenant_id,
    v_bank.id,
    v_payment.id,
    v_payment.amount,
    auth.uid()
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_transaction_reconciliation_matches match
    WHERE match.tenant_id = v_event.tenant_id
      AND match.bank_transaction_id = v_bank.id
      AND match.payment_id = v_payment.id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'needs_review',
      'code', 'canonical_match_conflict'
    );
  END IF;

  IF v_inserted = 1 THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_data,
      new_data
    ) VALUES (
      v_event.tenant_id,
      auth.uid(),
      'sepay_canonical_reconciliation_match',
      'webhook_event',
      v_event.id,
      NULL,
      jsonb_build_object(
        'bank_transaction_id', v_bank.id,
        'payment_id', v_payment.id,
        'matched_amount', v_payment.amount
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'matched',
    'bank_transaction_id', v_bank.id,
    'payment_id', v_payment.id,
    'idempotent', v_inserted = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_sepay_payment_reconciliation(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.reconcile_sepay_order_evidence(bigint, text)
  RENAME TO reconcile_sepay_order_evidence_core;

REVOKE ALL ON FUNCTION public.reconcile_sepay_order_evidence_core(bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_sepay_order_evidence_core(bigint, text)
  TO service_role;

CREATE FUNCTION public.reconcile_sepay_order_evidence(
  p_event_id bigint,
  p_payment_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_payment_id bigint;
  v_canonical jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT public.reconcile_sepay_order_evidence_core(
    p_event_id,
    p_payment_code
  )
  INTO v_result;

  IF v_result->>'status' = 'matched' THEN
    v_payment_id := NULLIF(v_result->>'payment_id', '')::bigint;
    IF v_payment_id IS NOT NULL THEN
      v_canonical := private.ensure_sepay_payment_reconciliation(
        p_event_id,
        v_payment_id
      );
      v_result := v_result || jsonb_build_object(
        'canonical_reconciliation',
        v_canonical
      );
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.reconcile_sepay_order_evidence(bigint, text) IS
  'Service-role SePay settlement wrapper. The original settlement contract runs first, then the exact bank-to-payment canonical match is repaired in the same transaction.';

REVOKE ALL ON FUNCTION public.reconcile_sepay_order_evidence(bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_sepay_order_evidence(bigint, text)
  TO service_role;

WITH exact_candidates AS (
  SELECT DISTINCT ON (
    event.tenant_id,
    bank.id,
    payment.id
  )
    event.tenant_id,
    event.id AS event_id,
    bank.id AS bank_transaction_id,
    payment.id AS payment_id,
    payment.amount
  FROM public.webhook_events event
  JOIN public.payments payment
    ON payment.id = event.payment_id
   AND payment.tenant_id = event.tenant_id
   AND payment.status = 'completed'
   AND payment.method = 'vietqr'
  JOIN public.orders orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
   AND orders.id = event.order_id
  JOIN public.bank_transactions bank
    ON bank.tenant_id = event.tenant_id
   AND bank.provider_transaction_id = COALESCE(
     NULLIF(btrim(event.payload->>'id'), ''),
     NULLIF(btrim(event.request_id), '')
   )
   AND bank.transfer_type = 'in'
   AND bank.amount = payment.amount
  WHERE event.provider = 'sepay'
    AND event.signature_valid IS TRUE
    AND event.processing_status = 'processed'
    AND event.error_code IS NULL
    AND event.payment_id IS NOT NULL
    AND lower(COALESCE(event.payload->>'transferType', '')) = 'in'
    AND COALESCE(event.payload->>'transferAmount', '')
      ~ '^[0-9]+([.][0-9]+)?$'
    AND (event.payload->>'transferAmount')::numeric = payment.amount
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transaction_reconciliation_matches match
      WHERE match.tenant_id = event.tenant_id
        AND match.payment_id = payment.id
        AND match.bank_transaction_id <> bank.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transaction_reconciliation_matches match
      WHERE match.tenant_id = event.tenant_id
        AND match.bank_transaction_id = bank.id
        AND match.payment_id IS DISTINCT FROM payment.id
    )
  ORDER BY event.tenant_id, bank.id, payment.id, event.id
),
inserted AS (
  INSERT INTO public.bank_transaction_reconciliation_matches (
    tenant_id,
    bank_transaction_id,
    payment_id,
    matched_amount,
    created_by
  )
  SELECT
    candidate.tenant_id,
    candidate.bank_transaction_id,
    candidate.payment_id,
    candidate.amount,
    NULL
  FROM exact_candidates candidate
  ON CONFLICT DO NOTHING
  RETURNING
    tenant_id,
    bank_transaction_id,
    payment_id,
    matched_amount
)
INSERT INTO public.audit_logs (
  tenant_id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_data,
  new_data
)
SELECT
  inserted.tenant_id,
  NULL,
  'sepay_canonical_reconciliation_backfill',
  'bank_transaction',
  inserted.bank_transaction_id,
  NULL,
  jsonb_build_object(
    'payment_id', inserted.payment_id,
    'matched_amount', inserted.matched_amount
  )
FROM inserted;
