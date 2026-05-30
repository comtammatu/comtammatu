-- =============================================================
-- Auth v2 — M4 (representative): RLS cutover for 2 tables
--   • ingredients   — tenant-scoped catalog, uses has_permission_any()
--   • kds_tickets   — branch-scoped, uses has_permission(branch_id, key)
--
-- Purpose: prove both authz patterns end-to-end before cutting the rest.
-- Owner bypass is handled inside has_permission() itself.
-- Area-manager scoping is preserved because M2 backfill inserted per-branch
-- rows for each branch in the area via `area_branches`.
-- =============================================================

-- ────────────────────────────────────────────────────────────
-- Helper: has_permission_any(key)
-- Returns TRUE if user has the permission for ANY branch or tenant-wide.
-- Used by tenant-scoped tables (no branch_id column) like `ingredients`.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission_any(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    -- Owner bypass
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      LEFT JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid()
        AND (pr.role::text = 'owner' OR po.code = 'owner')
    )
    OR
    -- Any grant (tenant-wide or any branch)
    EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
    );
$$;

COMMENT ON FUNCTION public.has_permission_any(TEXT) IS
  'Returns TRUE if user has the permission for at least one branch or tenant-wide. Use for tenant-scoped tables without branch_id.';

GRANT EXECUTE ON FUNCTION public.has_permission_any(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- ingredients — tenant-scoped catalog
-- Previously: auth_role() IN ('owner','super_manager','warehouse_manager','production_manager')
-- Now: inventory:read (SELECT) / inventory:write (INSERT/UPDATE/DELETE)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ingredients_select" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_insert" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_update" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_delete" ON public.ingredients;

CREATE POLICY "ingredients_select" ON public.ingredients
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('inventory:read')
  );

CREATE POLICY "ingredients_insert" ON public.ingredients
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('inventory:write')
  );

CREATE POLICY "ingredients_update" ON public.ingredients
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('inventory:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('inventory:write')
  );

CREATE POLICY "ingredients_delete" ON public.ingredients
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('inventory:write')
  );

-- ────────────────────────────────────────────────────────────
-- kds_tickets — branch-scoped
-- Previously: auth_role() IN (...) + can_access_branch(branch_id)
-- Now: has_permission(branch_id, key)
--   SELECT  → kds:use OR orders:read (chef views KDS; cashier/waiter check status)
--   INSERT  → pos:use  (tickets auto-created when POS submits order)
--   UPDATE  → kds:mark_ready (chef bumps status)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_select" ON public.kds_tickets;
DROP POLICY IF EXISTS "rpc_insert"    ON public.kds_tickets;
DROP POLICY IF EXISTS "kds_update"    ON public.kds_tickets;

CREATE POLICY "kds_tickets_select" ON public.kds_tickets
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'kds:use')
      OR public.has_permission(branch_id, 'orders:read')
    )
  );

CREATE POLICY "kds_tickets_insert" ON public.kds_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:use')
  );

CREATE POLICY "kds_tickets_update" ON public.kds_tickets
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'kds:mark_ready')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'kds:mark_ready')
  );
