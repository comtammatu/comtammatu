CREATE OR REPLACE FUNCTION public.record_supplier_payment_allocated(
  p_tenant_id bigint,
  p_supplier_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference_note text,
  p_allocations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment_id bigint;
  v_existing public.supplier_payments%ROWTYPE;
  v_allocated numeric(15,2);
  v_advance numeric(15,2);
  v_result_status text := 'partial';
  v_single_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
       public.auth_is_owner(v_uid)
       OR public.has_position('accountant')
     )
     OR NOT public.has_permission_any('finance:ap_pay')
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'forbidden_supplier_payment' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> pg_catalog.round(p_amount, 2)
     OR p_payment_method NOT IN ('cash', 'bank_transfer')
     OR pg_catalog.jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'supplier_payment_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers supplier
    WHERE supplier.id = p_supplier_id
      AND supplier.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (
    SELECT count(DISTINCT (allocation.value->>'invoice_id')::bigint)
    FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
  ) <> pg_catalog.jsonb_array_length(p_allocations) THEN
    RAISE EXCEPTION 'supplier_payment_invoice_duplicate'
      USING ERRCODE = '23505';
  END IF;
  IF NOT public.auth_is_owner(v_uid)
     AND p_amount IS DISTINCT FROM (
       SELECT COALESCE(
         sum((allocation.value->>'amount')::numeric),
         0
       )::numeric(15,2)
       FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
     ) THEN
    RAISE EXCEPTION 'accountant_supplier_advance_forbidden'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-payment:' || p_tenant_id::text || ':'
        || p_idempotency_key::text,
      0
    )
  );

  SELECT *
  INTO v_existing
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.supplier_id IS DISTINCT FROM p_supplier_id
       OR v_existing.amount IS DISTINCT FROM p_amount
       OR v_existing.payment_method IS DISTINCT FROM p_payment_method
       OR v_existing.reference_note IS DISTINCT FROM
         NULLIF(btrim(p_reference_note), '')
       OR (
         SELECT count(*)
         FROM public.supplier_payment_allocations allocation
         WHERE allocation.supplier_payment_id = v_existing.id
           AND allocation.tenant_id = p_tenant_id
           AND allocation.allocation_intent_key = p_idempotency_key
       ) <> pg_catalog.jsonb_array_length(p_allocations)
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_array_elements(p_allocations) requested
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.supplier_payment_allocations allocation
           WHERE allocation.supplier_payment_id = v_existing.id
             AND allocation.tenant_id = p_tenant_id
             AND allocation.allocation_intent_key = p_idempotency_key
             AND allocation.supplier_invoice_id =
               (requested.value->>'invoice_id')::bigint
             AND allocation.amount =
               (requested.value->>'amount')::numeric
         )
       ) THEN
      RAISE EXCEPTION 'supplier_payment_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(allocation.amount), 0)
    INTO v_allocated
    FROM public.supplier_payment_allocations allocation
    WHERE allocation.supplier_payment_id = v_existing.id
      AND allocation.tenant_id = p_tenant_id
      AND allocation.allocation_intent_key = p_idempotency_key;

    RETURN pg_catalog.jsonb_build_object(
      'payment_id', v_existing.id,
      'payment_status', v_existing.idempotency_result_status,
      'allocated_amount', v_allocated,
      'advance_amount', v_existing.amount - v_allocated
    );
  END IF;

  SELECT COALESCE(sum((allocation.value->>'amount')::numeric), 0)
  INTO v_allocated
  FROM pg_catalog.jsonb_array_elements(p_allocations) allocation;
  v_allocated := v_allocated::numeric(15,2);

  PERFORM 1
  FROM public.supplier_invoices invoice
  JOIN pg_catalog.jsonb_array_elements(p_allocations) allocation
    ON invoice.id = (allocation.value->>'invoice_id')::bigint
  WHERE invoice.tenant_id = p_tenant_id
  ORDER BY invoice.id
  FOR UPDATE OF invoice;

  IF v_allocated > p_amount
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
       LEFT JOIN public.supplier_invoices invoice
         ON invoice.id = (allocation.value->>'invoice_id')::bigint
        AND invoice.tenant_id = p_tenant_id
       WHERE invoice.id IS NULL
          OR invoice.supplier_id IS DISTINCT FROM p_supplier_id
          OR (allocation.value->>'amount')::numeric <= 0
          OR (allocation.value->>'amount')::numeric
            <> pg_catalog.round(
              (allocation.value->>'amount')::numeric,
              2
            )
          OR invoice.matching_status <> 'matched'
          OR invoice.vat_invoice_attachment_path IS NULL
          OR btrim(invoice.vat_invoice_attachment_path) = ''
          OR (
            invoice.invoice_kind = 'service'
            AND invoice.service_verified_at IS NULL
          )
          OR (
            invoice.invoice_kind = 'goods'
            AND (
              NOT EXISTS (
                SELECT 1
                FROM public.supplier_invoice_receipt_allocations receipt
                WHERE receipt.tenant_id = p_tenant_id
                  AND receipt.supplier_invoice_id = invoice.id
              )
              OR EXISTS (
                SELECT 1
                FROM public.supplier_invoice_receipt_allocations receipt
                LEFT JOIN public.goods_received_notes grn
                  ON grn.id = receipt.grn_id
                 AND grn.tenant_id = receipt.tenant_id
                LEFT JOIN public.purchase_orders purchase_order
                  ON purchase_order.id = receipt.po_id
                 AND purchase_order.tenant_id = receipt.tenant_id
                WHERE receipt.tenant_id = p_tenant_id
                  AND receipt.supplier_invoice_id = invoice.id
                  AND (
                    grn.id IS NULL
                    OR grn.status <> 'confirmed'
                    OR grn.po_id IS DISTINCT FROM receipt.po_id
                    OR purchase_order.supplier_id
                      IS DISTINCT FROM invoice.supplier_id
                  )
              )
            )
          )
          OR (allocation.value->>'amount')::numeric >
            invoice.total_amount
              - invoice.paid_amount
              - invoice.credit_applied_amount
     ) THEN
    RAISE EXCEPTION 'supplier_payment_allocation_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN pg_catalog.jsonb_array_length(p_allocations) = 1
    THEN (p_allocations->0->>'invoice_id')::bigint
    ELSE NULL
  END
  INTO v_single_invoice_id;

  INSERT INTO public.supplier_payments (
    tenant_id,
    supplier_id,
    supplier_invoice_id,
    payment_method,
    amount,
    payment_date,
    reference_note,
    created_by,
    idempotency_key,
    idempotency_result_status
  )
  VALUES (
    p_tenant_id,
    p_supplier_id,
    v_single_invoice_id,
    p_payment_method,
    p_amount,
    pg_catalog.now(),
    NULLIF(btrim(p_reference_note), ''),
    v_uid,
    p_idempotency_key,
    'partial'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.supplier_payment_allocations (
    tenant_id,
    supplier_payment_id,
    supplier_invoice_id,
    amount,
    allocation_intent_key
  )
  SELECT
    p_tenant_id,
    v_payment_id,
    (allocation.value->>'invoice_id')::bigint,
    (allocation.value->>'amount')::numeric(15,2),
    p_idempotency_key
  FROM pg_catalog.jsonb_array_elements(p_allocations) allocation;

  WITH allocated AS (
    SELECT
      (allocation.value->>'invoice_id')::bigint AS invoice_id,
      sum((allocation.value->>'amount')::numeric(15,2)) AS amount
    FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
    GROUP BY (allocation.value->>'invoice_id')::bigint
  )
  UPDATE public.supplier_invoices invoice
  SET paid_amount = invoice.paid_amount + allocated.amount,
      payment_status = CASE
        WHEN invoice.paid_amount
           + allocated.amount
           + invoice.credit_applied_amount
             >= invoice.total_amount THEN 'paid'
        ELSE 'partial'
      END,
      paid_at = CASE
        WHEN invoice.paid_amount
           + allocated.amount
           + invoice.credit_applied_amount
             >= invoice.total_amount THEN pg_catalog.now()
        ELSE invoice.paid_at
      END,
      updated_at = pg_catalog.now()
  FROM allocated
  WHERE invoice.id = allocated.invoice_id
    AND invoice.tenant_id = p_tenant_id;

  v_advance := (p_amount - v_allocated)::numeric(15,2);
  IF v_advance = 0
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
       JOIN public.supplier_invoices invoice
         ON invoice.id = (allocation.value->>'invoice_id')::bigint
        AND invoice.tenant_id = p_tenant_id
       WHERE invoice.payment_status <> 'paid'
     ) THEN
    v_result_status := 'paid';
  END IF;

  UPDATE public.supplier_payments
  SET idempotency_result_status = v_result_status,
      updated_at = pg_catalog.now()
  WHERE id = v_payment_id
    AND tenant_id = p_tenant_id;

  PERFORM public.log_audit(
    'supplier_payment.recorded',
    'supplier_payment',
    v_payment_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'supplier_id', p_supplier_id,
      'amount', p_amount,
      'allocated_amount', v_allocated,
      'advance_amount', v_advance,
      'payment_method', p_payment_method
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_result_status,
    'allocated_amount', v_allocated,
    'advance_amount', v_advance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment_allocated(
  bigint, bigint, numeric, text, uuid, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_allocated(
  bigint, bigint, numeric, text, uuid, text, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_tenant_id bigint,
  p_supplier_invoice_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference_note text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_supplier_id bigint;
  v_outstanding numeric(15,2);
  v_allocations jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
       public.auth_is_owner(v_uid)
       OR public.has_position('accountant')
     )
     OR NOT public.has_permission_any('finance:ap_pay')
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'forbidden_supplier_payment' USING ERRCODE = '42501';
  END IF;

  SELECT
    payment.supplier_id,
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'invoice_id', allocation.supplier_invoice_id,
        'amount', allocation.amount
      )
      ORDER BY allocation.id
    )
  INTO v_supplier_id, v_allocations
  FROM public.supplier_payments payment
  JOIN public.supplier_payment_allocations allocation
    ON allocation.supplier_payment_id = payment.id
   AND allocation.tenant_id = payment.tenant_id
   AND allocation.allocation_intent_key = p_idempotency_key
  WHERE payment.tenant_id = p_tenant_id
    AND payment.idempotency_key = p_idempotency_key
  GROUP BY payment.supplier_id;

  IF v_allocations IS NULL THEN
    SELECT
      invoice.supplier_id,
      invoice.total_amount
        - invoice.paid_amount
        - invoice.credit_applied_amount
    INTO v_supplier_id, v_outstanding
    FROM public.supplier_invoices invoice
    WHERE invoice.id = p_supplier_invoice_id
      AND invoice.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_outstanding <= 0 THEN
      RAISE EXCEPTION 'invoice_already_paid' USING ERRCODE = 'P0001';
    END IF;

    v_allocations := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'invoice_id', p_supplier_invoice_id,
        'amount', LEAST(p_amount, v_outstanding)
      )
    );
  END IF;

  RETURN public.record_supplier_payment_allocated(
    p_tenant_id,
    v_supplier_id,
    p_amount,
    p_payment_method,
    p_idempotency_key,
    p_reference_note,
    v_allocations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment(
  bigint, bigint, numeric, text, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(
  bigint, bigint, numeric, text, uuid, text
) TO authenticated, service_role;
