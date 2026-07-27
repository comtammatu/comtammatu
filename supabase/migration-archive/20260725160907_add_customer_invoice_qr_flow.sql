BEGIN;

ALTER TABLE public.tax_invoices
  ADD COLUMN invoice_time timestamptz;

ALTER TABLE public.tax_invoice_issue_jobs
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();

DROP INDEX public.idx_tax_invoice_issue_jobs_claim;
CREATE INDEX idx_tax_invoice_issue_jobs_claim
  ON public.tax_invoice_issue_jobs (status, available_at, locked_until, created_at)
  WHERE status IN ('queued', 'processing');

CREATE TABLE public.tax_invoice_buyer_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open',
  expires_at timestamptz NOT NULL,
  submitted_payload jsonb,
  submitted_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_invoice_buyer_requests_status_check
    CHECK (status IN ('open', 'submitted', 'expired')),
  CONSTRAINT tax_invoice_buyer_requests_close_state_check
    CHECK (
      (
        status = 'open'
        AND closed_at IS NULL
        AND close_reason IS NULL
      )
      OR (
        status = 'submitted'
        AND closed_at IS NOT NULL
        AND close_reason = 'customer_submitted'
      )
      OR (
        status = 'expired'
        AND closed_at IS NOT NULL
        AND close_reason = 'deadline_elapsed'
      )
    ),
  CONSTRAINT tax_invoice_buyer_requests_token_hash_check
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tax_invoice_buyer_requests_one_per_order
    UNIQUE (tenant_id, order_id)
);

CREATE INDEX tax_invoice_buyer_requests_order_id_idx
  ON public.tax_invoice_buyer_requests (order_id);
CREATE INDEX tax_invoice_buyer_requests_branch_id_idx
  ON public.tax_invoice_buyer_requests (branch_id);

ALTER TABLE public.tax_invoice_buyer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tax_invoice_buyer_requests
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.tax_invoice_buyer_requests_id_seq
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.tax_invoice_buyer_requests TO service_role;
GRANT ALL ON SEQUENCE public.tax_invoice_buyer_requests_id_seq TO service_role;

CREATE TRIGGER trg_tax_invoice_buyer_requests_updated_at
  BEFORE UPDATE ON public.tax_invoice_buyer_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION private.guard_tax_invoice_payment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (OLD.provider_data ? 'invoiceSnapshot')
    AND NOT (COALESCE(NEW.provider_data, '{}'::jsonb) ? 'invoiceSnapshot') THEN
    NEW.provider_data := COALESCE(NEW.provider_data, '{}'::jsonb)
      || jsonb_build_object('invoiceSnapshot', OLD.provider_data -> 'invoiceSnapshot');
  END IF;

  IF TG_OP = 'UPDATE'
    AND jsonb_typeof(OLD.provider_data #> '{invoiceSnapshot,draftSnapshot}') = 'object'
    AND OLD.provider_data -> 'invoiceSnapshot'
      IS DISTINCT FROM NEW.provider_data -> 'invoiceSnapshot' THEN
    RAISE EXCEPTION 'invoice_snapshot_immutable' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_tax_invoice_payment_snapshot()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER payments_tax_invoice_snapshot_before_write ON public.payments;
CREATE TRIGGER payments_tax_invoice_snapshot_before_write
  BEFORE INSERT OR UPDATE OF provider_data, status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.guard_tax_invoice_payment_snapshot();

CREATE OR REPLACE FUNCTION private.guard_tax_invoice_job_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF jsonb_typeof(OLD.invoice_payload -> 'draftSnapshot') = 'object'
    AND OLD.invoice_payload -> 'draftSnapshot'
      IS DISTINCT FROM NEW.invoice_payload -> 'draftSnapshot' THEN
    RAISE EXCEPTION 'invoice_draft_snapshot_immutable' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_tax_invoice_job_snapshot()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tax_invoice_issue_jobs_snapshot_before_write
  BEFORE UPDATE OF invoice_payload ON public.tax_invoice_issue_jobs
  FOR EACH ROW EXECUTE FUNCTION private.guard_tax_invoice_job_snapshot();

CREATE OR REPLACE FUNCTION private.upsert_tax_invoice_issue_job(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_payment_id bigint,
  p_invoice_payload jsonb,
  p_status text
) RETURNS jsonb
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
    RAISE EXCEPTION 'invalid_tax_invoice_issue_job_status' USING ERRCODE = '22023';
  END IF;

  v_buyer_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'pending_payment' THEN
    IF v_payment.status <> 'pending' THEN
      RAISE EXCEPTION 'tax_invoice_issue_payment_not_pending' USING ERRCODE = '22023';
    END IF;
    v_payload := v_buyer_payload;
  ELSE
    IF v_payment.status <> 'completed'
      OR v_payment.paid_at IS NULL
      OR v_order.payment_status <> 'paid'
      OR v_order.status <> 'completed' THEN
      RAISE EXCEPTION 'tax_invoice_issue_payment_not_completed' USING ERRCODE = '22023';
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
      )
      INTO v_items
      FROM public.order_items item
      WHERE item.tenant_id = v_order.tenant_id
        AND item.order_id = v_order.id
        AND item.status <> 'cancelled';

      IF jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'tax_invoice_issue_order_has_no_items' USING ERRCODE = '22023';
      END IF;

      v_payload := v_buyer_payload || jsonb_build_object(
        'draftSnapshot',
        jsonb_build_object(
          'version', 1,
          'orderId', v_order.id,
          'branchId', v_order.branch_id,
          'orderNumber', COALESCE(v_order.order_number, 'ORD-' || v_order.id::text),
          'invoiceTime', v_payment.paid_at,
          'orderDiscountAmount',
            COALESCE(v_order.order_discount_amount, v_order.discount_amount, 0),
          'subtotal', v_order.total_amount,
          'vatRate', 0,
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
        tenant_id,
        branch_id,
        order_id,
        invoice_number,
        status,
        buyer_name,
        buyer_tax_code,
        buyer_address,
        buyer_email,
        subtotal,
        vat_rate,
        vat_amount,
        total_amount,
        provider,
        provider_ref,
        provider_data,
        invoice_time,
        issued_at,
        created_by
      ) VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        v_order.id,
        NULL,
        'draft',
        v_payload ->> 'buyerName',
        NULLIF(v_payload ->> 'buyerTaxCode', ''),
        NULLIF(v_payload ->> 'buyerAddress', ''),
        NULLIF(v_payload ->> 'buyerEmail', ''),
        v_order.total_amount,
        0,
        0,
        v_order.total_amount,
        'viettel',
        NULL,
        NULL,
        v_payment.paid_at,
        NULL,
        v_payment.created_by
      )
      RETURNING * INTO v_invoice;
      v_invoice_created := true;
    ELSIF v_invoice.status <> 'draft' OR v_invoice.invoice_number IS NOT NULL THEN
      RAISE EXCEPTION 'tax_invoice_issue_active_invoice_not_draft'
        USING ERRCODE = '55000';
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
        NULL,
        'draft',
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
    tenant_id,
    branch_id,
    order_id,
    payment_id,
    invoice_payload,
    tax_invoice_id,
    status,
    available_at
  ) VALUES (
    p_tenant_id,
    p_branch_id,
    p_order_id,
    p_payment_id,
    v_payload,
    CASE WHEN p_status = 'queued' THEN v_invoice.id ELSE NULL END,
    p_status,
    v_available_at
  )
  ON CONFLICT (tenant_id, order_id) DO UPDATE
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
  PERFORM private.sync_tax_invoice_issue_job_for_payment(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_tax_invoice_issue_job_after_payment_trigger()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
BEGIN
  FOR v_job IN
    SELECT job.*
    FROM public.tax_invoice_issue_jobs job
    JOIN public.payments payment
      ON payment.id = job.payment_id
     AND payment.tenant_id = job.tenant_id
     AND payment.branch_id = job.branch_id
     AND payment.order_id = job.order_id
    WHERE job.status = 'queued'
      AND job.tax_invoice_id IS NULL
      AND payment.status = 'completed'
      AND payment.paid_at IS NOT NULL
    ORDER BY job.id
  LOOP
    PERFORM private.upsert_tax_invoice_issue_job(
      v_job.tenant_id,
      v_job.branch_id,
      v_job.order_id,
      v_job.payment_id,
      v_job.invoice_payload,
      'queued'
    );
  END LOOP;
END;
$$;

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
  FROM public.tax_invoice_issue_jobs job
  JOIN public.payments payment
    ON payment.id = job.payment_id
   AND payment.tenant_id = job.tenant_id
   AND payment.branch_id = job.branch_id
   AND payment.order_id = job.order_id
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
    AND payment.tenant_id = NEW.tenant_id
    AND payment.branch_id = NEW.branch_id
    AND payment.order_id = NEW.order_id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL
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

CREATE TRIGGER trg_print_jobs_00_invoice_buyer_qr
  BEFORE INSERT OR UPDATE OF payload ON public.print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION private.attach_invoice_buyer_qr_to_print_job();

CREATE OR REPLACE FUNCTION private.attach_invoice_buyer_qr_document_to_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_blocks jsonb;
  v_footer_blocks jsonb;
BEGIN
  IF NEW.job_type <> 'receipt'
    OR COALESCE(jsonb_typeof(NEW.payload #> '{document,blocks}'), '') <> 'array'
  THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(
      jsonb_agg(entry.block ORDER BY entry.ordinal)
        FILTER (WHERE entry.block->>'type' = 'footer'),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(entry.block ORDER BY entry.ordinal)
        FILTER (
          WHERE entry.block->>'type' IS DISTINCT FROM 'paymentQr'
            AND entry.block->>'type' IS DISTINCT FROM 'invoiceQr'
            AND entry.block->>'type' IS DISTINCT FROM 'footer'
        ),
      '[]'::jsonb
    )
  INTO v_footer_blocks, v_blocks
  FROM jsonb_array_elements(NEW.payload #> '{document,blocks}')
    WITH ORDINALITY AS entry(block, ordinal);

  IF COALESCE(NEW.payload #>> '{invoice_qr,content}', '') <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_blocks) block
      WHERE block->>'type' = 'invoiceQr'
    )
  THEN
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object(
      'type', 'invoiceQr',
      'heading', 'QUÉT QR XUẤT HĐĐT',
      'qr', NEW.payload->'invoice_qr'
    ));
  END IF;

  v_blocks := v_blocks || v_footer_blocks;

  NEW.payload := jsonb_set(
    NEW.payload,
    '{document,blocks}',
    v_blocks
  );
  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION private.attach_invoice_buyer_qr_document_to_print_job()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_print_jobs_zz_invoice_buyer_qr_document
  BEFORE INSERT OR UPDATE OF payload ON public.print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION private.attach_invoice_buyer_qr_document_to_print_job();

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
  IF v_job.tax_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.tax_invoices
    WHERE id = v_job.tax_invoice_id
      AND tenant_id = v_request.tenant_id;
  END IF;

  v_state := CASE
    WHEN v_request.status = 'submitted' THEN 'submitted'
    WHEN v_request.status = 'expired' THEN 'expired'
    WHEN v_request.expires_at <= now() THEN 'expired'
    WHEN v_job.status = 'queued' AND v_invoice.status = 'draft' THEN 'open'
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
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_request public.tax_invoice_buyer_requests%ROWTYPE;
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
  v_buyer_payload jsonb;
  v_payload jsonb;
  v_existing_job_id bigint;
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
  IF v_buyer_payload->>'buyerNotGetInvoice' = 'true'
    OR COALESCE(v_buyer_payload->>'buyerTaxCode', '') = ''
    OR COALESCE(v_buyer_payload->>'buyerName', '') = ''
    OR COALESCE(v_buyer_payload->>'buyerAddress', '') = ''
    OR COALESCE(v_buyer_payload->>'buyerEmail', '') = ''
    OR jsonb_typeof(v_job.invoice_payload -> 'draftSnapshot') IS DISTINCT FROM 'object'
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
      'source', 'receipt_qr'
    ),
    'Buyer details confirmed from receipt QR'
  );

  UPDATE public.tax_invoice_buyer_requests
  SET status = 'submitted',
      submitted_payload = v_buyer_payload,
      submitted_at = now(),
      closed_at = now(),
      close_reason = 'customer_submitted',
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

CREATE OR REPLACE FUNCTION public.prepare_tax_invoice_issue_job_as_system(
  p_job_id bigint,
  p_tax_invoice_id bigint,
  p_provider_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_request public.tax_invoice_buyer_requests%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
  v_has_request boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_provider_ref), '') IS NULL THEN
    RAISE EXCEPTION 'provider_ref_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs job
  WHERE job.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_processing' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
  FROM public.tax_invoice_buyer_requests request
  WHERE request.tenant_id = v_job.tenant_id
    AND request.order_id = v_job.order_id
  FOR UPDATE;
  v_has_request := FOUND;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs job
  WHERE job.id = p_job_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_job.status <> 'processing'
    OR v_job.tax_invoice_id IS DISTINCT FROM p_tax_invoice_id
    OR jsonb_typeof(v_job.invoice_payload -> 'draftSnapshot') IS DISTINCT FROM 'object'
    THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_processing' USING ERRCODE = '22023';
  END IF;

  IF v_has_request AND v_request.status = 'open' THEN
    IF v_request.expires_at > now() THEN
      RAISE EXCEPTION 'tax_invoice_issue_job_not_ready' USING ERRCODE = '22023';
    END IF;

    UPDATE public.tax_invoice_buyer_requests
    SET status = 'expired',
        closed_at = now(),
        close_reason = 'deadline_elapsed',
        updated_at = now()
    WHERE id = v_request.id;
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.id = p_tax_invoice_id
    AND invoice.tenant_id = v_job.tenant_id
    AND invoice.order_id = v_job.order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_invoice.status <> 'draft'
    OR v_invoice.invoice_number IS NOT NULL
    OR v_invoice.invoice_time IS NULL THEN
    RAISE EXCEPTION 'tax_invoice_draft_not_issuable' USING ERRCODE = '22023';
  END IF;
  IF v_invoice.provider_ref IS NOT NULL
    AND v_invoice.provider_ref IS DISTINCT FROM btrim(p_provider_ref) THEN
    RAISE EXCEPTION 'tax_invoice_provider_ref_mismatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET status = 'signing',
      provider_ref = btrim(p_provider_ref),
      signing_started_at = now(),
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
    'signing',
    NULL,
    jsonb_build_object(
      'job_id', v_job.id,
      'provider_ref', btrim(p_provider_ref),
      'invoice_time', v_invoice.invoice_time
    ),
    'Payment-time draft reserved for provider submission'
  );

  RETURN jsonb_build_object(
    'id', v_invoice.id,
    'status', 'signing',
    'provider_ref', btrim(p_provider_ref)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_buyer_request_as_system(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_invoice_buyer_request_as_system(text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_tax_invoice_issue_job_as_system(
  bigint, bigint, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_buyer_request_as_system(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_invoice_buyer_request_as_system(text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_tax_invoice_issue_job_as_system(
  bigint, bigint, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_tax_invoice_issue_jobs(
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 300
) RETURNS TABLE (
  id bigint,
  tenant_id bigint,
  branch_id bigint,
  order_id bigint,
  payment_id bigint,
  invoice_payload jsonb,
  tax_invoice_id bigint,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tax_invoice_issue_jobs job
  SET status = 'reconcile_required',
      locked_until = NULL,
      last_error = 'lease_expired_provider_state_unknown',
      updated_at = now()
  FROM public.tax_invoices invoice
  WHERE job.tax_invoice_id = invoice.id
    AND job.status = 'processing'
    AND job.locked_until < now()
    AND invoice.status IN ('signing', 'submitted');

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM public.tax_invoice_issue_jobs job
    WHERE (
        job.status = 'queued'
        AND job.available_at <= now()
      )
      OR (
        job.status = 'processing'
        AND job.locked_until < now()
      )
    ORDER BY job.available_at, job.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20)
  ), claimed AS (
    UPDATE public.tax_invoice_issue_jobs job
    SET status = 'processing',
        locked_until = now() + make_interval(
          secs => LEAST(
            GREATEST(COALESCE(p_lease_seconds, 300), 30),
            900
          )
        ),
        attempt_count = job.attempt_count + 1,
        updated_at = now()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.tenant_id,
    claimed.branch_id,
    claimed.order_id,
    claimed.payment_id,
    claimed.invoice_payload,
    claimed.tax_invoice_id,
    claimed.attempt_count
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_tax_invoice_issue_job(
  p_job_id bigint,
  p_lease_seconds integer DEFAULT 300
) RETURNS TABLE (
  id bigint,
  tenant_id bigint,
  branch_id bigint,
  order_id bigint,
  payment_id bigint,
  invoice_payload jsonb,
  tax_invoice_id bigint,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tax_invoice_issue_jobs job
  SET status = 'reconcile_required',
      locked_until = NULL,
      last_error = 'lease_expired_provider_state_unknown',
      updated_at = now()
  FROM public.tax_invoices invoice
  WHERE job.id = p_job_id
    AND job.tax_invoice_id = invoice.id
    AND job.status = 'processing'
    AND job.locked_until < now()
    AND invoice.status IN ('signing', 'submitted');

  RETURN QUERY
  WITH candidate AS (
    SELECT job.id
    FROM public.tax_invoice_issue_jobs job
    WHERE job.id = p_job_id
      AND (
        (
          job.status = 'queued'
          AND job.available_at <= now()
        )
        OR (
          job.status = 'processing'
          AND job.locked_until < now()
        )
      )
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.tax_invoice_issue_jobs job
    SET status = 'processing',
        locked_until = now() + make_interval(
          secs => LEAST(
            GREATEST(COALESCE(p_lease_seconds, 300), 30),
            900
          )
        ),
        attempt_count = job.attempt_count + 1,
        updated_at = now()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.tenant_id,
    claimed.branch_id,
    claimed.order_id,
    claimed.payment_id,
    claimed.invoice_payload,
    claimed.tax_invoice_id,
    claimed.attempt_count
  FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tax_invoice_issue_jobs(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_tax_invoice_issue_job(bigint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tax_invoice_issue_jobs(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_tax_invoice_issue_job(bigint, integer)
  TO service_role;

-- Hosted Supabase may grant EXECUTE directly to API roles on function creation.
-- Reset exact principals before restoring the intended application callers.
REVOKE ALL ON FUNCTION public.confirm_cash_payment_with_invoice_binding(
  bigint, numeric, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fetch_tax_invoice_issue_attention()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_tax_invoice_provider_submission(
  bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_tax_invoice_issue_job_for_completed_order(
  bigint, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reconcile_tax_invoice_provider_issued(
  bigint, text, text, text, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.requeue_tax_invoice_issue_job(bigint)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.confirm_cash_payment_with_invoice_binding(
  bigint, numeric, jsonb
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_tax_invoice_issue_attention()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_tax_invoice_provider_submission(
  bigint, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_tax_invoice_issue_job_for_completed_order(
  bigint, jsonb
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_tax_invoice_provider_issued(
  bigint, text, text, text, jsonb, timestamptz, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.requeue_tax_invoice_issue_job(bigint)
  TO authenticated, service_role;

COMMENT ON COLUMN public.tax_invoices.invoice_time IS
  'Legal invoice time captured from payments.paid_at and sent as Viettel invoiceIssuedDate.';
COMMENT ON TABLE public.tax_invoice_buyer_requests IS
  'Receipt-QR buyer identity window for one payment-time HĐĐT draft.';
COMMENT ON COLUMN public.tax_invoice_issue_jobs.available_at IS
  'Earliest provider claim time; defaults to payments.paid_at plus two hours.';

COMMIT;
