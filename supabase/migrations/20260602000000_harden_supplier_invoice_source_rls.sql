-- ============================================================================
-- Supplier invoice source-scoped RLS
--
-- Supplier invoices inherit branch scope from their linked GRN first, then PO.
-- Direct supplier-only invoice rows cannot prove a branch boundary, so new rows
-- must carry at least one source link.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_invoices_source_required'
      AND conrelid = 'public.supplier_invoices'::regclass
  ) THEN
    ALTER TABLE public.supplier_invoices
      ADD CONSTRAINT supplier_invoices_source_required
      CHECK (grn_id IS NOT NULL OR po_id IS NOT NULL)
      NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.can_access_supplier_invoice_source(
  p_tenant_id BIGINT,
  p_supplier_id BIGINT,
  p_grn_id BIGINT,
  p_po_id BIGINT,
  p_permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_source_branch_id BIGINT;
  v_source_supplier_id BIGINT;
  v_source_po_id BIGINT;
BEGIN
  IF v_tenant_id IS NULL
     OR p_tenant_id IS DISTINCT FROM v_tenant_id
     OR p_permission_key IS NULL
     OR btrim(p_permission_key) = '' THEN
    RETURN false;
  END IF;

  IF p_grn_id IS NOT NULL THEN
    SELECT grn.branch_id, grn.supplier_id, grn.po_id
      INTO v_source_branch_id, v_source_supplier_id, v_source_po_id
    FROM public.goods_received_notes AS grn
    WHERE grn.id = p_grn_id
      AND grn.tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;

    IF v_source_supplier_id IS DISTINCT FROM p_supplier_id THEN
      RETURN false;
    END IF;

    IF p_po_id IS NOT NULL AND p_po_id IS DISTINCT FROM v_source_po_id THEN
      RETURN false;
    END IF;

    RETURN public.has_permission(v_source_branch_id, p_permission_key);
  END IF;

  IF p_po_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT po.branch_id, po.supplier_id
    INTO v_source_branch_id, v_source_supplier_id
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_source_supplier_id IS DISTINCT FROM p_supplier_id THEN
    RETURN false;
  END IF;

  RETURN public.has_permission(v_source_branch_id, p_permission_key);
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_supplier_invoice_source(BIGINT, BIGINT, BIGINT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_supplier_invoice_source(BIGINT, BIGINT, BIGINT, BIGINT, TEXT)
  TO authenticated;

DROP POLICY IF EXISTS "supplier_invoices_manage" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_select" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_write" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_insert" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_update" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_delete" ON public.supplier_invoices;

CREATE POLICY "supplier_invoices_select" ON public.supplier_invoices
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      private.can_access_supplier_invoice_source(
        tenant_id,
        supplier_id,
        grn_id,
        po_id,
        'procurement:read'
      )
      OR private.can_access_supplier_invoice_source(
        tenant_id,
        supplier_id,
        grn_id,
        po_id,
        'procurement:invoice_create'
      )
      OR private.can_access_supplier_invoice_source(
        tenant_id,
        supplier_id,
        grn_id,
        po_id,
        'procurement:invoice_match'
      )
    )
  );

CREATE POLICY "supplier_invoices_insert" ON public.supplier_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_supplier_invoice_source(
      tenant_id,
      supplier_id,
      grn_id,
      po_id,
      'procurement:invoice_create'
    )
  );

CREATE POLICY "supplier_invoices_update" ON public.supplier_invoices
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      private.can_access_supplier_invoice_source(
        tenant_id,
        supplier_id,
        grn_id,
        po_id,
        'procurement:invoice_create'
      )
      OR private.can_access_supplier_invoice_source(
        tenant_id,
        supplier_id,
        grn_id,
        po_id,
        'procurement:invoice_match'
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      private.can_access_supplier_invoice_source(
        tenant_id,
        supplier_id,
        grn_id,
        po_id,
        'procurement:invoice_create'
      )
      OR private.can_access_supplier_invoice_source(
        tenant_id,
        supplier_id,
        grn_id,
        po_id,
        'procurement:invoice_match'
      )
    )
  );

CREATE POLICY "supplier_invoices_delete" ON public.supplier_invoices
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_supplier_invoice_source(
      tenant_id,
      supplier_id,
      grn_id,
      po_id,
      'procurement:invoice_create'
    )
  );
