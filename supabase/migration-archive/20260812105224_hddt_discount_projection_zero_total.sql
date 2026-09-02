-- ADR 0034: item discount VND-only; zero-total HĐĐT not_required + QR read-only;
-- draftSnapshot includes serviceCharge for provider projection.

-- ---------------------------------------------------------------------------
-- 1) Materialize legacy item % discounts to VND, then tighten CHECK + RPCs
-- ---------------------------------------------------------------------------

UPDATE public.order_items
SET discount_type = 'vnd',
    discount_value = discount_amount,
    updated_at = now()
WHERE discount_type = 'pct'
  AND COALESCE(discount_amount, 0) > 0;

UPDATE public.order_items
SET discount_type = NULL,
    discount_value = NULL,
    discount_note = NULL,
    discount_amount = 0,
    updated_at = now()
WHERE discount_type = 'pct';

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_discount_type_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_discount_type_check
  CHECK (discount_type IS NULL OR discount_type = 'vnd');

COMMENT ON COLUMN public.order_items.discount_type IS
  'Item-level discount type: vnd only (ADR 0034). Null when no item discount.';

CREATE OR REPLACE FUNCTION public.pos_normalize_order_item_discount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_discount NUMERIC(15,2);
BEGIN
  IF NEW.discount_type IS NULL OR NEW.discount_value IS NULL THEN
    NEW.discount_type := NULL;
    NEW.discount_value := NULL;
    NEW.discount_note := NULL;
    NEW.discount_amount := 0;
    RETURN NEW;
  END IF;

  IF NEW.discount_type IS DISTINCT FROM 'vnd' THEN
    RAISE EXCEPTION 'discount_invalid_type' USING ERRCODE = '22023';
  END IF;

  NEW.discount_value := LEAST(
    GREATEST(COALESCE(NEW.discount_value, 0), 0),
    COALESCE(NEW.subtotal, 0)
  );

  v_discount := public.compute_discount_amount(
    NEW.discount_type,
    NEW.discount_value,
    COALESCE(NEW.subtotal, 0)
  );

  IF v_discount <= 0 THEN
    NEW.discount_type := NULL;
    NEW.discount_value := NULL;
    NEW.discount_note := NULL;
    NEW.discount_amount := 0;
  ELSE
    NEW.discount_amount := v_discount;
    NEW.discount_note := NULLIF(trim(COALESCE(NEW.discount_note, '')), '');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_order_item_discount(
  p_order_item_id bigint,
  p_type text,
  p_value numeric,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_row RECORD;
  v_note_trim TEXT;
  v_clamped_value NUMERIC(15,2);
  v_updated_item RECORD;
  v_order_totals RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_type IS NULL OR p_type IS DISTINCT FROM 'vnd' THEN
    RAISE EXCEPTION 'discount_invalid_type' USING ERRCODE = '22023';
  END IF;

  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'discount_invalid_value' USING ERRCODE = '22023';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT oi.id AS order_item_id, oi.order_id, oi.tenant_id, oi.status AS item_status,
         oi.subtotal AS item_subtotal,
         o.branch_id, o.status AS order_status, o.payment_status
  INTO v_row
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
  WHERE oi.id = p_order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_row.order_id);

  SELECT oi.id AS order_item_id, oi.order_id, oi.tenant_id, oi.status AS item_status,
         oi.subtotal AS item_subtotal,
         o.branch_id, o.status AS order_status, o.payment_status
  INTO v_row
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
  WHERE oi.id = p_order_item_id
  FOR UPDATE OF oi, o;

  IF v_row.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_row.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_row.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_row.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_row.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  IF v_row.item_status = 'cancelled' THEN
    RAISE EXCEPTION 'order item cancelled' USING ERRCODE = '22023';
  END IF;

  v_clamped_value := LEAST(p_value, COALESCE(v_row.item_subtotal, 0));

  IF public.compute_discount_amount('vnd', v_clamped_value, v_row.item_subtotal) = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
     SET discount_type = 'vnd',
         discount_value = v_clamped_value,
         discount_note = v_note_trim,
         updated_at = now()
   WHERE id = p_order_item_id
   RETURNING id, discount_type, discount_value, discount_amount, discount_note
   INTO v_updated_item;

  SELECT discount_amount, item_discount_amount, order_discount_amount, total_amount
  INTO v_order_totals
  FROM public.orders
  WHERE id = v_row.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_row.tenant_id, v_row.order_id, v_row.order_status, v_row.order_status, v_uid,
    'item_discount_applied: item ' || p_order_item_id::TEXT || ' '
      || 'vnd ' || v_clamped_value::TEXT
      || ' (' || v_updated_item.discount_amount::TEXT || 'đ) :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id', v_row.order_id,
    'order_item_id', p_order_item_id,
    'discount_type', v_updated_item.discount_type,
    'discount_value', v_updated_item.discount_value,
    'discount_amount', v_updated_item.discount_amount,
    'discount_note', v_updated_item.discount_note,
    'order_discount_amount', v_order_totals.order_discount_amount,
    'item_discount_amount', v_order_totals.item_discount_amount,
    'total_discount_amount', v_order_totals.discount_amount,
    'total_amount', v_order_totals.total_amount
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Zero-total → tax_invoices.not_required (no issue job); serviceCharge snapshot
-- ---------------------------------------------------------------------------

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

  -- ADR 0034: zero-total paid orders never queue Viettel issuance.
  IF COALESCE(v_order.total_amount, 0) = 0 THEN
    IF p_status = 'pending_payment' THEN
      RETURN jsonb_build_object(
        'job_id', NULL,
        'status', 'not_required',
        'payment_id', p_payment_id,
        'tax_invoice_id', NULL,
        'available_at', v_available_at
      );
    END IF;

    IF v_payment.status <> 'completed'
      OR v_payment.paid_at IS NULL
      OR v_order.payment_status <> 'paid'
      OR v_order.status <> 'completed' THEN
      RAISE EXCEPTION 'tax_invoice_issue_payment_not_completed'
        USING ERRCODE = '22023';
    END IF;

    v_available_at := v_payment.paid_at + interval '2 hours';

    DELETE FROM public.tax_invoice_issue_jobs job
    WHERE job.tenant_id = p_tenant_id
      AND job.order_id = p_order_id
      AND job.operation = 'issue'
      AND job.status IN ('pending_payment', 'queued');

    SELECT invoice.* INTO v_invoice
    FROM public.tax_invoices invoice
    WHERE invoice.tenant_id = v_order.tenant_id
      AND invoice.order_id = v_order.id
      AND invoice.status = 'not_required'
    ORDER BY invoice.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT invoice.* INTO v_invoice
      FROM public.tax_invoices invoice
      WHERE invoice.tenant_id = v_order.tenant_id
        AND invoice.order_id = v_order.id
        AND invoice.status NOT IN ('cancelled', 'replaced', 'not_required')
      ORDER BY invoice.id DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        IF v_invoice.status <> 'draft' OR v_invoice.invoice_number IS NOT NULL THEN
          RETURN jsonb_build_object(
            'job_id', NULL,
            'status', 'already_issued',
            'payment_id', p_payment_id,
            'tax_invoice_id', v_invoice.id,
            'available_at', v_available_at
          );
        END IF;

        UPDATE public.tax_invoices
        SET status = 'not_required',
            subtotal = 0,
            vat_amount = 0,
            total_amount = 0,
            invoice_time = COALESCE(invoice_time, v_payment.paid_at),
            updated_at = now()
        WHERE id = v_invoice.id
        RETURNING * INTO v_invoice;

        INSERT INTO public.tax_invoice_events (
          tax_invoice_id, tenant_id, from_status, to_status,
          actor_id, payload, note
        ) VALUES (
          v_invoice.id, v_invoice.tenant_id, 'draft', 'not_required',
          v_payment.created_by,
          jsonb_build_object(
            'payment_id', v_payment.id,
            'invoice_time', v_payment.paid_at,
            'reason', 'zero_total'
          ),
          'Zero-total order marked HĐĐT not_required'
        );
      ELSE
        INSERT INTO public.tax_invoices (
          tenant_id, branch_id, order_id, invoice_number, status,
          buyer_name, buyer_tax_code, buyer_address, buyer_email,
          subtotal, vat_rate, vat_amount, total_amount,
          provider, provider_ref, provider_data, invoice_time, issued_at,
          created_by
        ) VALUES (
          v_order.tenant_id, v_order.branch_id, v_order.id, NULL, 'not_required',
          v_buyer_payload ->> 'buyerName',
          NULLIF(v_buyer_payload ->> 'buyerTaxCode', ''),
          NULLIF(v_buyer_payload ->> 'buyerAddress', ''),
          NULLIF(v_buyer_payload ->> 'buyerEmail', ''),
          0, NULL, 0, 0,
          'viettel', NULL, NULL, v_payment.paid_at, NULL,
          v_payment.created_by
        )
        RETURNING * INTO v_invoice;

        INSERT INTO public.tax_invoice_events (
          tax_invoice_id, tenant_id, from_status, to_status,
          actor_id, payload, note
        ) VALUES (
          v_invoice.id, v_invoice.tenant_id, NULL, 'not_required',
          v_payment.created_by,
          jsonb_build_object(
            'payment_id', v_payment.id,
            'invoice_time', v_payment.paid_at,
            'reason', 'zero_total'
          ),
          'Zero-total order HĐĐT not_required'
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'job_id', NULL,
      'status', 'not_required',
      'payment_id', p_payment_id,
      'tax_invoice_id', v_invoice.id,
      'available_at', v_available_at
    );
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
          'serviceCharge', COALESCE(v_order.service_charge, 0),
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

-- ---------------------------------------------------------------------------
-- 3) Attach buyer QR for not_required (zero-total) as well as draft+queued
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.attach_invoice_buyer_qr_to_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_path text;
  v_raw_token text;
  v_token_hash text;
  v_stored_token_hash text;
  v_paid_at timestamptz;
  v_expires_at timestamptz;
  v_request_status text;
BEGIN
  IF NEW.job_type <> 'receipt' OR NEW.order_id IS NULL OR NEW.payload IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.payload := NEW.payload - 'payment_qr' - 'invoice_qr';

  SELECT payment.paid_at
  INTO v_paid_at
  FROM public.payments payment
  WHERE payment.tenant_id = NEW.tenant_id
    AND payment.branch_id = NEW.branch_id
    AND payment.order_id = NEW.order_id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.tax_invoice_issue_jobs job
        JOIN public.tax_invoices invoice
          ON invoice.id = job.tax_invoice_id
         AND invoice.tenant_id = job.tenant_id
         AND invoice.order_id = job.order_id
        WHERE job.tenant_id = NEW.tenant_id
          AND job.branch_id = NEW.branch_id
          AND job.order_id = NEW.order_id
          AND job.tax_invoice_id IS NOT NULL
          AND job.status = 'queued'
          AND invoice.status = 'draft'
          AND invoice.invoice_number IS NULL
          AND job.payment_id = payment.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tax_invoices invoice
        WHERE invoice.tenant_id = NEW.tenant_id
          AND invoice.branch_id = NEW.branch_id
          AND invoice.order_id = NEW.order_id
          AND invoice.status = 'not_required'
      )
    )
  ORDER BY payment.paid_at DESC
  LIMIT 1;
  IF v_paid_at IS NULL THEN
    RETURN NEW;
  END IF;
  v_expires_at := v_paid_at + interval '2 hours';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'invoice-buyer:' || NEW.tenant_id::text || ':' || NEW.order_id::text,
      0
    )
  );

  IF TG_OP = 'UPDATE' THEN
    v_path := OLD.payload #>> '{invoice_qr,content}';
  END IF;
  v_path := COALESCE(v_path, NEW.payload #>> '{invoice_qr,content}');

  IF v_path IS NULL THEN
    SELECT job.payload #>> '{invoice_qr,content}'
    INTO v_path
    FROM public.print_jobs job
    WHERE job.tenant_id = NEW.tenant_id
      AND job.order_id = NEW.order_id
      AND job.job_type = 'receipt'
      AND COALESCE(job.payload #>> '{invoice_qr,content}', '') <> ''
    ORDER BY job.created_at
    LIMIT 1;
  END IF;

  v_raw_token := substring(
    COALESCE(v_path, '')
    FROM '^/q/invoice/([a-f0-9]{48})$'
  );
  IF v_raw_token IS NULL THEN
    v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');
    v_path := '/q/invoice/' || v_raw_token;
  END IF;
  v_token_hash := encode(
    extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'),
    'hex'
  );

  INSERT INTO public.tax_invoice_buyer_requests (
    tenant_id,
    branch_id,
    order_id,
    token_hash,
    expires_at
  ) VALUES (
    NEW.tenant_id,
    NEW.branch_id,
    NEW.order_id,
    v_token_hash,
    v_expires_at
  )
  ON CONFLICT (tenant_id, order_id) DO NOTHING;

  SELECT request.token_hash, request.expires_at, request.status
  INTO v_stored_token_hash, v_expires_at, v_request_status
  FROM public.tax_invoice_buyer_requests request
  WHERE request.tenant_id = NEW.tenant_id
    AND request.order_id = NEW.order_id;

  IF v_stored_token_hash IS DISTINCT FROM v_token_hash
    OR v_request_status <> 'open'
    OR v_expires_at <= now() THEN
    RETURN NEW;
  END IF;

  NEW.payload := jsonb_set(
    NEW.payload,
    '{invoice_qr}',
    jsonb_build_object(
      'type', 'invoice',
      'content', v_path,
      'header_label', 'NHẬN HĐĐT'
    ),
    true
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.attach_invoice_buyer_qr_to_print_job()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Buyer request get/submit: not_required state + reject submit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invoice_buyer_request_as_system(
  p_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_request public.tax_invoice_buyer_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
  v_job_found boolean := false;
  v_state text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.tax_invoice_buyer_requests request
  WHERE request.token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_request.order_id
    AND tenant_id = v_request.tenant_id;
  SELECT * INTO v_branch
  FROM public.branches
  WHERE id = v_request.branch_id
    AND tenant_id = v_request.tenant_id;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs
  WHERE tenant_id = v_request.tenant_id
    AND order_id = v_request.order_id;
  v_job_found := FOUND;

  IF v_job_found AND v_job.tax_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.tax_invoices
    WHERE id = v_job.tax_invoice_id
      AND tenant_id = v_request.tenant_id;
  ELSE
    SELECT * INTO v_invoice
    FROM public.tax_invoices
    WHERE tenant_id = v_request.tenant_id
      AND order_id = v_request.order_id
      AND status = 'not_required'
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  v_state := CASE
    WHEN v_request.status = 'submitted' THEN 'submitted'
    WHEN v_request.status = 'expired' THEN 'expired'
    WHEN v_request.expires_at <= now() THEN 'expired'
    WHEN v_invoice.status = 'not_required'
      OR COALESCE(v_order.total_amount, 0) = 0 THEN 'not_required'
    WHEN v_job_found
      AND v_job.status = 'queued'
      AND v_invoice.status = 'draft' THEN 'open'
    ELSE 'closed'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'orderNumber', v_order.order_number,
    'branchName', v_branch.name,
    'expiresAt', v_request.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_invoice_buyer_request_as_system(
  p_token_hash text,
  p_invoice_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_request public.tax_invoice_buyer_requests%ROWTYPE;
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_buyer_payload jsonb;
  v_payload jsonb;
  v_existing_job_id bigint;
  v_kind text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.tax_invoice_buyer_requests request
  WHERE request.token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_buyer_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status = 'submitted' THEN
    SELECT job.id
    INTO v_existing_job_id
    FROM public.tax_invoice_issue_jobs job
    WHERE job.tenant_id = v_request.tenant_id
      AND job.order_id = v_request.order_id;
    RETURN jsonb_build_object(
      'status', 'submitted',
      'jobId', v_existing_job_id
    );
  END IF;
  IF v_request.status = 'expired' THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;
  IF v_request.expires_at <= now() THEN
    UPDATE public.tax_invoice_buyer_requests
    SET status = 'expired',
        closed_at = now(),
        close_reason = 'deadline_elapsed',
        updated_at = now()
    WHERE id = v_request.id;
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_request.order_id
    AND tenant_id = v_request.tenant_id
  FOR UPDATE;

  IF COALESCE(v_order.total_amount, 0) = 0
    OR EXISTS (
      SELECT 1
      FROM public.tax_invoices invoice
      WHERE invoice.tenant_id = v_request.tenant_id
        AND invoice.order_id = v_request.order_id
        AND invoice.status = 'not_required'
    )
  THEN
    RETURN jsonb_build_object('status', 'not_required');
  END IF;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs job
  WHERE job.tenant_id = v_request.tenant_id
    AND job.order_id = v_request.order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_job.status <> 'queued'
    OR v_job.tax_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_buyer_request_closed' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.id = v_job.tax_invoice_id
    AND invoice.tenant_id = v_request.tenant_id
    AND invoice.order_id = v_request.order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_invoice.status <> 'draft'
    OR v_invoice.invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'invoice_buyer_request_closed' USING ERRCODE = '55000';
  END IF;

  v_buyer_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);
  v_kind := COALESCE(v_buyer_payload ->> 'buyerKind', '');

  IF v_buyer_payload->>'buyerNotGetInvoice' = 'true'
    OR jsonb_typeof(v_job.invoice_payload -> 'draftSnapshot') IS DISTINCT FROM 'object'
    OR COALESCE(v_buyer_payload->>'buyerName', '') = ''
    OR COALESCE(v_buyer_payload->>'buyerEmail', '') = ''
    OR v_kind NOT IN ('business', 'individual')
    OR (
      v_kind = 'business'
      AND (
        COALESCE(v_buyer_payload->>'buyerTaxCode', '') = ''
        OR COALESCE(v_buyer_payload->>'buyerAddress', '') = ''
      )
    )
  THEN
    RAISE EXCEPTION 'invoice_buyer_request_invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_payload := v_buyer_payload || jsonb_build_object(
    'draftSnapshot',
    v_job.invoice_payload -> 'draftSnapshot'
  );

  UPDATE public.tax_invoices
  SET buyer_name = v_buyer_payload ->> 'buyerName',
      buyer_tax_code = v_buyer_payload ->> 'buyerTaxCode',
      buyer_address = v_buyer_payload ->> 'buyerAddress',
      buyer_email = NULLIF(v_buyer_payload ->> 'buyerEmail', ''),
      updated_at = now()
  WHERE id = v_invoice.id;

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id,
    tenant_id,
    from_status,
    to_status,
    actor_id,
    payload,
    note
  ) VALUES (
    v_invoice.id,
    v_invoice.tenant_id,
    'draft',
    'draft',
    NULL,
    jsonb_build_object(
      'buyer_tax_code', v_buyer_payload ->> 'buyerTaxCode',
      'buyer_name', v_buyer_payload ->> 'buyerName',
      'buyer_kind', v_kind,
      'source', 'receipt_qr'
    ),
    'Buyer details confirmed from receipt QR'
  );

  UPDATE public.tax_invoice_buyer_requests
  SET status = 'submitted',
      submitted_payload = v_buyer_payload,
      submitted_at = now(),
      closed_at = now(),
      close_reason = 'queue_submitted',
      updated_at = now()
  WHERE id = v_request.id;

  UPDATE public.tax_invoice_issue_jobs
  SET invoice_payload = v_payload,
      available_at = now(),
      updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'status', 'submitted',
    'jobId', v_job.id,
    'taxInvoiceId', v_invoice.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_buyer_request_as_system(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_invoice_buyer_request_as_system(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_buyer_request_as_system(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_invoice_buyer_request_as_system(text, jsonb)
  TO service_role;
