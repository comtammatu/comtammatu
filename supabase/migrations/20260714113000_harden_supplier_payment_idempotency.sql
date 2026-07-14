BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.supplier_payments
  ADD COLUMN idempotency_key uuid,
  ADD CONSTRAINT supplier_payments_tenant_idempotency_key_key
    UNIQUE (tenant_id, idempotency_key);

COMMENT ON COLUMN public.supplier_payments.idempotency_key IS
  'Tenant-scoped payment intent key; NULL is retained only for historical rows.';

DROP FUNCTION public.create_supplier_payment(
  bigint,
  bigint,
  numeric,
  text,
  text
);

CREATE FUNCTION public.create_supplier_payment(
  p_tenant_id bigint,
  p_supplier_invoice_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference_note text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice public.supplier_invoices%ROWTYPE;
  v_existing record;
  v_payment_id bigint;
  v_new_paid numeric(15, 2);
  v_new_status text;
  v_reference_note text := NULLIF(pg_catalog.btrim(p_reference_note), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:ap_pay') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'supplier_payment_idempotency_key_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
    OR p_amount <= 0
    OR p_amount IS DISTINCT FROM pg_catalog.round(p_amount, 2)
  THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL
    OR p_payment_method NOT IN ('cash', 'bank_transfer')
  THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_tenant_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT
    payment.id,
    payment.supplier_invoice_id,
    payment.amount,
    payment.payment_method,
    payment.reference_note,
    payment.created_by,
    invoice.payment_status
  INTO v_existing
  FROM public.supplier_payments payment
  JOIN public.supplier_invoices invoice
    ON invoice.id = payment.supplier_invoice_id
   AND invoice.tenant_id = payment.tenant_id
  WHERE payment.tenant_id = p_tenant_id
    AND payment.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.supplier_invoice_id IS DISTINCT FROM p_supplier_invoice_id
      OR v_existing.amount IS DISTINCT FROM p_amount
      OR v_existing.payment_method IS DISTINCT FROM p_payment_method
      OR v_existing.reference_note IS DISTINCT FROM v_reference_note
      OR v_existing.created_by IS DISTINCT FROM v_uid
    THEN
      RAISE EXCEPTION 'supplier_payment_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'payment_id', v_existing.id,
      'payment_status', v_existing.payment_status,
      'replayed', true
    );
  END IF;

  SELECT invoice.*
  INTO v_invoice
  FROM public.supplier_invoices invoice
  WHERE invoice.id = p_supplier_invoice_id
    AND invoice.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.payment_status = 'paid' THEN
    RAISE EXCEPTION 'invoice_already_paid' USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.grn_id IS NULL THEN
    RAISE EXCEPTION 'invoice_missing_grn_for_payment' USING ERRCODE = '22023';
  END IF;

  IF v_invoice.matching_status <> 'matched' THEN
    RAISE EXCEPTION 'invoice_not_matched_for_payment' USING ERRCODE = '22023';
  END IF;

  v_new_paid := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  IF v_new_paid > v_invoice.total_amount THEN
    RAISE EXCEPTION 'payment_exceeds_invoice_total' USING ERRCODE = '22023';
  END IF;

  v_new_status := CASE
    WHEN v_new_paid >= v_invoice.total_amount THEN 'paid'
    ELSE 'partial'
  END;

  INSERT INTO public.supplier_payments (
    tenant_id,
    supplier_invoice_id,
    payment_method,
    amount,
    payment_date,
    reference_note,
    created_by,
    idempotency_key
  ) VALUES (
    p_tenant_id,
    p_supplier_invoice_id,
    p_payment_method,
    p_amount,
    now(),
    v_reference_note,
    v_uid,
    p_idempotency_key
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.supplier_invoices
  SET payment_status = v_new_status,
      paid_amount = v_new_paid,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = p_supplier_invoice_id
    AND tenant_id = p_tenant_id;

  RETURN pg_catalog.jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_new_status,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payment(
  bigint,
  bigint,
  numeric,
  text,
  uuid,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment(
  bigint,
  bigint,
  numeric,
  text,
  uuid,
  text
) TO authenticated, service_role;

COMMIT;
