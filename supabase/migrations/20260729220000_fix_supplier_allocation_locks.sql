BEGIN;

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
  v_existing record;
  v_allocated numeric(15,2);
  v_result_status text := 'partial';
  v_single_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:ap_pay')
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> round(p_amount, 2)
     OR p_payment_method NOT IN ('cash', 'bank_transfer')
     OR jsonb_typeof(p_allocations) <> 'array' THEN
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
    FROM jsonb_array_elements(p_allocations) allocation
  ) <> jsonb_array_length(p_allocations) THEN
    RAISE EXCEPTION 'supplier_payment_invoice_duplicate'
      USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-payment:' || p_tenant_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT payment.*
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
       ) <> jsonb_array_length(p_allocations)
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_allocations) requested
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.supplier_payment_allocations allocation
           WHERE allocation.supplier_payment_id = v_existing.id
             AND allocation.tenant_id = p_tenant_id
             AND allocation.supplier_invoice_id =
               (requested.value->>'invoice_id')::bigint
             AND allocation.amount =
               (requested.value->>'amount')::numeric
         )
       ) THEN
      RAISE EXCEPTION 'supplier_payment_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'payment_id', v_existing.id,
      'payment_status', v_existing.idempotency_result_status,
      'unallocated_amount', v_existing.amount - COALESCE((
        SELECT sum(allocation.amount)
        FROM public.supplier_payment_allocations allocation
        WHERE allocation.supplier_payment_id = v_existing.id
          AND allocation.tenant_id = p_tenant_id
      ), 0)
    );
  END IF;

  SELECT COALESCE(sum((allocation.value->>'amount')::numeric), 0)
  INTO v_allocated
  FROM jsonb_array_elements(p_allocations) allocation;

  PERFORM 1
  FROM public.supplier_invoices invoice
  JOIN jsonb_array_elements(p_allocations) allocation
    ON invoice.id = (allocation.value->>'invoice_id')::bigint
  WHERE invoice.tenant_id = p_tenant_id
  ORDER BY invoice.id
  FOR UPDATE OF invoice;

  IF v_allocated > p_amount
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_allocations) allocation
       LEFT JOIN public.supplier_invoices invoice
         ON invoice.id = (allocation.value->>'invoice_id')::bigint
        AND invoice.tenant_id = p_tenant_id
       WHERE invoice.id IS NULL
          OR invoice.supplier_id IS DISTINCT FROM p_supplier_id
          OR (allocation.value->>'amount')::numeric <= 0
          OR invoice.matching_status <> 'matched'
          OR invoice.vat_invoice_attachment_path IS NULL
          OR (allocation.value->>'amount')::numeric >
            invoice.total_amount
              - invoice.paid_amount
              - invoice.credit_applied_amount
     ) THEN
    RAISE EXCEPTION 'supplier_payment_allocation_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN jsonb_array_length(p_allocations) = 1
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
    now(),
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
    amount
  )
  SELECT
    p_tenant_id,
    v_payment_id,
    (allocation.value->>'invoice_id')::bigint,
    (allocation.value->>'amount')::numeric(15,2)
  FROM jsonb_array_elements(p_allocations) allocation;

  WITH allocated AS (
    SELECT
      (allocation.value->>'invoice_id')::bigint AS invoice_id,
      sum((allocation.value->>'amount')::numeric(15,2)) AS amount
    FROM jsonb_array_elements(p_allocations) allocation
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
             >= invoice.total_amount THEN now()
        ELSE invoice.paid_at
      END,
      updated_at = now()
  FROM allocated
  WHERE invoice.id = allocated.invoice_id
    AND invoice.tenant_id = p_tenant_id;

  IF v_allocated = p_amount AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) allocation
    JOIN public.supplier_invoices invoice
      ON invoice.id = (allocation.value->>'invoice_id')::bigint
     AND invoice.tenant_id = p_tenant_id
    WHERE invoice.payment_status <> 'paid'
  ) THEN
    v_result_status := 'paid';
  END IF;

  UPDATE public.supplier_payments
  SET idempotency_result_status = v_result_status,
      updated_at = now()
  WHERE id = v_payment_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_result_status,
    'unallocated_amount', p_amount - v_allocated
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_supplier_credit_allocated(
  p_supplier_id bigint,
  p_credit_number text,
  p_amount numeric,
  p_notes text,
  p_allocations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_credit_id bigint;
  v_allocated numeric(15,2);
  v_single_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> round(p_amount, 2)
     OR btrim(p_credit_number) = ''
     OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'supplier_credit_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers supplier
    WHERE supplier.id = p_supplier_id
      AND supplier.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (
    SELECT count(DISTINCT (allocation.value->>'invoice_id')::bigint)
    FROM jsonb_array_elements(p_allocations) allocation
  ) <> jsonb_array_length(p_allocations) THEN
    RAISE EXCEPTION 'supplier_credit_invoice_duplicate'
      USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(sum((allocation.value->>'amount')::numeric), 0)
  INTO v_allocated
  FROM jsonb_array_elements(p_allocations) allocation;

  PERFORM 1
  FROM public.supplier_invoices invoice
  JOIN jsonb_array_elements(p_allocations) allocation
    ON invoice.id = (allocation.value->>'invoice_id')::bigint
  WHERE invoice.tenant_id = v_tenant
  ORDER BY invoice.id
  FOR UPDATE OF invoice;

  IF v_allocated > p_amount
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_allocations) allocation
       LEFT JOIN public.supplier_invoices invoice
         ON invoice.id = (allocation.value->>'invoice_id')::bigint
        AND invoice.tenant_id = v_tenant
       WHERE invoice.id IS NULL
          OR invoice.supplier_id IS DISTINCT FROM p_supplier_id
          OR (allocation.value->>'amount')::numeric <= 0
          OR (allocation.value->>'amount')::numeric >
            invoice.total_amount
              - invoice.paid_amount
              - invoice.credit_applied_amount
     ) THEN
    RAISE EXCEPTION 'supplier_credit_allocation_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN jsonb_array_length(p_allocations) = 1
    THEN (p_allocations->0->>'invoice_id')::bigint
    ELSE NULL
  END
  INTO v_single_invoice_id;

  INSERT INTO public.supplier_credit_notes (
    tenant_id,
    supplier_id,
    return_id,
    invoice_id,
    credit_number,
    kind,
    amount,
    status,
    applied_amount,
    notes,
    created_by,
    applied_at
  )
  VALUES (
    v_tenant,
    p_supplier_id,
    NULL,
    v_single_invoice_id,
    btrim(p_credit_number),
    'credit_note',
    p_amount,
    CASE WHEN v_allocated = p_amount THEN 'applied' ELSE 'open' END,
    v_allocated,
    NULLIF(btrim(p_notes), ''),
    v_uid,
    CASE WHEN v_allocated > 0 THEN now() ELSE NULL END
  )
  RETURNING id INTO v_credit_id;

  INSERT INTO public.supplier_credit_allocations (
    tenant_id,
    supplier_credit_note_id,
    supplier_invoice_id,
    amount
  )
  SELECT
    v_tenant,
    v_credit_id,
    (allocation.value->>'invoice_id')::bigint,
    (allocation.value->>'amount')::numeric(15,2)
  FROM jsonb_array_elements(p_allocations) allocation;

  WITH allocated AS (
    SELECT
      (allocation.value->>'invoice_id')::bigint AS invoice_id,
      sum((allocation.value->>'amount')::numeric(15,2)) AS amount
    FROM jsonb_array_elements(p_allocations) allocation
    GROUP BY (allocation.value->>'invoice_id')::bigint
  )
  UPDATE public.supplier_invoices invoice
  SET credit_applied_amount =
        invoice.credit_applied_amount + allocated.amount,
      payment_status = CASE
        WHEN invoice.paid_amount
           + invoice.credit_applied_amount
           + allocated.amount
             >= invoice.total_amount THEN 'paid'
        WHEN invoice.paid_amount > 0 THEN 'partial'
        ELSE invoice.payment_status
      END,
      updated_at = now()
  FROM allocated
  WHERE invoice.id = allocated.invoice_id
    AND invoice.tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'credit_id', v_credit_id,
    'unallocated_amount', p_amount - v_allocated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment_allocated(
  bigint, bigint, numeric, text, uuid, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_allocated(
  bigint, bigint, numeric, text, uuid, text, jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_credit_allocated(
  bigint, text, numeric, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_credit_allocated(
  bigint, text, numeric, text, jsonb
) TO authenticated, service_role;

COMMIT;
