-- Bank-webhook review writes provider_data.bankWebhookReview and must not
-- re-enter HĐĐT issue sync when payment status and invoice payload are unchanged.

CREATE OR REPLACE FUNCTION private.sync_tax_invoice_issue_job_after_payment_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status IS NOT DISTINCT FROM NEW.status
    AND (OLD.provider_data -> 'invoiceSnapshot')
      IS NOT DISTINCT FROM (NEW.provider_data -> 'invoiceSnapshot')
    AND (OLD.provider_data -> 'invoicePayload')
      IS NOT DISTINCT FROM (NEW.provider_data -> 'invoicePayload')
  THEN
    RETURN NEW;
  END IF;

  PERFORM private.sync_tax_invoice_issue_job_for_payment(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_tax_invoice_issue_job_after_payment_trigger()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.upsert_tax_invoice_issue_job(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_payment_id bigint,
  p_invoice_payload jsonb,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_buyer_payload jsonb;
  v_payload jsonb;
  v_items jsonb;
  v_invoice public.tax_invoices%ROWTYPE;
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_available_at timestamptz := now();
  v_invoice_created boolean := false;
BEGIN
  IF p_status NOT IN ('pending_payment', 'queued') THEN
    RAISE EXCEPTION 'invalid_tax_invoice_issue_job_status'
      USING ERRCODE = '22023';
  END IF;

  v_buyer_payload := public.self_order_normalize_invoice_payload(
    p_invoice_payload
  );

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_payment_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_order_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'pending_payment' THEN
    IF v_payment.status <> 'pending' THEN
      RAISE EXCEPTION 'tax_invoice_issue_payment_not_pending'
        USING ERRCODE = '22023';
    END IF;
    v_payload := v_buyer_payload;
  ELSE
    IF v_payment.status <> 'completed'
      OR v_payment.paid_at IS NULL
      OR v_order.payment_status <> 'paid'
      OR v_order.status <> 'completed' THEN
      RAISE EXCEPTION 'tax_invoice_issue_payment_not_completed'
        USING ERRCODE = '22023';
    END IF;

    v_available_at := v_payment.paid_at + interval '2 hours';
    v_payload := v_payment.provider_data -> 'invoiceSnapshot';

    IF jsonb_typeof(v_payload -> 'draftSnapshot') IS DISTINCT FROM 'object' THEN
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
      WHERE item.tenant_id = v_order.tenant_id
        AND item.order_id = v_order.id
        AND item.status <> 'cancelled';

      IF jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'tax_invoice_issue_order_has_no_items'
          USING ERRCODE = '22023';
      END IF;

      v_payload := v_buyer_payload || jsonb_build_object(
        'draftSnapshot',
        jsonb_build_object(
          'version', 1,
          'orderId', v_order.id,
          'branchId', v_order.branch_id,
          'orderNumber',
            COALESCE(v_order.order_number, 'ORD-' || v_order.id::text),
          'invoiceTime', v_payment.paid_at,
          'orderDiscountAmount',
            COALESCE(v_order.order_discount_amount, v_order.discount_amount, 0),
          'subtotal', v_order.total_amount,
          'vatAmount', 0,
          'totalAmount', v_order.total_amount,
          'items', v_items
        )
      );

      UPDATE public.payments
      SET provider_data = COALESCE(provider_data, '{}'::jsonb)
          || jsonb_build_object('invoiceSnapshot', v_payload),
          updated_at = now()
      WHERE id = v_payment.id;
    END IF;

    SELECT invoice.* INTO v_invoice
    FROM public.tax_invoices invoice
    WHERE invoice.tenant_id = v_order.tenant_id
      AND invoice.order_id = v_order.id
      AND invoice.status NOT IN ('cancelled', 'replaced', 'not_required')
    ORDER BY invoice.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.tax_invoices (
        tenant_id, branch_id, order_id, invoice_number, status,
        buyer_name, buyer_tax_code, buyer_address, buyer_email,
        subtotal, vat_rate, vat_amount, total_amount,
        provider, provider_ref, provider_data, invoice_time, issued_at,
        created_by
      ) VALUES (
        v_order.tenant_id, v_order.branch_id, v_order.id, NULL, 'draft',
        v_payload ->> 'buyerName',
        NULLIF(v_payload ->> 'buyerTaxCode', ''),
        NULLIF(v_payload ->> 'buyerAddress', ''),
        NULLIF(v_payload ->> 'buyerEmail', ''),
        v_order.total_amount, NULL, 0, v_order.total_amount,
        'viettel', NULL, NULL, v_payment.paid_at, NULL,
        v_payment.created_by
      )
      RETURNING * INTO v_invoice;
      v_invoice_created := true;
    ELSIF v_invoice.status <> 'draft'
      OR v_invoice.invoice_number IS NOT NULL THEN
      -- Idempotent: already-issued invoices must not fail unrelated provider_data writes.
      SELECT job.*
      INTO v_job
      FROM public.tax_invoice_issue_jobs job
      WHERE job.tenant_id = p_tenant_id
        AND job.order_id = p_order_id
        AND job.operation = 'issue'
      ORDER BY job.id DESC
      LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'job_id', v_job.id,
          'status', v_job.status,
          'payment_id', v_job.payment_id,
          'tax_invoice_id', v_job.tax_invoice_id,
          'available_at', v_job.available_at
        );
      END IF;

      RETURN jsonb_build_object(
        'job_id', NULL,
        'status', 'already_issued',
        'payment_id', p_payment_id,
        'tax_invoice_id', v_invoice.id,
        'available_at', v_available_at
      );
    ELSIF v_invoice.invoice_time IS NOT NULL
      AND v_invoice.invoice_time IS DISTINCT FROM v_payment.paid_at THEN
      RAISE EXCEPTION 'tax_invoice_issue_invoice_time_mismatch'
        USING ERRCODE = '22023';
    ELSE
      UPDATE public.tax_invoices
      SET invoice_time = COALESCE(invoice_time, v_payment.paid_at),
          updated_at = now()
      WHERE id = v_invoice.id
      RETURNING * INTO v_invoice;
    END IF;

    IF v_invoice_created THEN
      INSERT INTO public.tax_invoice_events (
        tax_invoice_id, tenant_id, from_status, to_status,
        actor_id, payload, note
      ) VALUES (
        v_invoice.id, v_invoice.tenant_id, NULL, 'draft',
        v_payment.created_by,
        jsonb_build_object(
          'payment_id', v_payment.id,
          'invoice_time', v_payment.paid_at,
          'buyer_deadline_at', v_available_at
        ),
        'Payment-time HĐĐT draft created'
      );
    END IF;
  END IF;

  INSERT INTO public.tax_invoice_issue_jobs (
    tenant_id, branch_id, order_id, payment_id, invoice_payload,
    tax_invoice_id, status, available_at, operation
  ) VALUES (
    p_tenant_id, p_branch_id, p_order_id, p_payment_id, v_payload,
    CASE WHEN p_status = 'queued' THEN v_invoice.id ELSE NULL END,
    p_status, v_available_at, 'issue'
  )
  ON CONFLICT (tenant_id, order_id) WHERE operation = 'issue' DO UPDATE
  SET payment_id = EXCLUDED.payment_id,
      invoice_payload = CASE
        WHEN public.tax_invoice_issue_jobs.status = 'pending_payment'
          OR public.tax_invoice_issue_jobs.tax_invoice_id IS NULL
          THEN EXCLUDED.invoice_payload
        ELSE public.tax_invoice_issue_jobs.invoice_payload
      END,
      tax_invoice_id = COALESCE(
        public.tax_invoice_issue_jobs.tax_invoice_id,
        EXCLUDED.tax_invoice_id
      ),
      status = CASE
        WHEN public.tax_invoice_issue_jobs.status IN (
          'completed', 'blocked', 'reconcile_required', 'processing'
        ) THEN public.tax_invoice_issue_jobs.status
        WHEN EXCLUDED.status = 'queued' THEN 'queued'
        ELSE public.tax_invoice_issue_jobs.status
      END,
      available_at = CASE
        WHEN public.tax_invoice_issue_jobs.status = 'pending_payment'
          OR public.tax_invoice_issue_jobs.tax_invoice_id IS NULL
          THEN EXCLUDED.available_at
        ELSE public.tax_invoice_issue_jobs.available_at
      END,
      updated_at = now()
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'payment_id', v_job.payment_id,
    'tax_invoice_id', v_job.tax_invoice_id,
    'available_at', v_job.available_at
  );
END;
$$;

REVOKE ALL ON FUNCTION private.upsert_tax_invoice_issue_job(
  bigint, bigint, bigint, bigint, jsonb, text
) FROM PUBLIC, anon, authenticated;
