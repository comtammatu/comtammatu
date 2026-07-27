CREATE OR REPLACE FUNCTION public.fetch_tax_invoice_issue_attention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden_finance_view' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', job.id,
        'order_id', job.order_id,
        'order_number', sales_order.order_number,
        'status', job.status,
        'provider_ref', invoice.provider_ref,
        'invoice_number', invoice.invoice_number,
        'last_error', job.last_error,
        'updated_at', job.updated_at,
        'payment_method', payment.method,
        'tax_invoice_id', job.tax_invoice_id
      ) ORDER BY job.updated_at DESC
    )
    FROM public.tax_invoice_issue_jobs job
    LEFT JOIN public.orders sales_order
      ON sales_order.id = job.order_id
      AND sales_order.tenant_id = job.tenant_id
    LEFT JOIN public.payments payment
      ON payment.id = job.payment_id
      AND payment.tenant_id = job.tenant_id
    LEFT JOIN public.tax_invoices invoice
      ON invoice.id = job.tax_invoice_id
      AND invoice.tenant_id = job.tenant_id
    WHERE job.tenant_id = v_tenant
      AND job.status IN ('blocked', 'reconcile_required')
  ), '[]'::jsonb);
END;
$$;
