BEGIN;

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS invoice_kind text NOT NULL DEFAULT 'goods',
  ADD COLUMN IF NOT EXISTS service_verified_by uuid
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS service_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_verification_reason text,
  ADD COLUMN IF NOT EXISTS matching_expected_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS matching_received_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS matching_difference_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS matching_reason_code text;

ALTER TABLE public.supplier_invoices
  ADD CONSTRAINT supplier_invoices_invoice_kind_check
    CHECK (invoice_kind IN ('goods', 'service')),
  ADD CONSTRAINT supplier_invoices_service_verification_check
    CHECK (
      (
        service_verified_by IS NULL
        AND service_verified_at IS NULL
        AND service_verification_reason IS NULL
      )
      OR (
        invoice_kind = 'service'
        AND service_verified_by IS NOT NULL
        AND service_verified_at IS NOT NULL
        AND char_length(btrim(service_verification_reason)) >= 5
      )
    );

ALTER TABLE public.supplier_payment_allocations
  ADD COLUMN IF NOT EXISTS allocation_intent_key uuid;

UPDATE public.supplier_payment_allocations allocation
SET allocation_intent_key = COALESCE(
  payment.idempotency_key,
  pg_catalog.gen_random_uuid()
)
FROM public.supplier_payments payment
WHERE payment.id = allocation.supplier_payment_id
  AND payment.tenant_id = allocation.tenant_id
  AND allocation.allocation_intent_key IS NULL;

ALTER TABLE public.supplier_payment_allocations
  ALTER COLUMN allocation_intent_key SET NOT NULL;

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT constraint_row.conname
  INTO v_constraint_name
  FROM pg_catalog.pg_constraint constraint_row
  WHERE constraint_row.conrelid =
      'public.supplier_payment_allocations'::regclass
    AND constraint_row.contype = 'u'
    AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
      'UNIQUE (supplier_payment_id, supplier_invoice_id)';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.supplier_payment_allocations DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;
END;
$$;

CREATE UNIQUE INDEX supplier_payment_allocations_intent_invoice_uidx
  ON public.supplier_payment_allocations (
    tenant_id,
    allocation_intent_key,
    supplier_invoice_id
  );

COMMENT ON COLUMN public.supplier_invoices.invoice_kind IS
  'goods invoices match confirmed receipt allocations; service invoices require manual document verification.';
COMMENT ON COLUMN public.supplier_payment_allocations.allocation_intent_key IS
  'Idempotency key for one append-only payment-allocation intent.';

CREATE OR REPLACE FUNCTION private.apply_supplier_invoice_matching(
  p_invoice_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.supplier_invoices%ROWTYPE;
  v_receipt_count integer := 0;
  v_invalid_count integer := 0;
  v_unconfirmed_count integer := 0;
  v_expected numeric(15,2);
  v_received numeric(15,2);
  v_difference numeric(15,2);
  v_status text;
  v_reason text;
  v_notes text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.supplier_invoices
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.invoice_kind = 'service' THEN
    IF EXISTS (
      SELECT 1
      FROM public.supplier_invoice_receipt_allocations allocation
      WHERE allocation.tenant_id = v_tenant
        AND allocation.supplier_invoice_id = p_invoice_id
    ) THEN
      RAISE EXCEPTION 'service_invoice_receipts_forbidden'
        USING ERRCODE = '23514';
    END IF;

    v_status := CASE
      WHEN v_invoice.service_verified_at IS NULL THEN 'pending'
      ELSE 'matched'
    END;
    v_reason := CASE
      WHEN v_invoice.service_verified_at IS NULL
        THEN 'service_verification_required'
      ELSE 'service_verified'
    END;
    v_notes := CASE
      WHEN v_invoice.service_verified_at IS NULL
        THEN 'Hóa đơn dịch vụ chờ xác minh chứng từ.'
      ELSE 'Hóa đơn dịch vụ đã được xác minh chứng từ.'
    END;

    UPDATE public.supplier_invoices
    SET matching_status = v_status,
        matching_expected_amount = subtotal + document_discount_amount,
        matching_received_amount = NULL,
        matching_difference_amount = NULL,
        matching_reason_code = v_reason,
        matching_notes = v_notes,
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id
      AND tenant_id = v_tenant;

    RETURN pg_catalog.jsonb_build_object(
      'invoice_id', p_invoice_id,
      'matching_status', v_status,
      'reason', v_reason,
      'expected_amount', v_invoice.subtotal
        + v_invoice.document_discount_amount,
      'received_amount', NULL,
      'difference_amount', NULL
    );
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE grn.id IS NULL
         OR purchase_order.id IS NULL
         OR grn.po_id IS DISTINCT FROM allocation.po_id
         OR purchase_order.supplier_id IS DISTINCT FROM v_invoice.supplier_id
    ),
    count(*) FILTER (
      WHERE grn.id IS NOT NULL
        AND grn.status <> 'confirmed'
    )
  INTO v_receipt_count, v_invalid_count, v_unconfirmed_count
  FROM public.supplier_invoice_receipt_allocations allocation
  LEFT JOIN public.goods_received_notes grn
    ON grn.id = allocation.grn_id
   AND grn.tenant_id = allocation.tenant_id
  LEFT JOIN public.purchase_orders purchase_order
    ON purchase_order.id = allocation.po_id
   AND purchase_order.tenant_id = allocation.tenant_id
  WHERE allocation.tenant_id = v_tenant
    AND allocation.supplier_invoice_id = p_invoice_id;

  v_expected := (
    v_invoice.subtotal + v_invoice.document_discount_amount
  )::numeric(15,2);

  IF v_receipt_count = 0 THEN
    v_status := 'pending';
    v_reason := 'goods_receipts_required';
    v_received := NULL;
    v_difference := NULL;
    v_notes := 'Hóa đơn hàng hóa chưa liên kết phiếu nhập đã xác nhận.';
  ELSIF v_invalid_count > 0 THEN
    v_status := 'discrepancy';
    v_reason := 'receipt_supplier_or_po_mismatch';
    v_received := NULL;
    v_difference := NULL;
    v_notes := 'Phiếu nhập hoặc đơn mua không khớp nhà cung cấp.';
  ELSIF v_unconfirmed_count > 0 THEN
    v_status := 'pending';
    v_reason := 'receipt_not_confirmed';
    v_received := NULL;
    v_difference := NULL;
    v_notes := 'Có phiếu nhập chưa được xác nhận.';
  ELSE
    SELECT COALESCE(
      sum(
        grn_item.po_applied_quantity
          * COALESCE(purchase_order_item.unit_price_est, 0)
      ),
      0
    )::numeric(15,2)
    INTO v_received
    FROM public.supplier_invoice_receipt_allocations allocation
    JOIN public.grn_items grn_item
      ON grn_item.grn_id = allocation.grn_id
     AND grn_item.tenant_id = allocation.tenant_id
    JOIN public.purchase_order_items purchase_order_item
      ON purchase_order_item.id = grn_item.purchase_order_item_id
     AND purchase_order_item.tenant_id = grn_item.tenant_id
     AND purchase_order_item.po_id = allocation.po_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.supplier_invoice_id = p_invoice_id;

    v_difference := (v_expected - v_received)::numeric(15,2);
    v_status := CASE
      WHEN pg_catalog.abs(v_difference) <= 1 THEN 'matched'
      ELSE 'discrepancy'
    END;
    v_reason := CASE
      WHEN pg_catalog.abs(v_difference) <= 1
        THEN 'goods_value_within_one_vnd'
      ELSE 'goods_value_difference'
    END;
    v_notes := CASE
      WHEN pg_catalog.abs(v_difference) <= 1
        THEN 'Giá trị hóa đơn khớp phần nhận theo PO trong dung sai 1đ.'
      ELSE 'Chênh lệch giá trị đối chiếu: ' || v_difference::text
    END;
  END IF;

  UPDATE public.supplier_invoices
  SET matching_status = v_status,
      matching_expected_amount = v_expected,
      matching_received_amount = v_received,
      matching_difference_amount = v_difference,
      matching_reason_code = v_reason,
      matching_notes = v_notes,
      discrepancy_accepted_by = CASE
        WHEN v_status = 'discrepancy' THEN NULL
        ELSE discrepancy_accepted_by
      END,
      discrepancy_accepted_at = CASE
        WHEN v_status = 'discrepancy' THEN NULL
        ELSE discrepancy_accepted_at
      END,
      discrepancy_reason = CASE
        WHEN v_status = 'discrepancy' THEN NULL
        ELSE discrepancy_reason
      END,
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', v_status,
    'reason', v_reason,
    'expected_amount', v_expected,
    'received_amount', v_received,
    'difference_amount', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION private.apply_supplier_invoice_matching(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.apply_supplier_invoice_matching(bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_matching(
  p_invoice_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_old jsonb;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'matching_status', invoice.matching_status,
    'matching_reason_code', invoice.matching_reason_code,
    'matching_difference_amount', invoice.matching_difference_amount
  )
  INTO v_old
  FROM public.supplier_invoices invoice
  WHERE invoice.id = p_invoice_id
    AND invoice.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_result := private.apply_supplier_invoice_matching(p_invoice_id);

  PERFORM public.log_audit(
    'supplier_invoice.matching_recomputed',
    'supplier_invoice',
    p_invoice_id,
    v_old,
    v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_invoice_matching(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_invoice_with_allocations(
  p_supplier_id bigint,
  p_invoice_number text,
  p_invoice_date date,
  p_vat_breakdown jsonb,
  p_matching_notes text,
  p_due_date date,
  p_document_discount_amount numeric,
  p_receipts jsonb,
  p_invoice_kind text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_receipt_count integer := COALESCE(
    pg_catalog.jsonb_array_length(p_receipts),
    0
  );
  v_first_receipt jsonb;
  v_invoice_id bigint;
  v_bucket jsonb;
  v_bucket_index integer := 0;
  v_bucket_count integer := COALESCE(
    pg_catalog.jsonb_array_length(p_vat_breakdown),
    0
  );
  v_taxable_total numeric(15,2);
  v_bucket_taxable numeric(15,2);
  v_discount numeric(15,2) :=
    COALESCE(p_document_discount_amount, 0)::numeric(15,2);
  v_allocated_discount numeric(15,2);
  v_remaining_discount numeric(15,2);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_invoice_kind NOT IN ('goods', 'service')
     OR pg_catalog.jsonb_typeof(p_receipts) <> 'array'
     OR pg_catalog.jsonb_typeof(p_vat_breakdown) <> 'array'
     OR v_bucket_count = 0
     OR v_discount < 0 THEN
    RAISE EXCEPTION 'supplier_invoice_allocations_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_invoice_kind = 'goods' AND v_receipt_count = 0 THEN
    RAISE EXCEPTION 'goods_invoice_receipts_required'
      USING ERRCODE = '23514';
  END IF;
  IF p_invoice_kind = 'service' AND v_receipt_count <> 0 THEN
    RAISE EXCEPTION 'service_invoice_receipts_forbidden'
      USING ERRCODE = '23514';
  END IF;

  IF v_receipt_count > 0 AND (
    SELECT count(DISTINCT (receipt.value->>'grn_id')::bigint)
    FROM pg_catalog.jsonb_array_elements(p_receipts) receipt
  ) <> v_receipt_count THEN
    RAISE EXCEPTION 'supplier_invoice_receipt_duplicate'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_receipts) receipt
    LEFT JOIN public.goods_received_notes grn
      ON grn.id = (receipt.value->>'grn_id')::bigint
     AND grn.tenant_id = v_tenant
    LEFT JOIN public.purchase_orders purchase_order
      ON purchase_order.id = (receipt.value->>'po_id')::bigint
     AND purchase_order.tenant_id = v_tenant
    WHERE grn.id IS NULL
       OR grn.status <> 'confirmed'
       OR grn.po_id IS DISTINCT FROM purchase_order.id
       OR purchase_order.supplier_id IS DISTINCT FROM p_supplier_id
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_receipt_mismatch'
      USING ERRCODE = '23514';
  END IF;

  v_first_receipt := p_receipts->0;
  v_invoice_id := public.create_supplier_invoice_with_vat_breakdown(
    p_supplier_id,
    CASE
      WHEN v_first_receipt IS NULL THEN NULL
      ELSE (v_first_receipt->>'grn_id')::bigint
    END,
    CASE
      WHEN v_first_receipt IS NULL THEN NULL
      ELSE (v_first_receipt->>'po_id')::bigint
    END,
    p_invoice_number,
    p_invoice_date,
    p_vat_breakdown,
    p_matching_notes,
    p_due_date
  );

  SELECT COALESCE(
    sum((bucket.value->>'taxable_amount')::numeric),
    0
  )
  INTO v_taxable_total
  FROM pg_catalog.jsonb_array_elements(p_vat_breakdown) bucket;

  IF v_taxable_total <= 0 THEN
    RAISE EXCEPTION 'supplier_invoice_vat_breakdown_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_remaining_discount := v_discount;
  FOR v_bucket IN
    SELECT bucket.value
    FROM pg_catalog.jsonb_array_elements(p_vat_breakdown)
      WITH ORDINALITY bucket(value, ord)
    ORDER BY bucket.ord
  LOOP
    v_bucket_index := v_bucket_index + 1;
    v_bucket_taxable :=
      (v_bucket->>'taxable_amount')::numeric(15,2);
    v_allocated_discount := CASE
      WHEN v_bucket_index = v_bucket_count THEN v_remaining_discount
      ELSE pg_catalog.round(
        v_discount * v_bucket_taxable / v_taxable_total,
        2
      )
    END;
    v_remaining_discount := v_remaining_discount - v_allocated_discount;

    INSERT INTO public.supplier_invoice_lines (
      tenant_id,
      supplier_invoice_id,
      description,
      quantity,
      unit_price,
      line_discount_amount,
      allocated_document_discount,
      line_total
    )
    VALUES (
      v_tenant,
      v_invoice_id,
      'Thuế suất ' || (v_bucket->>'vat_rate') || '%',
      1,
      v_bucket_taxable + v_allocated_discount,
      0,
      v_allocated_discount,
      v_bucket_taxable
    );
  END LOOP;

  UPDATE public.supplier_invoices
  SET invoice_kind = p_invoice_kind,
      document_discount_amount = v_discount,
      updated_at = pg_catalog.now()
  WHERE id = v_invoice_id
    AND tenant_id = v_tenant;

  INSERT INTO public.supplier_invoice_receipt_allocations (
    tenant_id,
    supplier_invoice_id,
    grn_id,
    po_id,
    billed_quantity,
    matched_quantity
  )
  SELECT
    v_tenant,
    v_invoice_id,
    (receipt.value->>'grn_id')::bigint,
    (receipt.value->>'po_id')::bigint,
    0,
    0
  FROM pg_catalog.jsonb_array_elements(p_receipts) receipt;

  v_result := private.apply_supplier_invoice_matching(v_invoice_id);

  PERFORM public.log_audit(
    'supplier_invoice.created',
    'supplier_invoice',
    v_invoice_id,
    NULL,
    v_result || pg_catalog.jsonb_build_object(
      'invoice_kind', p_invoice_kind,
      'supplier_id', p_supplier_id,
      'receipt_count', v_receipt_count
    )
  );

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_supplier_invoice_with_allocations(
  p_supplier_id bigint,
  p_invoice_number text,
  p_invoice_date date,
  p_vat_breakdown jsonb,
  p_matching_notes text,
  p_due_date date,
  p_document_discount_amount numeric,
  p_receipts jsonb
) RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT public.create_supplier_invoice_with_allocations(
    p_supplier_id,
    p_invoice_number,
    p_invoice_date,
    p_vat_breakdown,
    p_matching_notes,
    p_due_date,
    p_document_discount_amount,
    p_receipts,
    'goods'
  );
$$;

REVOKE ALL ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_service_supplier_invoice(
  p_invoice_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.supplier_invoices%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL
     OR char_length(btrim(p_reason)) < 5
     OR char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'service_verification_reason_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.supplier_invoices
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.invoice_kind <> 'service'
     OR v_invoice.matching_status <> 'pending'
     OR EXISTS (
       SELECT 1
       FROM public.supplier_invoice_receipt_allocations allocation
       WHERE allocation.tenant_id = v_tenant
         AND allocation.supplier_invoice_id = p_invoice_id
     ) THEN
    RAISE EXCEPTION 'service_invoice_verification_invalid'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.supplier_invoices
  SET service_verified_by = v_uid,
      service_verified_at = pg_catalog.now(),
      service_verification_reason = btrim(p_reason),
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant;

  v_result := private.apply_supplier_invoice_matching(p_invoice_id);

  PERFORM public.log_audit(
    'supplier_invoice.service_verified',
    'supplier_invoice',
    p_invoice_id,
    pg_catalog.jsonb_build_object(
      'matching_status', v_invoice.matching_status
    ),
    v_result || pg_catalog.jsonb_build_object(
      'reason', btrim(p_reason)
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_service_supplier_invoice(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_service_supplier_invoice(bigint, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_supplier_invoice_discrepancy(
  p_invoice_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.supplier_invoices%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL
     OR char_length(btrim(p_reason)) < 5
     OR char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'discrepancy_reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.supplier_invoices
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.invoice_kind <> 'goods'
     OR v_invoice.matching_status <> 'discrepancy' THEN
    RAISE EXCEPTION 'invoice_not_discrepant' USING ERRCODE = '23514';
  END IF;

  UPDATE public.supplier_invoices
  SET matching_status = 'matched',
      discrepancy_accepted_by = v_uid,
      discrepancy_accepted_at = pg_catalog.now(),
      discrepancy_reason = btrim(p_reason),
      matching_reason_code = 'goods_difference_accepted',
      matching_notes = pg_catalog.concat_ws(
        E'\n',
        NULLIF(btrim(matching_notes), ''),
        'Chấp nhận chênh lệch: ' || btrim(p_reason)
      ),
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'supplier_invoice.discrepancy_accepted',
    'supplier_invoice',
    p_invoice_id,
    pg_catalog.jsonb_build_object(
      'matching_status', v_invoice.matching_status,
      'difference_amount', v_invoice.matching_difference_amount
    ),
    pg_catalog.jsonb_build_object(
      'matching_status', 'matched',
      'reason', btrim(p_reason)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', 'matched',
    'reason', 'goods_difference_accepted',
    'difference_amount', v_invoice.matching_difference_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_supplier_invoice_discrepancy(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_supplier_invoice_discrepancy(bigint, text)
  TO authenticated, service_role;

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
  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:ap_pay')
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
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
  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:ap_pay')
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.allocate_supplier_advance(
  p_payment_id bigint,
  p_idempotency_key uuid,
  p_allocations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_payment public.supplier_payments%ROWTYPE;
  v_allocated numeric(15,2);
  v_available numeric(15,2);
  v_remaining numeric(15,2);
  v_result_status text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:ap_pay') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR pg_catalog.jsonb_typeof(p_allocations) <> 'array'
     OR pg_catalog.jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'supplier_advance_allocation_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(DISTINCT (allocation.value->>'invoice_id')::bigint)
    FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
  ) <> pg_catalog.jsonb_array_length(p_allocations) THEN
    RAISE EXCEPTION 'supplier_advance_invoice_duplicate'
      USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-advance:' || v_tenant::text || ':'
        || p_idempotency_key::text,
      0
    )
  );

  SELECT *
  INTO v_payment
  FROM public.supplier_payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payment_allocations allocation
    WHERE allocation.tenant_id = v_tenant
      AND allocation.allocation_intent_key = p_idempotency_key
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.supplier_payment_allocations allocation
      WHERE allocation.tenant_id = v_tenant
        AND allocation.allocation_intent_key = p_idempotency_key
        AND allocation.supplier_payment_id <> p_payment_id
    ) OR (
      SELECT count(*)
      FROM public.supplier_payment_allocations allocation
      WHERE allocation.tenant_id = v_tenant
        AND allocation.allocation_intent_key = p_idempotency_key
        AND allocation.supplier_payment_id = p_payment_id
    ) <> pg_catalog.jsonb_array_length(p_allocations)
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_allocations) requested
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.supplier_payment_allocations allocation
        WHERE allocation.tenant_id = v_tenant
          AND allocation.supplier_payment_id = p_payment_id
          AND allocation.allocation_intent_key = p_idempotency_key
          AND allocation.supplier_invoice_id =
            (requested.value->>'invoice_id')::bigint
          AND allocation.amount =
            (requested.value->>'amount')::numeric
      )
    ) THEN
      RAISE EXCEPTION 'supplier_advance_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(allocation.amount), 0)
    INTO v_allocated
    FROM public.supplier_payment_allocations allocation
    WHERE allocation.tenant_id = v_tenant
      AND allocation.supplier_payment_id = p_payment_id
      AND allocation.allocation_intent_key = p_idempotency_key;

    SELECT (
      v_payment.amount - COALESCE(sum(allocation.amount), 0)
    )::numeric(15,2)
    INTO v_remaining
    FROM public.supplier_payment_allocations allocation
    WHERE allocation.tenant_id = v_tenant
      AND allocation.supplier_payment_id = p_payment_id
      AND allocation.id <= (
        SELECT max(intent_allocation.id)
        FROM public.supplier_payment_allocations intent_allocation
        WHERE intent_allocation.tenant_id = v_tenant
          AND intent_allocation.supplier_payment_id = p_payment_id
          AND intent_allocation.allocation_intent_key = p_idempotency_key
      );

    v_result_status := CASE
      WHEN v_remaining = 0 THEN 'paid'
      ELSE 'partial'
    END;

    RETURN pg_catalog.jsonb_build_object(
      'payment_id', p_payment_id,
      'allocated_amount', v_allocated,
      'advance_amount', v_remaining,
      'payment_status', v_result_status
    );
  END IF;

  SELECT COALESCE(sum((allocation.value->>'amount')::numeric), 0)
  INTO v_allocated
  FROM pg_catalog.jsonb_array_elements(p_allocations) allocation;
  v_allocated := v_allocated::numeric(15,2);

  SELECT (
    v_payment.amount - COALESCE(sum(allocation.amount), 0)
  )::numeric(15,2)
  INTO v_available
  FROM public.supplier_payment_allocations allocation
  WHERE allocation.tenant_id = v_tenant
    AND allocation.supplier_payment_id = p_payment_id;

  PERFORM 1
  FROM public.supplier_invoices invoice
  JOIN pg_catalog.jsonb_array_elements(p_allocations) allocation
    ON invoice.id = (allocation.value->>'invoice_id')::bigint
  WHERE invoice.tenant_id = v_tenant
  ORDER BY invoice.id
  FOR UPDATE OF invoice;

  IF v_allocated > v_available
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(p_allocations) allocation
       LEFT JOIN public.supplier_invoices invoice
         ON invoice.id = (allocation.value->>'invoice_id')::bigint
        AND invoice.tenant_id = v_tenant
       WHERE invoice.id IS NULL
          OR invoice.supplier_id IS DISTINCT FROM v_payment.supplier_id
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
                WHERE receipt.tenant_id = v_tenant
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
                WHERE receipt.tenant_id = v_tenant
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
    RAISE EXCEPTION 'supplier_advance_allocation_invalid'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.supplier_payment_allocations (
    tenant_id,
    supplier_payment_id,
    supplier_invoice_id,
    amount,
    allocation_intent_key
  )
  SELECT
    v_tenant,
    p_payment_id,
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
    AND invoice.tenant_id = v_tenant;

  v_remaining := (v_available - v_allocated)::numeric(15,2);
  v_result_status := CASE
    WHEN v_remaining = 0 THEN 'paid'
    ELSE 'partial'
  END;

  PERFORM public.log_audit(
    'supplier_payment.advance_allocated',
    'supplier_payment',
    p_payment_id,
    pg_catalog.jsonb_build_object('advance_amount', v_available),
    pg_catalog.jsonb_build_object(
      'allocated_amount', v_allocated,
      'advance_amount', v_remaining
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'payment_id', p_payment_id,
    'allocated_amount', v_allocated,
    'advance_amount', v_remaining,
    'payment_status', v_result_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_supplier_advance(
  bigint, uuid, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_supplier_advance(
  bigint, uuid, jsonb
) TO authenticated, service_role;

DROP POLICY IF EXISTS supplier_invoices_write
  ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_payments_write
  ON public.supplier_payments;
DROP POLICY IF EXISTS supplier_invoice_lines_finance
  ON public.supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_receipt_allocations_finance
  ON public.supplier_invoice_receipt_allocations;
DROP POLICY IF EXISTS supplier_payment_allocations_finance
  ON public.supplier_payment_allocations;

CREATE POLICY supplier_invoice_lines_select
ON public.supplier_invoice_lines
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.can_read_inventory_monetary('procurement:price_list_read')
);

CREATE POLICY supplier_invoice_receipt_allocations_select
ON public.supplier_invoice_receipt_allocations
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.can_read_inventory_monetary('procurement:price_list_read')
);

CREATE POLICY supplier_payment_allocations_select
ON public.supplier_payment_allocations
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('finance:view')
);

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.supplier_invoices,
  public.supplier_invoice_lines,
  public.supplier_invoice_receipt_allocations,
  public.supplier_payments,
  public.supplier_payment_allocations
FROM authenticated;

GRANT SELECT (
  invoice_kind,
  service_verified_by,
  service_verified_at,
  service_verification_reason,
  matching_expected_amount,
  matching_received_amount,
  matching_difference_amount,
  matching_reason_code
) ON public.supplier_invoices TO authenticated;

COMMIT;
