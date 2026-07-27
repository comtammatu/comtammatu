-- Greenfield: central site location defaults + seed, VAT invoice payment evidence.
-- Authority: D082 / D083 / ADR 0017. Target: matu-greenfield-company only.

-- ── 1) Location defaults for central_supply / central_kitchen ───────────────

CREATE OR REPLACE FUNCTION public.ensure_branch_inventory_location_defaults(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branch_kind TEXT;
  v_warehouse_id BIGINT;
  v_warehouse_name TEXT;
  v_needs_default_receive BOOLEAN;
  v_needs_default_issue BOOLEAN;
  v_needs_default_consumption BOOLEAN;
BEGIN
  SELECT branch_kind
  INTO v_branch_kind
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND
     OR v_branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RETURN;
  END IF;

  v_warehouse_name := CASE v_branch_kind
    WHEN 'central_supply' THEN 'Kho Tổng'
    WHEN 'central_kitchen' THEN 'Kho Bếp Trung Tâm'
    ELSE 'Kho chi nhánh'
  END;

  SELECT il.id
  INTO v_warehouse_id
  FROM public.inventory_locations il
  WHERE il.tenant_id = p_tenant_id
    AND il.branch_id = p_branch_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_receive DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  v_needs_default_receive := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
  );

  v_needs_default_issue := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_issue = TRUE
      AND il.is_active = TRUE
  );

  v_needs_default_consumption := NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = p_branch_id
      AND il.is_default_consumption = TRUE
      AND il.is_active = TRUE
  );

  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active,
      is_default_receive,
      is_default_issue,
      is_default_consumption,
      sort_order
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      'main_warehouse',
      v_warehouse_name,
      'warehouse',
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      0
    )
    ON CONFLICT (code, branch_id, tenant_id) DO UPDATE
    SET name = EXCLUDED.name,
        location_kind = 'warehouse',
        is_active = TRUE,
        is_default_receive = TRUE,
        is_default_issue = TRUE,
        is_default_consumption = TRUE,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    RETURNING id INTO v_warehouse_id;
  ELSE
    UPDATE public.inventory_locations
    SET
      name = CASE
        WHEN location_kind = 'warehouse' THEN v_warehouse_name
        ELSE name
      END,
      is_default_receive = CASE
        WHEN v_needs_default_receive OR is_default_receive THEN TRUE
        ELSE is_default_receive
      END,
      is_default_issue = CASE
        WHEN v_needs_default_issue OR is_default_issue THEN TRUE
        ELSE is_default_issue
      END,
      is_default_consumption = CASE
        WHEN v_needs_default_consumption OR is_default_consumption THEN TRUE
        ELSE is_default_consumption
      END,
      updated_at = now()
    WHERE id = v_warehouse_id;
  END IF;

  UPDATE public.inventory_locations
  SET is_active = FALSE,
      is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = FALSE,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND location_kind = 'kitchen'
    AND (
      is_active = TRUE
      OR is_default_receive = TRUE
      OR is_default_issue = TRUE
      OR is_default_consumption = TRUE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ensure_branch_inventory_location_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.branch_kind IN ('branch', 'central_supply', 'central_kitchen') THEN
    PERFORM public.ensure_branch_inventory_location_defaults(NEW.tenant_id, NEW.id);
  END IF;

  IF NEW.branch_kind = 'branch' THEN
    INSERT INTO public.branch_feature_flags (
      branch_id,
      flag_key,
      enabled,
      enabled_at,
      disabled_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'pos_stock_outcome_posting',
      TRUE,
      now(),
      NULL,
      now()
    )
    ON CONFLICT (branch_id, flag_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2) Idempotent seed: Kho Tổng + Bếp Trung Tâm per tenant ────────────────
-- Update existing rows first, then INSERT only missing names.
-- Never INSERT … ON CONFLICT here: Postgres still advances branches_id_seq on
-- a conflicted row, which burns ids (Greenfield: Kho Tổng conflict → Bếp TT id=3).

UPDATE public.branches AS b
SET
  branch_kind = v.kind,
  is_active = TRUE,
  updated_at = now()
FROM public.tenants AS t
CROSS JOIN (
  VALUES
    ('Kho Tổng', 'central_supply'::text),
    ('Bếp Trung Tâm', 'central_kitchen'::text)
) AS v(name, kind)
WHERE b.tenant_id = t.id
  AND b.name = v.name
  AND (
    b.branch_kind IS DISTINCT FROM v.kind
    OR b.is_active IS DISTINCT FROM TRUE
  );

INSERT INTO public.branches (tenant_id, name, branch_kind, is_active)
SELECT t.id, v.name, v.kind, TRUE
FROM public.tenants AS t
CROSS JOIN (
  VALUES
    ('Kho Tổng', 'central_supply'::text),
    ('Bếp Trung Tâm', 'central_kitchen'::text)
) AS v(name, kind)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.branches AS existing
  WHERE existing.tenant_id = t.id
    AND existing.name = v.name
);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.tenant_id, b.id
    FROM public.branches AS b
    WHERE b.branch_kind IN ('central_supply', 'central_kitchen')
      AND b.is_active = TRUE
  LOOP
    PERFORM public.ensure_branch_inventory_location_defaults(r.tenant_id, r.id);
  END LOOP;
END;
$$;

-- ── 3) VAT invoice attachment column + storage bucket ──────────────────────

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS vat_invoice_attachment_path text;

COMMENT ON COLUMN public.supplier_invoices.vat_invoice_attachment_path IS
  'Private storage path for HĐ GTGT evidence; required before record_supplier_payment.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-invoice-attachments',
  'supplier-invoice-attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "supplier_invoice_attach_insert" ON storage.objects;
CREATE POLICY "supplier_invoice_attach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-invoice-attachments'
    AND (storage.foldername(name))[1] = (public.auth_tenant_id())::text
    AND (
      public.has_permission_any('finance:ap_pay')
      OR public.has_permission_any('procurement:invoice_create')
    )
  );

DROP POLICY IF EXISTS "supplier_invoice_attach_select" ON storage.objects;
CREATE POLICY "supplier_invoice_attach_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-invoice-attachments'
    AND (storage.foldername(name))[1] = (public.auth_tenant_id())::text
    AND (
      public.has_permission_any('finance:ap_pay')
      OR public.has_permission_any('procurement:read')
      OR public.has_permission_any('finance:view')
    )
  );

DROP POLICY IF EXISTS "supplier_invoice_attach_update" ON storage.objects;
CREATE POLICY "supplier_invoice_attach_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'supplier-invoice-attachments'
    AND (storage.foldername(name))[1] = (public.auth_tenant_id())::text
    AND (
      public.has_permission_any('finance:ap_pay')
      OR public.has_permission_any('procurement:invoice_create')
    )
  )
  WITH CHECK (
    bucket_id = 'supplier-invoice-attachments'
    AND (storage.foldername(name))[1] = (public.auth_tenant_id())::text
    AND (
      public.has_permission_any('finance:ap_pay')
      OR public.has_permission_any('procurement:invoice_create')
    )
  );

DROP POLICY IF EXISTS "supplier_invoice_attach_delete" ON storage.objects;
CREATE POLICY "supplier_invoice_attach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-invoice-attachments'
    AND (storage.foldername(name))[1] = (public.auth_tenant_id())::text
    AND (
      public.has_permission_any('finance:ap_pay')
      OR public.has_permission_any('procurement:invoice_create')
    )
  );

-- ── 4) Attach evidence RPC ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.attach_supplier_invoice_vat_evidence(
  p_invoice_id bigint,
  p_storage_path text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_path text := NULLIF(pg_catalog.btrim(p_storage_path), '');
  v_prefix text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(v_uid)
    OR NOT (
      public.has_permission_any('finance:ap_pay')
      OR public.has_permission_any('procurement:invoice_create')
    ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_invoice_id IS NULL OR v_path IS NULL THEN
    RAISE EXCEPTION 'invalid_vat_invoice_attachment' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(v_path) > 500
     OR v_path ~ '[[:space:]]'
     OR v_path LIKE '%..%' THEN
    RAISE EXCEPTION 'invalid_vat_invoice_attachment_path' USING ERRCODE = '22023';
  END IF;

  v_prefix := v_tenant::text || '/';
  IF v_path NOT LIKE v_prefix || '%' THEN
    RAISE EXCEPTION 'vat_invoice_attachment_tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.supplier_invoices AS si
  SET vat_invoice_attachment_path = v_path,
      updated_at = pg_catalog.now()
  WHERE si.id = p_invoice_id
    AND si.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_supplier_invoice_vat_evidence(bigint, text) TO service_role;

-- ── 5) Gate record_supplier_payment on VAT attachment ──────────────────────

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

  IF v_invoice.vat_invoice_attachment_path IS NULL
     OR pg_catalog.btrim(v_invoice.vat_invoice_attachment_path) = '' THEN
    RAISE EXCEPTION 'vat_invoice_attachment_required' USING ERRCODE = 'P0001';
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
