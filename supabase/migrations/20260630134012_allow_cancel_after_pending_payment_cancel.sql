CREATE OR REPLACE FUNCTION public.order_payment_code_is_exposed(
  p_order_id bigint,
  p_tenant_id bigint,
  p_branch_id bigint,
  p_payment_code text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.payments p
     WHERE p.order_id = p_order_id
       AND p.tenant_id = p_tenant_id
       AND p.branch_id = p_branch_id
       AND p.method = 'vietqr'
       AND p.status = 'pending'
       AND p.provider_ref IS NOT NULL
       AND lower(p.provider_ref) = lower(p_payment_code)
  );
$$;

REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM authenticated;

COMMENT ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text)
IS 'Returns true only when a VietQR payment code still belongs to an active pending payment.';
