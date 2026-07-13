CREATE OR REPLACE FUNCTION public.adjudicate_sepay_payment_conflict(
  p_event_id bigint,
  p_expected_order_id bigint,
  p_expected_request_id text,
  p_expected_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_event public.webhook_events%ROWTYPE;
  v_order record;
  v_amount numeric;
  v_event_memo text;
  v_normalized_payment_code text;
  v_original_role text := current_setting('request.jwt.claim.role', true);
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL
     OR v_tenant_id IS NULL
     OR NOT public.auth_is_owner(v_user_id)
     OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_event_id IS NULL
     OR p_event_id <= 0
     OR p_expected_order_id IS NULL
     OR p_expected_order_id <= 0
     OR NULLIF(btrim(COALESCE(p_expected_request_id, '')), '') IS NULL
     OR p_expected_amount IS NULL
     OR p_expected_amount <= 0
     OR trunc(p_expected_amount) <> p_expected_amount THEN
    RAISE EXCEPTION 'sepay_adjudication_invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT e.*
  INTO v_event
  FROM public.webhook_events e
  WHERE e.id = p_event_id
    AND e.tenant_id = v_tenant_id
    AND e.provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sepay_conflict_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.request_id IS DISTINCT FROM btrim(p_expected_request_id)
     OR COALESCE(v_event.payload ->> 'id', '') !~ '^[0-9]+$'
     OR v_event.payload ->> 'id' IS DISTINCT FROM v_event.request_id
     OR v_event.signature_valid IS DISTINCT FROM true
     OR lower(COALESCE(v_event.payload ->> 'transferType', '')) <> 'in'
     OR v_event.processing_status IS DISTINCT FROM 'processed'
     OR v_event.http_status IS DISTINCT FROM 200
     OR v_event.processed_at IS NULL
     OR v_event.payment_id IS NOT NULL
     OR v_event.expense_id IS NOT NULL
     OR v_event.order_id IS DISTINCT FROM p_expected_order_id
     OR v_event.error_code IS NULL
     OR v_event.error_code NOT IN (
       'payment_code_conflict_needs_review',
       'payment_method_conflict_needs_review'
     ) THEN
    RAISE EXCEPTION 'sepay_conflict_evidence_changed' USING ERRCODE = '23514';
  END IF;

  IF btrim(COALESCE(v_event.payload ->> 'transferAmount', ''))
       !~ '^-?[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'sepay_conflict_amount_invalid' USING ERRCODE = '22023';
  END IF;

  v_amount := abs((v_event.payload ->> 'transferAmount')::numeric);
  IF v_amount <> p_expected_amount THEN
    RAISE EXCEPTION 'sepay_conflict_amount_changed' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(p_expected_order_id);

  SELECT
    o.id,
    o.tenant_id,
    o.branch_id,
    o.total_amount,
    o.payment_code,
    o.payment_status,
    o.payment_method
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_expected_order_id
    AND o.tenant_id = v_tenant_id
    AND o.status <> 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sepay_conflict_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.total_amount <> v_amount THEN
    RAISE EXCEPTION 'sepay_conflict_order_amount_changed' USING ERRCODE = '23514';
  END IF;

  v_normalized_payment_code := upper(regexp_replace(
    COALESCE(v_order.payment_code, ''),
    '[^A-Za-z0-9]+',
    '',
    'g'
  ));
  v_event_memo := ' ' || upper(regexp_replace(
    concat_ws(
      ' ',
      v_event.payload ->> 'content',
      v_event.payload ->> 'description',
      v_event.payload ->> 'code'
    ),
    '[^A-Za-z0-9]+',
    ' ',
    'g'
  )) || ' ';

  IF v_normalized_payment_code !~ '^[A-Z][A-Z0-9]{15,49}$'
     OR position(
       ' ' || upper(regexp_replace(
         v_order.payment_code,
         '[^A-Za-z0-9]+',
         ' ',
         'g'
       )) || ' '
       IN v_event_memo
     ) = 0 THEN
    RAISE EXCEPTION 'sepay_conflict_payment_code_evidence_mismatch'
      USING ERRCODE = '23514';
  END IF;

  PERFORM p.id
  FROM public.payments p
  WHERE p.tenant_id = v_tenant_id
    AND p.order_id = v_order.id
  ORDER BY p.id
  FOR UPDATE;

  PERFORM pr.id
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_tenant_id
    AND pr.order_id = v_order.id
    AND pr.method = 'momo'
  ORDER BY pr.id
  FOR UPDATE;

  PERFORM e.id
  FROM public.webhook_events e
  JOIN public.payments p
    ON p.id = e.payment_id
   AND p.tenant_id = e.tenant_id
  WHERE e.tenant_id = v_tenant_id
    AND e.provider = 'momo'
    AND p.order_id = v_order.id
  ORDER BY e.id
  FOR UPDATE OF e;

  IF (v_order.payment_status = 'pending' AND v_order.payment_method = 'momo')
     OR EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.tenant_id = v_tenant_id
         AND p.order_id = v_order.id
         AND p.method = 'momo'
         AND p.status = 'pending'
     )
     OR EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       WHERE pr.tenant_id = v_tenant_id
         AND pr.order_id = v_order.id
         AND pr.method = 'momo'
         AND pr.status = 'momo_pending'
     ) THEN
    RAISE EXCEPTION 'momo_payment_pending' USING ERRCODE = '23514';
  END IF;

  IF (v_order.payment_status = 'paid' AND v_order.payment_method = 'momo')
     OR EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.tenant_id = v_tenant_id
         AND p.order_id = v_order.id
         AND p.method = 'momo'
         AND (
           p.status = 'completed'
           OR (
             p.provider_data ->> 'resultCode' IN ('0', '9000')
             AND NULLIF(btrim(COALESCE(
               p.provider_data ->> 'transactionId',
               ''
             )), '') IS NOT NULL
           )
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.self_order_payment_requests pr
       WHERE pr.tenant_id = v_tenant_id
         AND pr.order_id = v_order.id
         AND pr.method = 'momo'
         AND pr.status = 'completed'
     )
     OR EXISTS (
       SELECT 1
       FROM public.webhook_events e
       JOIN public.payments p
         ON p.id = e.payment_id
        AND p.tenant_id = e.tenant_id
       WHERE e.tenant_id = v_tenant_id
         AND e.provider = 'momo'
         AND e.signature_valid
         AND p.order_id = v_order.id
         AND e.payload ->> 'resultCode' IN ('0', '9000')
         AND NULLIF(btrim(COALESCE(
           e.payload ->> 'transactionId',
           ''
         )), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'momo_authoritative_success' USING ERRCODE = '23514';
  END IF;

  UPDATE public.webhook_events
  SET processing_status = 'received',
      http_status = NULL,
      error_code = NULL,
      processed_at = NULL
  WHERE id = v_event.id
    AND tenant_id = v_tenant_id;

  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT public.reconcile_sepay_order_evidence(
      v_event.id,
      v_order.payment_code
    )
    INTO v_result;
    PERFORM set_config(
      'request.jwt.claim.role',
      COALESCE(v_original_role, ''),
      true
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config(
      'request.jwt.claim.role',
      COALESCE(v_original_role, ''),
      true
    );
    RAISE;
  END;

  IF v_result ->> 'status' IS DISTINCT FROM 'matched' THEN
    RAISE EXCEPTION 'sepay_conflict_not_resolved'
      USING ERRCODE = '23514',
            DETAIL = jsonb_build_object(
              'status', v_result ->> 'status'
            )::text;
  END IF;

  PERFORM public.log_audit(
    'adjudicate_sepay_payment_conflict',
    'webhook_event',
    v_event.id,
    jsonb_build_object(
      'processing_status', v_event.processing_status,
      'error_code', v_event.error_code,
      'payment_id', v_event.payment_id
    ),
    jsonb_build_object(
      'processing_status', 'processed',
      'error_code', NULL,
      'payment_id', NULLIF(v_result ->> 'payment_id', '')::bigint,
      'order_id', v_order.id,
      'request_id', v_event.request_id,
      'amount', v_amount,
      'payment_code', v_order.payment_code
    )
  );

  RETURN v_result || jsonb_build_object(
    'adjudicated', true,
    'previous_error_code', v_event.error_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjudicate_sepay_payment_conflict(
  bigint,
  bigint,
  text,
  numeric
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjudicate_sepay_payment_conflict(
  bigint,
  bigint,
  text,
  numeric
) TO authenticated;
