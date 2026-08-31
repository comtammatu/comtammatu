-- Fix bank reconciliation target matching for unpaid expenses and widen replay_signed_sepay_payment_evidence to accountant.

CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction_targets(
  p_bank_transaction_id bigint,
  p_target_type text,
  p_target_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_transaction public.bank_transactions%ROWTYPE;
  v_target_ids bigint[];
  v_target_count integer;
  v_target_total numeric(15,2);
  v_old_matches jsonb;
  v_legacy_result jsonb;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR public.auth_role() NOT IN ('owner', 'accountant')
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_target_type NOT IN ('payment', 'expense', 'supplier_payment', 'refund')
  THEN
    RAISE EXCEPTION 'invalid_bank_reconciliation_target'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_target_ids, ARRAY[]::bigint[])) selected(target_id)
    WHERE selected.target_id IS NULL OR selected.target_id <= 0
  ) THEN
    RAISE EXCEPTION 'invalid_bank_reconciliation_target'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT target_id ORDER BY target_id),
    ARRAY[]::bigint[]
  )
  INTO v_target_ids
  FROM unnest(COALESCE(p_target_ids, ARRAY[]::bigint[])) selected(target_id)
  WHERE selected.target_id IS NOT NULL AND selected.target_id > 0;

  IF cardinality(v_target_ids) > 20
    OR (p_target_type = 'payment' AND cardinality(v_target_ids) <> 1)
  THEN
    RAISE EXCEPTION 'invalid_bank_reconciliation_target'
      USING ERRCODE = '22023';
  END IF;

  SELECT transaction.*
  INTO v_transaction
  FROM public.bank_transactions transaction
  WHERE transaction.id = p_bank_transaction_id
    AND transaction.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_transaction_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(match) ORDER BY match.id), '[]'::jsonb)
  INTO v_old_matches
  FROM public.bank_transaction_reconciliation_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.bank_transaction_id = v_transaction.id;

  IF v_transaction.webhook_event_id IS NOT NULL THEN
    CASE p_target_type
      WHEN 'payment' THEN
        v_legacy_result := public.link_sepay_transaction_to_payment(
          v_transaction.webhook_event_id,
          v_target_ids[1]
        );
      WHEN 'expense' THEN
        v_legacy_result := public.match_sepay_transaction_expenses(
          v_transaction.webhook_event_id,
          v_target_ids
        );
      WHEN 'supplier_payment' THEN
        v_legacy_result := public.match_sepay_transaction_supplier_payments(
          v_transaction.webhook_event_id,
          v_target_ids
        );
      WHEN 'refund' THEN
        v_legacy_result := public.match_sepay_transaction_refunds(
          v_transaction.webhook_event_id,
          v_target_ids
        );
    END CASE;
  END IF;

  IF cardinality(v_target_ids) = 0 THEN
    DELETE FROM public.bank_transaction_reconciliation_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.bank_transaction_id = v_transaction.id
      AND (
        (p_target_type = 'expense' AND match.expense_id IS NOT NULL)
        OR (
          p_target_type = 'supplier_payment'
          AND match.supplier_payment_id IS NOT NULL
        )
        OR (p_target_type = 'refund' AND match.refund_id IS NOT NULL)
      );

    PERFORM public.log_audit(
      'bank_transaction.reconcile',
      'bank_transaction',
      v_transaction.id,
      v_old_matches,
      jsonb_build_object(
        'target_type', p_target_type,
        'target_ids', '[]'::jsonb,
        'matched_amount', 0
      )
    );

    RETURN jsonb_build_object(
      'bank_transaction_id', v_transaction.id,
      'target_type', p_target_type,
      'target_ids', '[]'::jsonb,
      'matched_amount', 0,
      'legacy_result', v_legacy_result
    );
  END IF;

  CASE p_target_type
    WHEN 'payment' THEN
      IF v_transaction.transfer_type <> 'in' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(payment.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids)
        AND payment.method = 'vietqr'
        AND payment.status = 'completed';
    WHEN 'expense' THEN
      IF v_transaction.transfer_type <> 'out' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(expense.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant_id
        AND expense.id = ANY(v_target_ids)
        AND expense.category IN (
          'rent',
          'utilities',
          'gas_fuel',
          'salary',
          'supplies',
          'repair',
          'marketing',
          'fees_tax',
          'hospitality',
          'capital',
          'deposit',
          'other'
        )
        AND (
          v_transaction.webhook_event_id IS NOT NULL
          OR expense.payment_method IN ('transfer', 'unpaid')
        );
    WHEN 'supplier_payment' THEN
      IF v_transaction.transfer_type <> 'out' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(payment.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.supplier_payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids)
        AND payment.payment_method = 'bank_transfer';
    WHEN 'refund' THEN
      IF v_transaction.transfer_type <> 'out' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(refund.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.refunds refund
      WHERE refund.tenant_id = v_tenant_id
        AND refund.id = ANY(v_target_ids)
        AND refund.status = 'approved'
        AND refund.payout_method = 'bank_transfer';
  END CASE;

  IF v_target_count <> cardinality(v_target_ids) THEN
    RAISE EXCEPTION 'bank_reconciliation_target_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target_total <> v_transaction.amount THEN
    RAISE EXCEPTION 'bank_reconciliation_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF v_transaction.webhook_event_id IS NULL THEN
    IF p_target_type = 'payment' AND EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = v_tenant_id
        AND event.payment_id = ANY(v_target_ids)
        AND event.provider = 'sepay'
        AND event.signature_valid IS TRUE
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    ELSIF p_target_type = 'expense' AND EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = v_tenant_id
        AND match.expense_id = ANY(v_target_ids)
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    ELSIF p_target_type = 'supplier_payment' AND EXISTS (
      SELECT 1
      FROM public.supplier_payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids)
        AND payment.webhook_event_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    ELSIF p_target_type = 'refund' AND EXISTS (
      SELECT 1
      FROM public.refunds refund
      WHERE refund.tenant_id = v_tenant_id
        AND refund.id = ANY(v_target_ids)
        AND refund.webhook_event_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  DELETE FROM public.bank_transaction_reconciliation_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.bank_transaction_id = v_transaction.id;

  CASE p_target_type
    WHEN 'payment' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        payment_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        payment.id,
        payment.amount,
        v_actor
      FROM public.payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids);
    WHEN 'expense' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        expense_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        expense.id,
        expense.amount,
        v_actor
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant_id
        AND expense.id = ANY(v_target_ids);
    WHEN 'supplier_payment' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        supplier_payment_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        payment.id,
        payment.amount,
        v_actor
      FROM public.supplier_payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids);
    WHEN 'refund' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        refund_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        refund.id,
        refund.amount,
        v_actor
      FROM public.refunds refund
      WHERE refund.tenant_id = v_tenant_id
        AND refund.id = ANY(v_target_ids);
  END CASE;

  PERFORM public.log_audit(
    'bank_transaction.reconcile',
    'bank_transaction',
    v_transaction.id,
    v_old_matches,
    jsonb_build_object(
      'target_type', p_target_type,
      'target_ids', to_jsonb(v_target_ids),
      'matched_amount', v_target_total
    )
  );

  RETURN jsonb_build_object(
    'bank_transaction_id', v_transaction.id,
    'target_type', p_target_type,
    'target_ids', to_jsonb(v_target_ids),
    'matched_amount', v_target_total,
    'legacy_result', v_legacy_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_bank_transaction_targets(bigint, text, bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconcile_bank_transaction_targets(bigint, text, bigint[]) TO authenticated;

COMMENT ON FUNCTION public.reconcile_bank_transaction_targets(bigint, text, bigint[]) IS
  'Owner/accountant reconciliation with finance:view. Classifies a canonical bank movement against operational evidence without changing bank balance; webhook-backed rows retain legacy evidence invariants.';

CREATE OR REPLACE FUNCTION public.replay_signed_sepay_payment_evidence(
  p_event_id bigint,
  p_payment_id bigint,
  p_payment_code text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_payment record;
  v_actor_authorized boolean := false;
  v_raw_amount text;
  v_amount numeric;
  v_payment_code text := btrim(COALESCE(p_payment_code, ''));
  v_result jsonb;
  v_result_payment_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sepay_replay_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.positions position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE profile.id = p_actor_id
      AND profile.tenant_id = v_event.tenant_id
      AND COALESCE(profile.is_active, true)
      AND position.code IN ('owner', 'accountant')
  )
  INTO v_actor_authorized;

  IF NOT v_actor_authorized THEN
    RAISE EXCEPTION 'sepay_replay_actor_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT v_event.signature_valid
    OR lower(COALESCE(v_event.payload ->> 'transferType', '')) <> 'in'
    OR v_event.payment_id IS NOT NULL
    OR v_event.expense_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'sepay_replay_event_invalid' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (
      v_event.processing_status = 'processed'
      AND v_event.error_code IN (
        'missing_payment_code_needs_review',
        'order_not_found_needs_review',
        'ambiguous_payment_code_needs_review',
        'amount_mismatch_needs_review'
      )
    )
    OR (
      v_event.processing_status = 'failed'
      AND COALESCE(v_event.http_status, 0) >= 500
    )
  ) THEN
    RAISE EXCEPTION 'sepay_replay_event_not_recoverable' USING ERRCODE = '23514';
  END IF;

  IF v_payment_code = '' THEN
    RAISE EXCEPTION 'sepay_replay_payment_code_required' USING ERRCODE = '22023';
  END IF;

  v_raw_amount := btrim(COALESCE(v_event.payload ->> 'transferAmount', ''));
  IF v_raw_amount !~ '^[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'sepay_replay_amount_invalid' USING ERRCODE = '22023';
  END IF;

  v_amount := v_raw_amount::numeric;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'sepay_replay_amount_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT
    payment.id,
    payment.order_id,
    payment.branch_id,
    payment.amount,
    payment.status,
    payment.method,
    orders.status AS order_status,
    orders.payment_code
  INTO v_payment
  FROM public.payments payment
  JOIN public.orders orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_event.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sepay_replay_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status <> 'pending'
    OR v_payment.method <> 'vietqr'
    OR v_payment.order_status = 'cancelled'
  THEN
    RAISE EXCEPTION 'sepay_replay_payment_not_pending' USING ERRCODE = '23514';
  END IF;

  IF v_payment.amount <> v_amount THEN
    RAISE EXCEPTION 'sepay_replay_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  IF v_payment.payment_code IS DISTINCT FROM v_payment_code THEN
    RAISE EXCEPTION 'sepay_replay_payment_code_mismatch' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.webhook_events other_event
    WHERE other_event.tenant_id = v_event.tenant_id
      AND other_event.payment_id = p_payment_id
      AND other_event.provider = 'sepay'
      AND other_event.signature_valid
      AND lower(COALESCE(other_event.payload ->> 'transferType', '')) = 'in'
      AND other_event.processing_status = 'processed'
      AND other_event.error_code IS NULL
  ) THEN
    RAISE EXCEPTION 'sepay_replay_payment_already_linked' USING ERRCODE = '23505';
  END IF;

  v_result := public.confirm_vietqr_payment(
    v_event.tenant_id,
    v_payment.branch_id,
    v_payment.order_id,
    v_amount,
    p_actor_id
  );

  v_result_payment_id := NULLIF((v_result ->> 'payment_id')::bigint, 0);
  IF v_result_payment_id IS NULL OR v_result_payment_id <> p_payment_id THEN
    RAISE EXCEPTION 'sepay_replay_failed' USING ERRCODE = '23514';
  END IF;

  UPDATE public.webhook_events
  SET order_id = v_payment.order_id,
      payment_id = p_payment_id,
      processing_status = 'processed',
      http_status = 200,
      error_code = NULL,
      processed_at = COALESCE(processed_at, now())
  WHERE id = p_event_id
    AND tenant_id = v_event.tenant_id;

  PERFORM public.log_audit(
    'sepay.replay_signed_payment_evidence',
    'webhook_event',
    p_event_id,
    jsonb_build_object(
      'order_id', v_event.order_id,
      'payment_id', v_event.payment_id,
      'processing_status', v_event.processing_status,
      'error_code', v_event.error_code,
      'http_status', v_event.http_status
    ),
    jsonb_build_object(
      'actor_id', p_actor_id,
      'order_id', v_payment.order_id,
      'payment_id', p_payment_id,
      'payment_code', v_payment_code,
      'processing_status', 'processed',
      'error_code', NULL,
      'http_status', 200
    )
  );

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'payment_id', p_payment_id,
    'order_id', v_payment.order_id,
    'amount', v_amount,
    'status', 'processed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replay_signed_sepay_payment_evidence(bigint, bigint, text, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replay_signed_sepay_payment_evidence(bigint, bigint, text, uuid) TO service_role;

COMMENT ON FUNCTION public.replay_signed_sepay_payment_evidence(bigint, bigint, text, uuid) IS
  'Replays one signed incoming SePay event against its exact pending VietQR payment. The service caller supplies an authenticated Owner or Accountant actor, which is revalidated and audited in the same transaction.';
