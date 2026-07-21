BEGIN;

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_for_payment(
  p_payment_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_request_payload jsonb;
  v_status text;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.method <> 'vietqr' AND v_payment.method <> 'cash' THEN
    RETURN;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_payment.order_id
    AND tenant_id = v_payment.tenant_id
    AND branch_id = v_payment.branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT request.invoice_payload INTO v_request_payload
  FROM public.self_order_payment_requests request
  WHERE request.tenant_id = v_payment.tenant_id
    AND request.branch_id = v_payment.branch_id
    AND request.order_id = v_payment.order_id
    AND request.payment_id = v_payment.id
    AND request.status IN ('cash_call', 'vietqr_pending', 'completed')
  ORDER BY request.id DESC
  LIMIT 1;

  v_payload := COALESCE(
    v_payment.provider_data -> 'invoiceSnapshot',
    v_payment.provider_data -> 'invoicePayload',
    v_request_payload
  );
  IF v_payload IS NULL THEN
    RETURN;
  END IF;

  IF v_payment.status NOT IN ('pending', 'completed')
    OR (
      v_payment.status = 'completed'
      AND (
        v_order.payment_status <> 'paid'
        OR v_order.status <> 'completed'
      )
    ) THEN
    RETURN;
  END IF;

  v_status := CASE
    WHEN v_payment.status = 'completed' THEN 'queued'
    ELSE 'pending_payment'
  END;

  PERFORM private.upsert_tax_invoice_issue_job(
    v_payment.tenant_id,
    v_payment.branch_id,
    v_payment.order_id,
    v_payment.id,
    v_payload,
    v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION private.sync_tax_invoice_issue_job_for_payment(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_tax_invoice_issue_job_for_payment(bigint)
  TO service_role;

COMMIT;
