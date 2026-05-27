-- GREENFIELD_ONLY: rehearsal SQL for staging jmasiwuqiyedqvyfzhuq; not part of supabase/migrations.
-- ============================================================================
-- Supplier return source-scoped RLS
--
-- Supplier return headers carry branch scope directly. Return line items and
-- credit notes inherit branch scope from their supplier return header.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.can_access_supplier_return_source(
  p_tenant_id BIGINT,
  p_return_id BIGINT,
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
     OR p_return_id IS NULL
     OR p_permission_key IS NULL
     OR btrim(p_permission_key) = '' THEN
    RETURN false;
  END IF;

  SELECT sr.branch_id
    INTO v_source_branch_id
  FROM public.supplier_returns AS sr
  WHERE sr.id = p_return_id
    AND sr.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN public.has_permission(v_source_branch_id, p_permission_key);
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_supplier_return_source(BIGINT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_supplier_return_source(BIGINT, BIGINT, TEXT)
  TO authenticated;

DROP POLICY IF EXISTS "supplier_returns_select" ON public.supplier_returns;

CREATE POLICY "supplier_returns_select" ON public.supplier_returns
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'supplier_return:read')
      OR public.has_permission(branch_id, 'supplier_return:create')
      OR public.has_permission(branch_id, 'supplier_return:confirm')
    )
  );

DROP POLICY IF EXISTS "supplier_return_items_select" ON public.supplier_return_items;

CREATE POLICY "supplier_return_items_select" ON public.supplier_return_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      private.can_access_supplier_return_source(
        tenant_id,
        return_id,
        'supplier_return:read'
      )
      OR private.can_access_supplier_return_source(
        tenant_id,
        return_id,
        'supplier_return:create'
      )
      OR private.can_access_supplier_return_source(
        tenant_id,
        return_id,
        'supplier_return:confirm'
      )
    )
  );

DROP POLICY IF EXISTS "supplier_credit_notes_select" ON public.supplier_credit_notes;

CREATE POLICY "supplier_credit_notes_select" ON public.supplier_credit_notes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      private.can_access_supplier_return_source(
        tenant_id,
        return_id,
        'supplier_return:read'
      )
      OR private.can_access_supplier_return_source(
        tenant_id,
        return_id,
        'supplier_return:confirm'
      )
    )
  );
