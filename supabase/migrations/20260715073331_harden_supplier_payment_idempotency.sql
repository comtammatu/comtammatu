ALTER TABLE public.supplier_payments
ADD COLUMN idempotency_key uuid,
ADD COLUMN idempotency_result_status text,
ADD CONSTRAINT supplier_payments_idempotency_result_check CHECK (
  (idempotency_key IS NULL AND idempotency_result_status IS NULL)
  OR (
    idempotency_key IS NOT NULL
    AND idempotency_result_status IS NOT NULL
    AND idempotency_result_status IN ('partial', 'paid')
  )
);

COMMENT ON COLUMN public.supplier_payments.idempotency_key IS
  'Client-generated payment intent key. Unique within a tenant and immutable for an exact supplier-payment retry.';

COMMENT ON COLUMN public.supplier_payments.idempotency_result_status IS
  'Invoice payment status returned by the first successful execution of an idempotent supplier-payment intent.';

CREATE UNIQUE INDEX supplier_payments_tenant_id_idempotency_key_uidx
ON public.supplier_payments (tenant_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE FUNCTION public.record_supplier_payment(
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
  v_invoice record;
  v_existing record;
  v_payment_id bigint;
  v_new_paid numeric(15,2);
  v_credit_applied numeric(15,2);
  v_new_status text;
  v_reference_note text := NULLIF(pg_catalog.btrim(p_reference_note), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(v_uid)
    OR NOT public.has_permission_any('finance:ap_pay') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL
    OR p_payment_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_reference_note) > 500 THEN
    RAISE EXCEPTION 'reference_note_too_long' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-payment:'
        || p_tenant_id::text
        || ':'
        || p_idempotency_key::text,
      0
    )
  );

  SELECT sp.*
  INTO v_existing
  FROM public.supplier_payments AS sp
  WHERE sp.tenant_id = p_tenant_id
    AND sp.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.supplier_invoice_id IS DISTINCT FROM p_supplier_invoice_id
      OR v_existing.amount IS DISTINCT FROM p_amount
      OR v_existing.payment_method IS DISTINCT FROM p_payment_method
      OR v_existing.reference_note IS DISTINCT FROM v_reference_note
      OR v_existing.created_by IS DISTINCT FROM v_uid
      OR v_existing.idempotency_result_status IS NULL THEN
      RAISE EXCEPTION 'supplier_payment_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'payment_id', v_existing.id,
      'payment_status', v_existing.idempotency_result_status
    );
  END IF;

  SELECT si.*
  INTO v_invoice
  FROM public.supplier_invoices AS si
  WHERE si.id = p_supplier_invoice_id
    AND si.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_credit_applied := COALESCE(v_invoice.credit_applied_amount, 0);

  IF v_invoice.payment_status = 'paid'
    OR COALESCE(v_invoice.paid_amount, 0) + v_credit_applied
      >= v_invoice.total_amount THEN
    RAISE EXCEPTION 'invoice_already_paid' USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.grn_id IS NULL THEN
    RAISE EXCEPTION 'invoice_missing_grn_for_payment' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.id = v_invoice.grn_id
      AND grn.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'invoice_grn_tenant_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_invoice.matching_status <> 'matched' THEN
    RAISE EXCEPTION 'invoice_not_matched_for_payment' USING ERRCODE = '22023';
  END IF;

  v_new_paid := COALESCE(v_invoice.paid_amount, 0) + p_amount;

  IF v_new_paid + v_credit_applied > v_invoice.total_amount THEN
    RAISE EXCEPTION 'payment_exceeds_invoice_total' USING ERRCODE = '22023';
  END IF;

  v_new_status := CASE
    WHEN v_new_paid + v_credit_applied >= v_invoice.total_amount THEN 'paid'
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
    idempotency_key,
    idempotency_result_status
  ) VALUES (
    p_tenant_id,
    p_supplier_invoice_id,
    p_payment_method,
    p_amount,
    pg_catalog.now(),
    v_reference_note,
    v_uid,
    p_idempotency_key,
    v_new_status
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.supplier_invoices
  SET payment_status = v_new_status,
      paid_amount = v_new_paid,
      paid_at = CASE
        WHEN v_new_status = 'paid' THEN pg_catalog.now()
        ELSE paid_at
      END,
      updated_at = pg_catalog.now()
  WHERE id = p_supplier_invoice_id
    AND tenant_id = p_tenant_id;

  RETURN pg_catalog.jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment(
  bigint,
  bigint,
  numeric,
  text,
  uuid,
  text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(
  bigint,
  bigint,
  numeric,
  text,
  uuid,
  text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_payment(
  p_tenant_id bigint,
  p_supplier_invoice_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_reference_note text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  RETURN public.record_supplier_payment(
    p_tenant_id,
    p_supplier_invoice_id,
    p_amount,
    p_payment_method,
    pg_catalog.gen_random_uuid(),
    p_reference_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payment(
  bigint,
  bigint,
  numeric,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment(
  bigint,
  bigint,
  numeric,
  text,
  text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_credit_note_to_invoice(
  bigint,
  bigint,
  numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_note_to_invoice(
  bigint,
  bigint,
  numeric
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_ap_aging()
RETURNS TABLE(
  supplier_id bigint,
  supplier_name text,
  buckets jsonb,
  total_outstanding numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_today date;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(auth.uid())
    OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      si.supplier_id AS s_id,
      GREATEST(
        si.total_amount
          - COALESCE(si.paid_amount, 0)
          - COALESCE(si.credit_applied_amount, 0),
        0
      ) AS outstanding,
      CASE
        WHEN si.due_date IS NULL OR (v_today - si.due_date) <= 0 THEN 'current'
        WHEN (v_today - si.due_date) <= 30 THEN 'days_1_30'
        WHEN (v_today - si.due_date) <= 60 THEN 'days_31_60'
        WHEN (v_today - si.due_date) <= 90 THEN 'days_61_90'
        ELSE 'days_over_90'
      END AS bucket
    FROM public.supplier_invoices AS si
    WHERE si.tenant_id = v_tenant
      AND si.total_amount
        - COALESCE(si.paid_amount, 0)
        - COALESCE(si.credit_applied_amount, 0) > 0
  )
  SELECT
    a.s_id AS supplier_id,
    COALESCE(s.name, 'NCC #' || a.s_id) AS supplier_name,
    pg_catalog.jsonb_build_object(
      'current', pg_catalog.jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'current'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'current'), 0)
      ),
      'days_1_30', pg_catalog.jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_1_30'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_1_30'), 0)
      ),
      'days_31_60', pg_catalog.jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_31_60'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_31_60'), 0)
      ),
      'days_61_90', pg_catalog.jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_61_90'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_61_90'), 0)
      ),
      'days_over_90', pg_catalog.jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_over_90'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_over_90'), 0)
      )
    ) AS buckets,
    COALESCE(SUM(a.outstanding), 0) AS total_outstanding
  FROM scoped AS a
  LEFT JOIN public.suppliers AS s
    ON s.id = a.s_id
    AND s.tenant_id = v_tenant
  GROUP BY a.s_id, s.name
  ORDER BY COALESCE(SUM(a.outstanding), 0) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ap_aging()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ap_aging()
TO authenticated, service_role;
