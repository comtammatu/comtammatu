-- Corrective: 20260821044052 re-touched print_jobs.payload after enqueue so
-- attach_invoice_buyer_qr could stamp invoice_qr. That UPDATE hits
-- private.guard_print_job_evidence (print_job_evidence_immutable / 22023)
-- because receipt evidence is immutable once inserted.
--
-- Fix: after binding the HĐĐT snapshot / issue job, drop the premature
-- pending receipt (created before the tax job existed) and enqueue again so
-- invoice QR attaches on INSERT while the row is still mutable.

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
  v_print_job_id bigint;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_request_payload jsonb;
  v_receipt_res jsonb;
  v_cash_received numeric;
  v_cash_change numeric;
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
  v_print_job_id := NULLIF(v_result ->> 'print_job_id', '')::bigint;

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

  UPDATE public.payments
     SET provider_data = COALESCE(provider_data, '{}'::jsonb)
                         || jsonb_build_object('invoiceSnapshot', v_payload),
         updated_at = now()
   WHERE id = v_payment_id
     AND tenant_id = v_order.tenant_id;

  PERFORM private.upsert_tax_invoice_issue_job(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    v_payment_id,
    v_payload,
    'queued'
  );

  IF v_print_job_id IS NOT NULL THEN
    DELETE FROM public.print_jobs
     WHERE id = v_print_job_id
       AND tenant_id = v_order.tenant_id
       AND branch_id = v_order.branch_id
       AND order_id = v_order.id
       AND job_type = 'receipt'
       AND status = 'pending';

    v_cash_received := COALESCE(
      NULLIF(v_result ->> 'cash_received', '')::numeric,
      p_cash_received
    );
    v_cash_change := NULLIF(v_result ->> 'cash_change', '')::numeric;

    BEGIN
      v_receipt_res := public.enqueue_receipt_print(
        p_order_id,
        v_cash_received,
        v_cash_change
      );
      v_print_job_id := NULLIF(v_receipt_res ->> 'job_id', '')::bigint;
    EXCEPTION WHEN OTHERS THEN
      v_print_job_id := NULL;
      RAISE LOG
        '[confirm_cash_payment_with_invoice_binding] receipt re-enqueue skipped for order %: %',
        p_order_id,
        SQLERRM;
    END;
  END IF;

  RETURN v_result || jsonb_build_object(
    'tax_invoice_job_status', 'queued',
    'print_job_id', v_print_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cash_payment_with_invoice_binding(
  bigint, numeric, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_cash_payment_with_invoice_binding(
  bigint, numeric, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_platform_payment_with_invoice_binding(
  p_order_id bigint,
  p_invoice_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_payment_id bigint;
  v_print_job_id bigint;
  v_order public.orders%ROWTYPE;
  v_payload jsonb;
  v_receipt_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);
  v_result := public.confirm_platform_payment(p_order_id);
  v_payment_id := NULLIF(v_result ->> 'payment_id', '')::bigint;
  v_print_job_id := NULLIF(v_result ->> 'print_job_id', '')::bigint;

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

  UPDATE public.payments
     SET provider_data = COALESCE(provider_data, '{}'::jsonb)
                         || jsonb_build_object('invoiceSnapshot', v_payload),
         updated_at = now()
   WHERE id = v_payment_id
     AND tenant_id = v_order.tenant_id;

  PERFORM private.upsert_tax_invoice_issue_job(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id,
    v_payment_id,
    v_payload,
    'queued'
  );

  IF v_print_job_id IS NOT NULL THEN
    DELETE FROM public.print_jobs
     WHERE id = v_print_job_id
       AND tenant_id = v_order.tenant_id
       AND branch_id = v_order.branch_id
       AND order_id = v_order.id
       AND job_type = 'receipt'
       AND status = 'pending';

    BEGIN
      v_receipt_res := public.enqueue_receipt_print(p_order_id, NULL, NULL);
      v_print_job_id := NULLIF(v_receipt_res ->> 'job_id', '')::bigint;
    EXCEPTION WHEN OTHERS THEN
      v_print_job_id := NULL;
      RAISE LOG
        '[confirm_platform_payment_with_invoice_binding] receipt re-enqueue skipped for order %: %',
        p_order_id,
        SQLERRM;
    END;
  END IF;

  RETURN v_result || jsonb_build_object(
    'tax_invoice_job_status', 'queued',
    'print_job_id', v_print_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_platform_payment_with_invoice_binding(
  bigint, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_platform_payment_with_invoice_binding(
  bigint, jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_cash_payment_with_invoice_binding(bigint, numeric, jsonb) IS
  'Completes cash payment, queues HĐĐT, then re-enqueues the receipt so buyer invoice QR attaches on INSERT.';

COMMENT ON FUNCTION public.confirm_platform_payment_with_invoice_binding(bigint, jsonb) IS
  'Completes platform prepaid, queues HĐĐT, then re-enqueues the receipt so buyer invoice QR attaches on INSERT.';
