CREATE FUNCTION private.repair_tc_260901_008_ph_payment()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_qr_attempt public.payments%ROWTYPE;
  v_bank public.bank_transactions%ROWTYPE;
  v_event public.webhook_events%ROWTYPE;
  v_match public.bank_transaction_reconciliation_matches%ROWTYPE;
  v_order_id bigint;
  v_count integer;
  v_old_order jsonb;
  v_old_payment jsonb;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM public.orders order_record
  WHERE order_record.order_number = 'TC-260901-008-PH';

  IF v_count = 0 THEN
    RETURN jsonb_build_object('status', 'not_present');
  END IF;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'incident_order_not_unique' USING ERRCODE = '23505';
  END IF;

  SELECT order_record.id
  INTO STRICT v_order_id
  FROM public.orders order_record
  WHERE order_record.order_number = 'TC-260901-008-PH';

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT order_record.*
  INTO STRICT v_order
  FROM public.orders order_record
  WHERE order_record.id = v_order_id
  FOR UPDATE;

  SELECT count(*)
  INTO v_count
  FROM public.payments payment
  WHERE payment.tenant_id = v_order.tenant_id
    AND payment.order_id = v_order.id
    AND payment.status = 'completed';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'incident_completed_payment_count_mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT payment.*
  INTO STRICT v_payment
  FROM public.payments payment
  WHERE payment.tenant_id = v_order.tenant_id
    AND payment.order_id = v_order.id
    AND payment.status = 'completed'
  FOR UPDATE;

  SELECT count(*)
  INTO v_count
  FROM public.payments payment
  WHERE payment.tenant_id = v_order.tenant_id
    AND payment.order_id = v_order.id
    AND payment.method = 'vietqr'
    AND payment.status = 'failed'
    AND payment.amount = 581000
    AND payment.provider_ref = v_order.payment_code;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'incident_original_qr_attempt_mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT payment.*
  INTO STRICT v_qr_attempt
  FROM public.payments payment
  WHERE payment.tenant_id = v_order.tenant_id
    AND payment.order_id = v_order.id
    AND payment.method = 'vietqr'
    AND payment.status = 'failed'
    AND payment.amount = 581000
    AND payment.provider_ref = v_order.payment_code
  FOR UPDATE;

  SELECT bank_record.*
  INTO STRICT v_bank
  FROM public.bank_transactions bank_record
  WHERE bank_record.tenant_id = v_order.tenant_id
    AND bank_record.provider_transaction_id = '78166209'
  FOR UPDATE;

  SELECT event.*
  INTO STRICT v_event
  FROM public.webhook_events event
  WHERE event.id = v_bank.webhook_event_id
    AND event.tenant_id = v_order.tenant_id
    AND event.provider = 'sepay'
  FOR UPDATE;

  SELECT count(*)
  INTO v_count
  FROM public.bank_transaction_reconciliation_matches reconciliation
  WHERE reconciliation.tenant_id = v_order.tenant_id
    AND (
      reconciliation.bank_transaction_id = v_bank.id
      OR reconciliation.payment_id = v_payment.id
    );

  IF v_count > 1 THEN
    RAISE EXCEPTION 'incident_reconciliation_count_mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT reconciliation.*
  INTO v_match
  FROM public.bank_transaction_reconciliation_matches reconciliation
  WHERE reconciliation.tenant_id = v_order.tenant_id
    AND (
      reconciliation.bank_transaction_id = v_bank.id
      OR reconciliation.payment_id = v_payment.id
    )
  FOR UPDATE;

  IF v_order.status = 'completed'
     AND v_order.payment_status = 'paid'
     AND v_order.subtotal = 581000
     AND v_order.service_charge = 0
     AND v_order.total_amount = 581000
     AND v_order.holiday_surcharge_source = 'waived'
     AND v_order.payment_method = 'vietqr'
     AND v_payment.method = 'vietqr'
     AND v_payment.amount = 581000
     AND v_event.order_id = v_order.id
     AND v_event.payment_id = v_payment.id
     AND v_event.error_code IS NULL
     AND v_match.bank_transaction_id = v_bank.id
     AND v_match.payment_id = v_payment.id
     AND v_match.matched_amount = 581000
  THEN
    RETURN jsonb_build_object('status', 'already_repaired');
  END IF;

  IF COALESCE(v_event.payload ->> 'transferAmount', '')
       !~ '^[0-9]+([.][0-9]+)?$'
  THEN
    RAISE EXCEPTION 'incident_transfer_amount_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF v_order.status IS DISTINCT FROM 'completed'
     OR v_order.payment_status IS DISTINCT FROM 'paid'
     OR v_order.subtotal IS DISTINCT FROM 581000::numeric
     OR v_order.discount_amount IS DISTINCT FROM 0::numeric
     OR v_order.service_charge IS DISTINCT FROM 58100::numeric
     OR v_order.total_amount IS DISTINCT FROM 639100::numeric
     OR v_order.holiday_surcharge_source IS DISTINCT FROM 'automatic'
     OR v_order.holiday_surcharge_policy_name
       IS DISTINCT FROM 'Phụ thu lễ 2/9'
     OR v_order.holiday_surcharge_calculation_type
       IS DISTINCT FROM 'percentage'
     OR v_order.holiday_surcharge_value IS DISTINCT FROM 10::numeric
     OR v_payment.method IS DISTINCT FROM 'cash'
     OR v_payment.amount IS DISTINCT FROM 639100::numeric
     OR v_payment.provider_ref IS DISTINCT FROM v_order.payment_code
     OR jsonb_typeof(v_payment.provider_data) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_payment.provider_data -> 'invoiceSnapshot')
       IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_qr_attempt.provider_data) IS DISTINCT FROM 'object'
     OR v_bank.transfer_type IS DISTINCT FROM 'in'
     OR v_bank.amount IS DISTINCT FROM 581000::numeric
     OR v_bank.webhook_event_id IS NULL
     OR v_event.signature_valid IS NOT TRUE
     OR v_event.processing_status IS DISTINCT FROM 'processed'
     OR v_event.error_code IS DISTINCT FROM 'amount_mismatch_needs_review'
     OR v_event.order_id IS DISTINCT FROM v_order.id
     OR v_event.payment_id IS NOT NULL
     OR lower(COALESCE(v_event.payload ->> 'transferType', ''))
       IS DISTINCT FROM 'in'
     OR (v_event.payload ->> 'transferAmount')::numeric
       IS DISTINCT FROM 581000::numeric
     OR v_match.id IS NOT NULL
  THEN
    RAISE EXCEPTION 'incident_precondition_mismatch' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.refunds refund
    WHERE refund.tenant_id = v_order.tenant_id
      AND (
        refund.order_id = v_order.id
        OR refund.payment_id = v_payment.id
      )
  ) THEN
    RAISE EXCEPTION 'incident_refund_exists' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tax_invoices invoice
    WHERE invoice.tenant_id = v_order.tenant_id
      AND invoice.order_id = v_order.id
      AND invoice.total_amount <> 581000
  ) THEN
    RAISE EXCEPTION 'incident_invoice_total_mismatch' USING ERRCODE = '23514';
  END IF;

  v_old_order := jsonb_build_object(
    'service_charge', v_order.service_charge,
    'total_amount', v_order.total_amount,
    'payment_method', v_order.payment_method,
    'holiday_surcharge_source', v_order.holiday_surcharge_source
  );
  v_old_payment := jsonb_build_object(
    'amount', v_payment.amount,
    'method', v_payment.method,
    'status', v_payment.status
  );

  UPDATE public.orders
  SET holiday_surcharge_source = 'waived',
      updated_at = now()
  WHERE id = v_order.id;

  UPDATE public.payments
  SET amount = 581000,
      method = 'vietqr',
      provider_data = (v_qr_attempt.provider_data - 'invoiceSnapshot')
        || jsonb_build_object(
          'invoiceSnapshot',
          v_payment.provider_data -> 'invoiceSnapshot'
        ),
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.webhook_events
  SET order_id = v_order.id,
      payment_id = v_payment.id,
      processing_status = 'processed',
      http_status = 200,
      error_code = NULL,
      processed_at = COALESCE(processed_at, now())
  WHERE id = v_event.id;

  INSERT INTO public.bank_transaction_reconciliation_matches (
    tenant_id,
    bank_transaction_id,
    payment_id,
    matched_amount,
    created_by
  ) VALUES (
    v_order.tenant_id,
    v_bank.id,
    v_payment.id,
    581000,
    NULL
  );

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES
  (
    v_order.tenant_id,
    NULL,
    'holiday_surcharge.payment_incident_repair',
    'order',
    v_order.id,
    v_old_order,
    jsonb_build_object(
      'service_charge', 0,
      'total_amount', 581000,
      'payment_method', 'vietqr',
      'holiday_surcharge_source', 'waived',
      'reason', 'surcharge_added_after_payment_amount_exposed'
    )
  ),
  (
    v_order.tenant_id,
    NULL,
    'payment.method_correct',
    'payment',
    v_payment.id,
    v_old_payment,
    jsonb_build_object(
      'amount', 581000,
      'method', 'vietqr',
      'status', 'completed',
      'reason', 'matched_signed_sepay_transfer_after_surcharge_incident'
    )
  ),
  (
    v_order.tenant_id,
    NULL,
    'bank_transaction.reconcile',
    'bank_transaction',
    v_bank.id,
    '[]'::jsonb,
    jsonb_build_object(
      'target_type', 'payment',
      'target_ids', jsonb_build_array(v_payment.id),
      'matched_amount', 581000,
      'reason', 'matched_signed_sepay_transfer_after_surcharge_incident'
    )
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.orders order_record
    JOIN public.payments payment
      ON payment.order_id = order_record.id
     AND payment.tenant_id = order_record.tenant_id
     AND payment.branch_id = order_record.branch_id
    JOIN public.webhook_events event
      ON event.payment_id = payment.id
     AND event.order_id = order_record.id
     AND event.tenant_id = order_record.tenant_id
    JOIN public.bank_transaction_reconciliation_matches reconciliation
      ON reconciliation.payment_id = payment.id
     AND reconciliation.bank_transaction_id = v_bank.id
     AND reconciliation.tenant_id = order_record.tenant_id
    WHERE order_record.id = v_order.id
      AND order_record.status = 'completed'
      AND order_record.payment_status = 'paid'
      AND order_record.subtotal = 581000
      AND order_record.service_charge = 0
      AND order_record.total_amount = 581000
      AND order_record.holiday_surcharge_source = 'waived'
      AND order_record.payment_method = 'vietqr'
      AND payment.id = v_payment.id
      AND payment.status = 'completed'
      AND payment.method = 'vietqr'
      AND payment.amount = 581000
      AND event.signature_valid IS TRUE
      AND event.processing_status = 'processed'
      AND event.error_code IS NULL
      AND reconciliation.matched_amount = 581000
  ) THEN
    RAISE EXCEPTION 'incident_postcondition_mismatch' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'status', 'repaired',
    'order_id', v_order.id,
    'payment_id', v_payment.id,
    'bank_transaction_id', v_bank.id,
    'amount', 581000
  );
END;
$$;

REVOKE ALL ON FUNCTION private.repair_tc_260901_008_ph_payment()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  PERFORM private.repair_tc_260901_008_ph_payment();
END;
$$;

DROP FUNCTION private.repair_tc_260901_008_ph_payment();
