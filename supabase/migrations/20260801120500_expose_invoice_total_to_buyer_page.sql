CREATE OR REPLACE FUNCTION public.get_invoice_buyer_request_as_system(
  p_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_request public.tax_invoice_buyer_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
  v_state text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.tax_invoice_buyer_requests request
  WHERE request.token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_request.order_id
    AND tenant_id = v_request.tenant_id;
  SELECT * INTO v_branch
  FROM public.branches
  WHERE id = v_request.branch_id
    AND tenant_id = v_request.tenant_id;
  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs
  WHERE tenant_id = v_request.tenant_id
    AND order_id = v_request.order_id;
  IF v_job.tax_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.tax_invoices
    WHERE id = v_job.tax_invoice_id
      AND tenant_id = v_request.tenant_id;
  END IF;

  v_state := CASE
    WHEN v_request.status = 'submitted' THEN 'submitted'
    WHEN v_request.status = 'expired' THEN 'expired'
    WHEN v_request.expires_at <= now() THEN 'expired'
    WHEN v_job.status = 'queued' AND v_invoice.status = 'draft' THEN 'open'
    ELSE 'closed'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'orderNumber', v_order.order_number,
    'branchName', v_branch.name,
    'totalAmount', v_order.total_amount,
    'expiresAt', v_request.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_buyer_request_as_system(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_buyer_request_as_system(text)
  TO service_role;
