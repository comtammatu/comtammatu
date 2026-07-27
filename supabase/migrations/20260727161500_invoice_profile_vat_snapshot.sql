CREATE TABLE public.invoice_profiles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  provider text NOT NULL CHECK (provider = 'viettel'),
  seller_tax_code text
    CHECK (
      seller_tax_code IS NULL
      OR seller_tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'
    ),
  template_code text NOT NULL CHECK (template_code ~ '^1/'),
  invoice_series text NOT NULL CHECK (btrim(invoice_series) <> ''),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'retired')),
  valid_from timestamptz NOT NULL,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, version),
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);

CREATE UNIQUE INDEX invoice_profiles_one_active_per_tenant
  ON public.invoice_profiles (tenant_id)
  WHERE status = 'active';

ALTER TABLE public.invoice_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.invoice_profiles TO authenticated, service_role;

CREATE POLICY invoice_profiles_read_same_tenant
ON public.invoice_profiles
FOR SELECT
TO authenticated
USING (tenant_id = (SELECT public.auth_tenant_id()));

CREATE OR REPLACE FUNCTION private.validate_invoice_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'active'))
    OR (OLD.status = 'active' AND NEW.status NOT IN ('active', 'retired'))
    OR (OLD.status = 'retired' AND NEW.status <> 'retired')
  ) THEN
    RAISE EXCEPTION 'invoice_profile_status_transition_invalid'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.seller_tax_code IS DISTINCT FROM OLD.seller_tax_code
    OR NEW.template_code IS DISTINCT FROM OLD.template_code
    OR NEW.invoice_series IS DISTINCT FROM OLD.invoice_series
    OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
  ) THEN
    RAISE EXCEPTION 'invoice_profile_business_fields_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'active' THEN
    SELECT * INTO v_tenant
    FROM public.tenants
    WHERE id = NEW.tenant_id;

    IF NOT FOUND
      OR NULLIF(btrim(v_tenant.legal_name), '') IS NULL
      OR NULLIF(btrim(v_tenant.tax_code), '') IS NULL
      OR NULLIF(btrim(v_tenant.legal_address), '') IS NULL
      OR NULLIF(btrim(v_tenant.representative), '') IS NULL THEN
      RAISE EXCEPTION 'invoice_profile_legal_identity_incomplete'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.seller_tax_code IS DISTINCT FROM v_tenant.tax_code THEN
      RAISE EXCEPTION 'invoice_profile_seller_tax_code_mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_profiles_validate
BEFORE INSERT OR UPDATE ON public.invoice_profiles
FOR EACH ROW EXECUTE FUNCTION private.validate_invoice_profile();

INSERT INTO public.invoice_profiles (
  tenant_id,
  version,
  provider,
  seller_tax_code,
  template_code,
  invoice_series,
  status,
  valid_from,
  created_by
)
SELECT
  tenant.id,
  1,
  'viettel',
  CASE
    WHEN tenant.tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'
      THEN tenant.tax_code
    ELSE NULL
  END,
  '1/001',
  'C26TCS',
  'draft',
  now(),
  tenant.owner_user_id
FROM public.tenants tenant
ON CONFLICT (tenant_id, version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.activate_invoice_profile()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_tenant public.tenants%ROWTYPE;
  v_profile public.invoice_profiles%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'invoice_profile_activation_forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT tenant.* INTO v_tenant
  FROM public.tenants tenant
  WHERE tenant.id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_profile_tenant_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NULLIF(btrim(v_tenant.legal_name), '') IS NULL
    OR NULLIF(btrim(v_tenant.tax_code), '') IS NULL
    OR v_tenant.tax_code !~ '^[0-9]{10}(-[0-9]{3})?$'
    OR NULLIF(btrim(v_tenant.legal_address), '') IS NULL
    OR NULLIF(btrim(v_tenant.representative), '') IS NULL THEN
    RAISE EXCEPTION 'invoice_profile_legal_identity_incomplete'
      USING ERRCODE = '23514';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.invoice_profiles profile
  WHERE profile.tenant_id = v_tenant_id
    AND profile.status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF v_profile.seller_tax_code IS DISTINCT FROM v_tenant.tax_code THEN
      RAISE EXCEPTION 'invoice_profile_seller_tax_code_mismatch'
        USING ERRCODE = '23514';
    END IF;
    RETURN v_profile.id;
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.invoice_profiles profile
  WHERE profile.tenant_id = v_tenant_id
    AND profile.status = 'draft'
  ORDER BY profile.version DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_profile_draft_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.invoice_profiles
  SET seller_tax_code = v_tenant.tax_code,
      status = 'active',
      valid_from = now(),
      created_by = COALESCE(created_by, v_actor_id)
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  RETURN v_profile.id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_invoice_profile()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.activate_invoice_profile()
  TO authenticated;

ALTER TABLE public.menu_items
  ALTER COLUMN vat_rate DROP DEFAULT;

ALTER TABLE public.order_items
  ALTER COLUMN vat_rate SET NOT NULL;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_vat_rate_check,
  ADD CONSTRAINT order_items_vat_rate_check
    CHECK (vat_rate IN (0, 5, 8, 10));

ALTER TABLE public.tax_invoices
  ALTER COLUMN vat_rate DROP NOT NULL,
  ADD COLUMN invoice_profile_id bigint
    REFERENCES public.invoice_profiles(id) ON DELETE RESTRICT,
  ADD COLUMN invoice_profile_version integer,
  ADD COLUMN template_code text,
  ADD COLUMN seller_name text,
  ADD COLUMN seller_tax_code text,
  ADD COLUMN seller_address text,
  ADD COLUMN invoice_snapshot jsonb,
  ADD CONSTRAINT tax_invoices_profile_snapshot_check CHECK (
    (invoice_profile_id IS NULL
      AND invoice_profile_version IS NULL
      AND template_code IS NULL
      AND seller_name IS NULL
      AND seller_tax_code IS NULL
      AND seller_address IS NULL
      AND invoice_snapshot IS NULL)
    OR
    (invoice_profile_id IS NOT NULL
      AND invoice_profile_version IS NOT NULL
      AND template_code ~ '^1/'
      AND NULLIF(btrim(seller_name), '') IS NOT NULL
      AND seller_tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'
      AND NULLIF(btrim(seller_address), '') IS NOT NULL
      AND jsonb_typeof(invoice_snapshot) = 'object')
  );

ALTER TABLE public.tax_invoice_issue_jobs
  ADD COLUMN operation text NOT NULL DEFAULT 'issue'
    CHECK (operation IN ('issue', 'replace', 'adjust')),
  ADD COLUMN submission_snapshot jsonb;

ALTER TABLE public.tax_invoice_issue_jobs
  DROP CONSTRAINT tax_invoice_issue_jobs_one_per_order;

CREATE UNIQUE INDEX tax_invoice_issue_jobs_one_initial_issue
  ON public.tax_invoice_issue_jobs (tenant_id, order_id)
  WHERE operation = 'issue';

CREATE UNIQUE INDEX tax_invoice_issue_jobs_one_per_invoice
  ON public.tax_invoice_issue_jobs (tax_invoice_id)
  WHERE tax_invoice_id IS NOT NULL;

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

CREATE TRIGGER trg_tax_invoice_jobs_snapshot
BEFORE INSERT OR UPDATE OF status, invoice_payload
ON public.tax_invoice_issue_jobs
FOR EACH ROW EXECUTE FUNCTION private.snapshot_invoice_job();

CREATE OR REPLACE FUNCTION public.prepare_tax_invoice_issue_job_as_system(
  p_job_id bigint,
  p_tax_invoice_id bigint,
  p_provider_ref text,
  p_submission_snapshot jsonb,
  p_subtotal numeric,
  p_vat_amount numeric,
  p_total_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice public.tax_invoices%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_submission_snapshot) IS DISTINCT FROM 'object'
    OR p_subtotal < 0 OR p_vat_amount < 0
    OR p_subtotal + p_vat_amount IS DISTINCT FROM p_total_amount THEN
    RAISE EXCEPTION 'invoice_submission_snapshot_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs
  WHERE id = p_job_id AND tax_invoice_id = p_tax_invoice_id
  FOR UPDATE;
  SELECT * INTO v_invoice
  FROM public.tax_invoices
  WHERE id = p_tax_invoice_id AND id = v_job.tax_invoice_id
  FOR UPDATE;

  IF v_job.id IS NULL OR v_invoice.id IS NULL
    OR v_job.status <> 'processing' OR v_invoice.status <> 'draft'
    OR v_invoice.invoice_snapshot IS NULL THEN
    RAISE EXCEPTION 'invoice_prepare_state_invalid' USING ERRCODE = '55000';
  END IF;
  IF v_job.submission_snapshot IS NOT NULL
    AND v_job.submission_snapshot IS DISTINCT FROM p_submission_snapshot THEN
    RAISE EXCEPTION 'invoice_submission_snapshot_immutable'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.tax_invoice_issue_jobs
  SET submission_snapshot = COALESCE(submission_snapshot, p_submission_snapshot),
      updated_at = now()
  WHERE id = v_job.id;

  UPDATE public.tax_invoices
  SET subtotal = p_subtotal,
      vat_rate = NULL,
      vat_amount = p_vat_amount,
      total_amount = p_total_amount,
      provider_ref = btrim(p_provider_ref),
      invoice_snapshot = invoice_snapshot
        || jsonb_build_object('submissionSnapshot', p_submission_snapshot),
      status = 'signing',
      signing_started_at = now(),
      updated_at = now()
  WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;

  RETURN jsonb_build_object('id', v_invoice.id, 'status', v_invoice.status);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_tax_invoice_issue_job_as_system(
  bigint, bigint, text, jsonb, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_tax_invoice_issue_job_as_system(
  bigint, bigint, text, jsonb, numeric, numeric, numeric
) TO service_role;

CREATE FUNCTION public.get_tax_invoice_submission_snapshot_as_system(
  p_job_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT submission_snapshot
    FROM public.tax_invoice_issue_jobs
    WHERE id = p_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tax_invoice_submission_snapshot_as_system(
  bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_invoice_submission_snapshot_as_system(
  bigint
) TO service_role;

CREATE OR REPLACE FUNCTION private.finalize_issued_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_old public.tax_invoices%ROWTYPE;
BEGIN
  IF NEW.status <> 'issued' OR OLD.status = 'issued' OR NEW.replaced_for IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_old
  FROM public.tax_invoices
  WHERE id = NEW.replaced_for
  FOR UPDATE;
  IF v_old.id IS NULL OR v_old.status <> 'issued' OR v_old.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'replacement_original_state_invalid'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.tax_invoices
  SET status = 'replaced',
      replaced_by = NEW.id,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = v_old.id;

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
  ) VALUES (
    v_old.id, v_old.tenant_id, 'issued', 'replaced', auth.uid(),
    jsonb_build_object('replaced_by', NEW.id),
    'Replacement confirmed by provider'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tax_invoices_finalize_replacement
AFTER UPDATE OF status ON public.tax_invoices
FOR EACH ROW EXECUTE FUNCTION private.finalize_issued_replacement();

DROP FUNCTION public.replace_tax_invoice(
  bigint, text, text, timestamptz, text, text, text,
  numeric, numeric, numeric, numeric, text
);

CREATE FUNCTION public.reserve_tax_invoice_replacement(
  p_old_id bigint,
  p_reason text,
  p_agreement_ref text,
  p_agreement_date timestamptz,
  p_buyer_name text,
  p_buyer_tax_code text,
  p_buyer_address text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_old public.tax_invoices%ROWTYPE;
  v_actor uuid := auth.uid();
  v_new_id bigint;
  v_payload jsonb;
  v_payment_id bigint;
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(NULL, 'settings:tenant') THEN
    RAISE EXCEPTION 'replacement_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) < 20
    OR length(p_reason) > 255
    OR NULLIF(btrim(p_agreement_ref), '') IS NULL
    OR length(p_agreement_ref) > 225 THEN
    RAISE EXCEPTION 'replacement_reference_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.tax_invoices
  WHERE id = p_old_id
  FOR UPDATE;
  IF v_old.id IS NULL OR v_old.tenant_id IS DISTINCT FROM public.auth_tenant_id()
    OR v_old.status <> 'issued' OR v_old.replaced_by IS NOT NULL
    OR v_old.invoice_kind <> 'per_order' OR v_old.invoice_snapshot IS NULL THEN
    RAISE EXCEPTION 'replacement_original_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_agreement_date > now()
    OR (v_old.issued_at IS NOT NULL AND p_agreement_date < v_old.issued_at) THEN
    RAISE EXCEPTION 'replacement_agreement_date_invalid'
      USING ERRCODE = '22008';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tax_invoices
    WHERE replaced_for = v_old.id
      AND status IN ('draft', 'signing', 'submitted', 'issued')
  ) THEN
    RAISE EXCEPTION 'replacement_already_pending' USING ERRCODE = '55000';
  END IF;

  v_payload := jsonb_set(
    v_old.invoice_snapshot - 'submissionSnapshot',
    '{draftSnapshot,invoiceTime}',
    to_jsonb(now()),
    true
  ) || jsonb_build_object(
    'buyerName', COALESCE(p_buyer_name, ''),
    'buyerTaxCode', NULLIF(btrim(p_buyer_tax_code), ''),
    'buyerAddress', NULLIF(btrim(p_buyer_address), ''),
    'buyerNotGetInvoice',
      NULLIF(btrim(p_buyer_name), '') IS NULL
      AND NULLIF(btrim(p_buyer_tax_code), '') IS NULL
      AND NULLIF(btrim(p_buyer_address), '') IS NULL,
    'replacement',
      jsonb_build_object(
        'originalInvoiceNumber', v_old.invoice_number,
        'originalIssuedAt', v_old.issued_at,
        'originalInvoiceType', '1',
        'originalTemplateCode', split_part(v_old.template_code, '/', 1),
        'reason', p_reason,
        'agreementRef', p_agreement_ref,
        'agreementDate', p_agreement_date
      )
  );

  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id, status, invoice_kind,
    buyer_name, buyer_tax_code, buyer_address,
    subtotal, vat_rate, vat_amount, total_amount,
    provider, replaced_for, created_by,
    invoice_profile_id, invoice_profile_version, template_code, invoice_series,
    seller_name, seller_tax_code, seller_address, invoice_snapshot
  ) VALUES (
    v_old.tenant_id, v_old.branch_id, v_old.order_id, 'draft', 'per_order',
    p_buyer_name, NULLIF(btrim(p_buyer_tax_code), ''),
    NULLIF(btrim(p_buyer_address), ''),
    v_old.subtotal, NULL, v_old.vat_amount, v_old.total_amount,
    v_old.provider, v_old.id, v_actor,
    v_old.invoice_profile_id, v_old.invoice_profile_version,
    v_old.template_code, v_old.invoice_series,
    v_old.seller_name, v_old.seller_tax_code, v_old.seller_address, v_payload
  ) RETURNING id INTO v_new_id;

  SELECT payment_id INTO v_payment_id
  FROM public.tax_invoice_issue_jobs
  WHERE tax_invoice_id = v_old.id
  ORDER BY id DESC LIMIT 1;

  INSERT INTO public.tax_invoice_issue_jobs (
    tenant_id, branch_id, order_id, payment_id, invoice_payload,
    tax_invoice_id, status, available_at, operation
  ) VALUES (
    v_old.tenant_id, v_old.branch_id, v_old.order_id, v_payment_id, v_payload,
    v_new_id, 'queued', now(), 'replace'
  );

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
  ) VALUES (
    v_new_id, v_old.tenant_id, NULL, 'draft', v_actor,
    jsonb_build_object('replaces', v_old.id),
    'Replacement reserved; original remains issued'
  );
  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tax_invoice_replacement(
  bigint, text, text, timestamptz, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_tax_invoice_replacement(
  bigint, text, text, timestamptz, text, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finish_tax_invoice_issue_job_as_system(
  p_job_id bigint,
  p_status text,
  p_last_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_invoice_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('completed', 'blocked', 'reconcile_required', 'queued') THEN
    RAISE EXCEPTION 'invalid_tax_invoice_issue_job_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.tax_invoice_issue_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'tax_invoice_issue_job_not_processing' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'completed' THEN
    SELECT invoice.status INTO v_invoice_status
    FROM public.tax_invoices invoice
    WHERE invoice.id = v_job.tax_invoice_id
      AND invoice.tenant_id = v_job.tenant_id;
    IF NOT FOUND OR v_invoice_status <> 'issued' THEN
      RAISE EXCEPTION 'tax_invoice_issue_job_not_issued' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.tax_invoice_issue_jobs
  SET status = p_status,
      locked_until = NULL,
      last_error = p_last_error,
      updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object('job_id', v_job.id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.finish_tax_invoice_issue_job_as_system(
  bigint, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_tax_invoice_issue_job_as_system(
  bigint, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_tax_invoice_provider_issued(
  p_tax_invoice_id bigint,
  p_provider_ref text,
  p_invoice_number text,
  p_cqt_code text DEFAULT NULL,
  p_provider_data jsonb DEFAULT NULL,
  p_issued_at timestamptz DEFAULT now(),
  p_trigger_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.tax_invoices%ROWTYPE;
  v_before_status text;
BEGIN
  IF p_trigger_source NOT IN ('manual', 'cron') THEN
    RAISE EXCEPTION 'invalid_reconcile_trigger_source' USING ERRCODE = '22023';
  END IF;
  IF auth.role() <> 'service_role' THEN
    IF v_actor IS NULL
      OR v_tenant IS NULL
      OR NOT public.auth_is_owner(v_actor)
      OR NOT public.has_permission_any('settings:tenant')
      OR NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NULLIF(btrim(p_provider_ref), '') IS NULL
    OR NULLIF(btrim(p_invoice_number), '') IS NULL THEN
    RAISE EXCEPTION 'provider_ref_and_invoice_number_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.id = p_tax_invoice_id
    AND (auth.role() = 'service_role' OR invoice.tenant_id = v_tenant)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.status NOT IN ('signing', 'submitted') THEN
    RAISE EXCEPTION 'tax_invoice_reconcile_status_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_invoice.provider_ref IS DISTINCT FROM btrim(p_provider_ref) THEN
    RAISE EXCEPTION 'tax_invoice_provider_ref_mismatch'
      USING ERRCODE = '22023';
  END IF;

  v_before_status := v_invoice.status;
  UPDATE public.tax_invoices
  SET invoice_number = btrim(p_invoice_number),
      cqt_code = NULLIF(btrim(p_cqt_code), ''),
      provider_data = COALESCE(p_provider_data, provider_data),
      issued_at = COALESCE(p_issued_at, now()),
      status = 'issued',
      updated_at = now()
  WHERE id = v_invoice.id;

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
  ) VALUES (
    v_invoice.id,
    v_invoice.tenant_id,
    v_before_status,
    'issued',
    v_actor,
    jsonb_build_object(
      'provider_ref', btrim(p_provider_ref),
      'invoice_number', btrim(p_invoice_number),
      'cqt_code', NULLIF(btrim(p_cqt_code), ''),
      'trigger_source', p_trigger_source
    ) || COALESCE(p_provider_data, '{}'::jsonb),
    'Provider-issued invoice reconciled'
  );

  INSERT INTO public.reconcile_run_log (
    tenant_id, branch_id, tax_invoice_id, trigger_source, triggered_by,
    before_status, after_status, provider_returned, outcome, error,
    attempt_age_seconds
  ) VALUES (
    v_invoice.tenant_id,
    v_invoice.branch_id,
    v_invoice.id,
    p_trigger_source,
    v_actor,
    v_before_status,
    'issued',
    'issued',
    'transitioned',
    NULL,
    GREATEST(
      0,
      EXTRACT(
        EPOCH FROM (
          now() - COALESCE(v_invoice.signing_started_at, v_invoice.updated_at)
        )
      )::integer
    )
  );

  UPDATE public.tax_invoice_issue_jobs job
  SET status = 'completed',
      locked_until = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE job.tax_invoice_id = v_invoice.id
    AND job.status <> 'completed';

  RETURN jsonb_build_object(
    'id', v_invoice.id,
    'status', 'issued',
    'invoice_number', btrim(p_invoice_number)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_tax_invoice_provider_issued(
  bigint, text, text, text, jsonb, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_tax_invoice_provider_issued(
  bigint, text, text, text, jsonb, timestamptz, text
) TO authenticated, service_role;
