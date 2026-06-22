-- correct_payment_method: owner-level fix for a wrongly-recorded payment method.
--
-- When a cashier records the wrong method (customer paid by transfer but "cash"
-- was tapped, etc.) the money is fine but the record + revenue-by-method reports
-- are wrong. Post-D020 there is no GL ledger, and the HĐĐT payment field is
-- hardcoded "TM/CK" (packages/shared/.../viettel-sinvoice.ts buildInvoiceBody),
-- so correcting the method is a pure record fix: UPDATE payments.method + audit.
-- No GL re-post, and an already-issued HĐĐT is unaffected.
--
-- Scope: completed payments only; new method must differ and satisfy the
-- payments_method_check constraint (cash|vietqr|momo). Branch-scoped
-- orders:refund_approve permission (owner-level correction — same gate as the
-- sibling refund flow). If the invoice itself is wrong, cancel/replace it
-- separately; this RPC never touches tax_invoices.

CREATE OR REPLACE FUNCTION public.correct_payment_method(p_payment_id bigint, p_new_method text, p_reason text)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor   uuid   := auth.uid();
  v_tenant  bigint := public.auth_tenant_id();
  v_payment RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_new_method IS NULL OR p_new_method NOT IN ('cash', 'vietqr', 'momo') THEN
    RAISE EXCEPTION 'invalid method: %', p_new_method USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, branch_id, status, method
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_payment.branch_id, 'orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed: status=%', v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.method = p_new_method THEN
    RAISE EXCEPTION 'method_unchanged: already %', p_new_method
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET method = p_new_method,
      updated_at = now()
  WHERE id = v_payment.id;

  PERFORM public.log_audit(
    'payment.method_correct',
    'payment',
    v_payment.id,
    jsonb_build_object('method', v_payment.method),
    jsonb_build_object('method', p_new_method, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'status',     'corrected',
    'payment_id', v_payment.id,
    'old_method', v_payment.method,
    'new_method', p_new_method
  );
END;
$$;

COMMENT ON FUNCTION public.correct_payment_method(p_payment_id bigint, p_new_method text, p_reason text) IS
  'Owner-level fix for a wrongly-recorded payment method (branch-scoped orders:refund_approve, completed-payment precondition, new<>old, audited). Pure record correction — post-D020 there is no GL and the HĐĐT payment field is hardcoded TM/CK, so an issued invoice is unaffected.';

REVOKE ALL ON FUNCTION public.correct_payment_method(p_payment_id bigint, p_new_method text, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.correct_payment_method(p_payment_id bigint, p_new_method text, p_reason text) FROM anon;
GRANT ALL ON FUNCTION public.correct_payment_method(p_payment_id bigint, p_new_method text, p_reason text) TO service_role;
GRANT ALL ON FUNCTION public.correct_payment_method(p_payment_id bigint, p_new_method text, p_reason text) TO authenticated;
