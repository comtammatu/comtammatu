BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_cash_payment_with_invoice_binding(
  p_order_id bigint,
  p_cash_received numeric,
  p_invoice_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_payment_id bigint;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_request_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);
  v_result := public.confirm_cash_payment_with_invoice_binding(
    p_order_id,
    p_cash_received
  );
  v_payment_id := NULLIF(v_result ->> 'payment_id', '')::bigint;

  IF v_result ->> 'status' NOT IN ('completed', 'already_completed')
    OR v_payment_id IS NULL THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT request.invoice_payload INTO v_request_payload
  FROM public.self_order_payment_requests request
  WHERE request.tenant_id = v_order.tenant_id
    AND request.branch_id = v_order.branch_id
    AND request.order_id = v_order.id
    AND request.payment_id = v_payment_id
    AND request.status = 'completed'
  ORDER BY request.id DESC
  LIMIT 1;

  v_payload := COALESCE(v_request_payload, v_payload);

  PERFORM private.upsert_tax_invoice_issue_job(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    v_payment_id,
    v_payload,
    'queued'
  );

  RETURN v_result || jsonb_build_object('tax_invoice_job_status', 'queued');
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cash_payment_with_invoice_binding(
  bigint, numeric, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_cash_payment_with_invoice_binding(
  bigint, numeric, jsonb
) TO authenticated, service_role;

COMMIT;
