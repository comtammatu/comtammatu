-- ADR 0034 follow-up: snapshot_invoice_job must keep serviceCharge when
-- rebuilding draftSnapshot + invoiceProfile, or payments.provider_data updates
-- raise invoice_snapshot_immutable after upsert wrote serviceCharge.

CREATE OR REPLACE FUNCTION private.snapshot_invoice_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_profile public.invoice_profiles%ROWTYPE;
  v_items jsonb;
  v_subtotal numeric(15,2);
  v_vat numeric(15,2);
  v_payload jsonb;
BEGIN
  IF NEW.status <> 'queued' OR NEW.operation <> 'issue' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.invoice_payload #> '{draftSnapshot,invoiceProfile}')
    = 'object' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id
    AND tenant_id = NEW.tenant_id
    AND branch_id = NEW.branch_id;
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = NEW.payment_id
    AND order_id = NEW.order_id
    AND status = 'completed';
  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = NEW.tenant_id;
  SELECT * INTO v_profile
  FROM public.invoice_profiles
  WHERE tenant_id = NEW.tenant_id
    AND status = 'active'
    AND valid_from <= v_payment.paid_at
    AND (retired_at IS NULL OR retired_at > v_payment.paid_at);

  IF v_order.id IS NULL OR v_payment.id IS NULL THEN
    RAISE EXCEPTION 'invoice_snapshot_payment_or_order_missing'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'active_invoice_profile_missing'
      USING ERRCODE = '23514';
  END IF;
  IF NULLIF(btrim(v_tenant.legal_name), '') IS NULL
    OR NULLIF(btrim(v_tenant.tax_code), '') IS NULL
    OR NULLIF(btrim(v_tenant.legal_address), '') IS NULL
    OR NULLIF(btrim(v_tenant.representative), '') IS NULL
    OR v_profile.seller_tax_code IS DISTINCT FROM v_tenant.tax_code THEN
    RAISE EXCEPTION 'invoice_seller_identity_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'item_name', item.item_name,
        'variant_name', item.variant_name,
        'quantity', item.quantity,
        'unit_price', item.unit_price,
        'subtotal', item.subtotal,
        'discount_amount', item.discount_amount,
        'vat_rate', item.vat_rate,
        'modifiers', item.modifiers,
        'sides', item.sides,
        'status', item.status
      )
      ORDER BY item.id
    ),
    '[]'::jsonb
  ) INTO v_items
  FROM public.order_items item
  WHERE item.tenant_id = NEW.tenant_id
    AND item.order_id = NEW.order_id
    AND item.status <> 'cancelled';

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'invoice_snapshot_items_missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    COALESCE(sum(line_subtotal), 0),
    COALESCE(sum(line_vat), 0)
  INTO v_subtotal, v_vat
  FROM public._compute_vat_breakdown(ARRAY[NEW.order_id]);

  v_payload := NEW.invoice_payload || jsonb_build_object(
    'draftSnapshot',
    jsonb_build_object(
      'version', 1,
      'orderId', v_order.id,
      'branchId', v_order.branch_id,
      'orderNumber', COALESCE(v_order.order_number, 'ORD-' || v_order.id::text),
      'invoiceTime', v_payment.paid_at,
      'orderDiscountAmount',
        COALESCE(v_order.order_discount_amount, v_order.discount_amount, 0),
      'serviceCharge', COALESCE(v_order.service_charge, 0),
      'invoiceProfile',
        jsonb_build_object(
          'id', v_profile.id,
          'version', v_profile.version,
          'provider', v_profile.provider,
          'templateCode', v_profile.template_code,
          'invoiceSeries', v_profile.invoice_series,
          'sellerName', v_tenant.legal_name,
          'sellerTaxCode', v_tenant.tax_code,
          'sellerAddress', v_tenant.legal_address
        ),
      'subtotal', v_subtotal,
      'vatAmount', v_vat,
      'totalAmount', v_order.total_amount,
      'items', v_items
    )
  );
  NEW.invoice_payload := v_payload;

  UPDATE public.payments
  SET provider_data = COALESCE(provider_data, '{}'::jsonb)
      || jsonb_build_object('invoiceSnapshot', v_payload),
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.tax_invoices
  SET subtotal = v_subtotal,
      vat_rate = NULL,
      vat_amount = v_vat,
      total_amount = v_order.total_amount,
      invoice_profile_id = v_profile.id,
      invoice_profile_version = v_profile.version,
      template_code = v_profile.template_code,
      invoice_series = v_profile.invoice_series,
      seller_name = v_tenant.legal_name,
      seller_tax_code = v_tenant.tax_code,
      seller_address = v_tenant.legal_address,
      invoice_snapshot = v_payload,
      updated_at = now()
  WHERE id = NEW.tax_invoice_id
    AND tenant_id = NEW.tenant_id
    AND status = 'draft';

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_invoice_job()
  FROM PUBLIC, anon, authenticated;
