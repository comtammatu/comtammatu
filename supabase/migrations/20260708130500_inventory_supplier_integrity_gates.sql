CREATE OR REPLACE FUNCTION public.create_supplier_payment(
  p_tenant_id bigint,
  p_supplier_invoice_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_reference_note text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_invoice RECORD;
  v_branch_id BIGINT;
  v_payment_id BIGINT;
  v_new_paid NUMERIC(15,2);
  v_new_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:ap_pay') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method NOT IN ('cash','bank_transfer') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;

  SELECT si.* INTO v_invoice
  FROM public.supplier_invoices si
  WHERE si.id = p_supplier_invoice_id
    AND si.tenant_id = p_tenant_id
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

  SELECT branch_id INTO v_branch_id
  FROM public.goods_received_notes
  WHERE id = v_invoice.grn_id;

  IF v_branch_id IS NULL THEN
    SELECT branch_id INTO v_branch_id
    FROM public.purchase_orders
    WHERE id = v_invoice.po_id;
  END IF;

  INSERT INTO public.supplier_payments (
    tenant_id,
    supplier_invoice_id,
    payment_method,
    amount,
    payment_date,
    reference_note,
    created_by
  ) VALUES (
    p_tenant_id,
    p_supplier_invoice_id,
    p_payment_method,
    p_amount,
    now(),
    p_reference_note,
    v_uid
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.supplier_invoices
  SET payment_status = v_new_status,
      paid_amount = v_new_paid,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = p_supplier_invoice_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payment(bigint, bigint, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment(bigint, bigint, numeric, text, text) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.supplier_returns sr
    WHERE sr.grn_id IS NOT NULL
      AND sr.status <> 'cancelled'
    GROUP BY sr.tenant_id, sr.grn_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'active_supplier_return_duplicate_grn' USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_returns_active_grn
ON public.supplier_returns (tenant_id, grn_id)
WHERE grn_id IS NOT NULL
  AND status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.create_supplier_return_from_grn(
  p_grn_id bigint,
  p_resolution text DEFAULT 'replacement'::text,
  p_reason text DEFAULT 'damaged'::text,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid        UUID   := auth.uid();
  v_tenant     BIGINT := public.auth_tenant_id();
  v_grn        RECORD;
  v_return_id  BIGINT;
  v_ret_num    TEXT;
  v_total      NUMERIC(15,2) := 0;
  v_lines_inserted INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_resolution NOT IN ('replacement','credit_note','cash_refund') THEN
    RAISE EXCEPTION 'invalid_resolution' USING ERRCODE = '22023';
  END IF;

  IF p_reason NOT IN ('damaged','wrong_item','expired','quality_fail','short_delivery_credit','other') THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'supplier_return:create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_returns sr
    WHERE sr.tenant_id = v_tenant
      AND sr.grn_id = p_grn_id
      AND sr.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'supplier_return_duplicate_grn' USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND (gi.quality_status = 'rejected' OR COALESCE(gi.rejected_quantity,0) > 0)
  ) THEN
    RAISE EXCEPTION 'no_rejected_lines' USING ERRCODE = '22023';
  END IF;

  v_ret_num := 'SR-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('public.supplier_returns_id_seq')::TEXT, 4, '0');

  INSERT INTO public.supplier_returns (
    tenant_id, branch_id, supplier_id, grn_id, return_number,
    source, reason, resolution, status, notes, total_value, created_by
  ) VALUES (
    v_tenant, v_grn.branch_id, v_grn.supplier_id, p_grn_id, v_ret_num,
    'grn_reject', p_reason, p_resolution, 'draft', p_notes, 0, v_uid
  ) RETURNING id INTO v_return_id;

  WITH rej AS (
    INSERT INTO public.supplier_return_items (
      tenant_id, return_id, ingredient_id, quantity, unit_cost, total_cost,
      grn_item_id, reason_detail, photo_url, entry_unit_id
    )
    SELECT
      v_tenant,
      v_return_id,
      gi.ingredient_id,
      CASE
        WHEN gi.quality_status = 'rejected' AND COALESCE(gi.rejected_quantity,0) = 0
          THEN gi.received_quantity
        ELSE gi.rejected_quantity
      END,
      gi.unit_cost,
      ROUND(
        CASE
          WHEN gi.quality_status = 'rejected' AND COALESCE(gi.rejected_quantity,0) = 0
            THEN gi.received_quantity
          ELSE gi.rejected_quantity
        END * gi.unit_cost, 2
      ),
      gi.id,
      gi.rejection_reason,
      gi.rejected_photo_url,
      COALESCE(gi.entry_unit_id, (
        SELECT iu.unit_id
        FROM public.ingredient_units iu
        JOIN public.units u ON u.id = iu.unit_id AND u.tenant_id = iu.tenant_id AND u.is_active = TRUE
        WHERE iu.tenant_id = v_tenant
          AND iu.ingredient_id = gi.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
        ORDER BY iu.sort_order ASC, iu.id ASC
        LIMIT 1
      ))
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND (gi.quality_status = 'rejected' OR COALESCE(gi.rejected_quantity,0) > 0)
    RETURNING total_cost
  )
  SELECT COALESCE(SUM(total_cost), 0), COUNT(*) INTO v_total, v_lines_inserted FROM rej;

  UPDATE public.supplier_returns SET total_value = v_total WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_ret_num,
    'lines', v_lines_inserted,
    'total_value', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_return_from_grn(bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_return_from_grn(bigint, text, text, text) TO authenticated, service_role;
