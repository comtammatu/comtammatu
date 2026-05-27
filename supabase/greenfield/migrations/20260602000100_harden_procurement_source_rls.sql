-- GREENFIELD_ONLY: rehearsal SQL for staging jmasiwuqiyedqvyfzhuq; not part of supabase/migrations.
-- ============================================================================
-- Procurement source-scoped RLS
--
-- PO and GRN headers carry the branch boundary directly. Line items inherit
-- that boundary from their parent header through private helper functions.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.can_access_purchase_order_source(
  p_tenant_id BIGINT,
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
BEGIN
  IF v_tenant_id IS NULL
     OR p_tenant_id IS DISTINCT FROM v_tenant_id
     OR p_po_id IS NULL
     OR p_permission_key IS NULL
     OR btrim(p_permission_key) = '' THEN
    RETURN false;
  END IF;

  SELECT po.branch_id
    INTO v_source_branch_id
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN public.has_permission(v_source_branch_id, p_permission_key);
END;
$$;

CREATE OR REPLACE FUNCTION private.can_access_grn_source(
  p_tenant_id BIGINT,
  p_grn_id BIGINT,
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
BEGIN
  IF v_tenant_id IS NULL
     OR p_tenant_id IS DISTINCT FROM v_tenant_id
     OR p_grn_id IS NULL
     OR p_permission_key IS NULL
     OR btrim(p_permission_key) = '' THEN
    RETURN false;
  END IF;

  SELECT grn.branch_id
    INTO v_source_branch_id
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN public.has_permission(v_source_branch_id, p_permission_key);
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_purchase_order_source(BIGINT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_purchase_order_source(BIGINT, BIGINT, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION private.can_access_grn_source(BIGINT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_grn_source(BIGINT, BIGINT, TEXT)
  TO authenticated;

DROP POLICY IF EXISTS "purchase_orders_manage" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete" ON public.purchase_orders;

CREATE POLICY "purchase_orders_select" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:read')
      OR public.has_permission(branch_id, 'procurement:po_create')
      OR public.has_permission(branch_id, 'procurement:po_approve')
    )
  );

CREATE POLICY "purchase_orders_insert" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'procurement:po_create')
  );

CREATE POLICY "purchase_orders_update" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:po_create')
      OR public.has_permission(branch_id, 'procurement:po_approve')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:po_create')
      OR public.has_permission(branch_id, 'procurement:po_approve')
    )
  );

DROP POLICY IF EXISTS "po_items_manage" ON public.purchase_order_items;
DROP POLICY IF EXISTS "po_items_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_manage" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_insert" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_update" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_delete" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_write" ON public.purchase_order_items;

CREATE POLICY "purchase_order_items_select" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      private.can_access_purchase_order_source(
        tenant_id,
        po_id,
        'procurement:read'
      )
      OR private.can_access_purchase_order_source(
        tenant_id,
        po_id,
        'procurement:po_create'
      )
      OR private.can_access_purchase_order_source(
        tenant_id,
        po_id,
        'procurement:po_approve'
      )
    )
  );

CREATE POLICY "purchase_order_items_insert" ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_purchase_order_source(
      tenant_id,
      po_id,
      'procurement:po_create'
    )
  );

CREATE POLICY "purchase_order_items_update" ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_purchase_order_source(
      tenant_id,
      po_id,
      'procurement:po_create'
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_purchase_order_source(
      tenant_id,
      po_id,
      'procurement:po_create'
    )
  );

CREATE POLICY "purchase_order_items_delete" ON public.purchase_order_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_purchase_order_source(
      tenant_id,
      po_id,
      'procurement:po_create'
    )
  );

DROP POLICY IF EXISTS "goods_received_notes_manage" ON public.goods_received_notes;
DROP POLICY IF EXISTS "goods_received_notes_select" ON public.goods_received_notes;
DROP POLICY IF EXISTS "goods_received_notes_insert" ON public.goods_received_notes;
DROP POLICY IF EXISTS "goods_received_notes_update" ON public.goods_received_notes;
DROP POLICY IF EXISTS "goods_received_notes_delete" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_manage" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_select" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_insert" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_update" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_delete" ON public.goods_received_notes;

CREATE POLICY "grn_select" ON public.goods_received_notes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:read')
      OR public.has_permission(branch_id, 'procurement:grn_create')
      OR public.has_permission(branch_id, 'procurement:grn_confirm')
      OR public.has_permission(branch_id, 'procurement:grn_amend')
    )
  );

CREATE POLICY "grn_insert" ON public.goods_received_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'procurement:grn_create')
  );

CREATE POLICY "grn_update" ON public.goods_received_notes
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:grn_create')
      OR public.has_permission(branch_id, 'procurement:grn_confirm')
      OR public.has_permission(branch_id, 'procurement:grn_amend')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:grn_create')
      OR public.has_permission(branch_id, 'procurement:grn_confirm')
      OR public.has_permission(branch_id, 'procurement:grn_amend')
    )
  );

DROP POLICY IF EXISTS "grn_items_manage" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_select" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_insert" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_update" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_delete" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_write" ON public.grn_items;

CREATE POLICY "grn_items_select" ON public.grn_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      private.can_access_grn_source(
        tenant_id,
        grn_id,
        'procurement:read'
      )
      OR private.can_access_grn_source(
        tenant_id,
        grn_id,
        'procurement:grn_create'
      )
      OR private.can_access_grn_source(
        tenant_id,
        grn_id,
        'procurement:grn_confirm'
      )
      OR private.can_access_grn_source(
        tenant_id,
        grn_id,
        'procurement:grn_amend'
      )
    )
  );

CREATE POLICY "grn_items_insert" ON public.grn_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_grn_source(
      tenant_id,
      grn_id,
      'procurement:grn_create'
    )
  );

CREATE POLICY "grn_items_update" ON public.grn_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_grn_source(
      tenant_id,
      grn_id,
      'procurement:grn_create'
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_grn_source(
      tenant_id,
      grn_id,
      'procurement:grn_create'
    )
  );

CREATE POLICY "grn_items_delete" ON public.grn_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND private.can_access_grn_source(
      tenant_id,
      grn_id,
      'procurement:grn_create'
    )
  );
