-- =============================================================
-- Rollback: restore FOR ALL `*_write` policies on 6 tables and
-- raw `auth.uid()` predicate on `staff_permissions_select_self`.
-- Predicates copied verbatim from pg_policy snapshot taken before
-- forward migration (see Tier 2 debate ground-truth).
-- =============================================================

-- ─── branches ───
DROP POLICY IF EXISTS branches_insert ON public.branches;
DROP POLICY IF EXISTS branches_update ON public.branches;
DROP POLICY IF EXISTS branches_delete ON public.branches;

CREATE POLICY branches_write ON public.branches
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('settings:tenant')
  );

-- ─── tables ───
DROP POLICY IF EXISTS tables_insert ON public.tables;
DROP POLICY IF EXISTS tables_update ON public.tables;
DROP POLICY IF EXISTS tables_delete ON public.tables;

CREATE POLICY tables_write ON public.tables
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- ─── pos_terminals ───
DROP POLICY IF EXISTS pos_terminals_insert ON public.pos_terminals;
DROP POLICY IF EXISTS pos_terminals_update ON public.pos_terminals;
DROP POLICY IF EXISTS pos_terminals_delete ON public.pos_terminals;

CREATE POLICY pos_terminals_write ON public.pos_terminals
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- ─── menu_item_variants ───
DROP POLICY IF EXISTS menu_item_variants_insert ON public.menu_item_variants;
DROP POLICY IF EXISTS menu_item_variants_update ON public.menu_item_variants;
DROP POLICY IF EXISTS menu_item_variants_delete ON public.menu_item_variants;

CREATE POLICY menu_item_variants_write ON public.menu_item_variants
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('menu:write')
  );

-- ─── menu_item_modifiers ───
DROP POLICY IF EXISTS menu_item_modifiers_insert ON public.menu_item_modifiers;
DROP POLICY IF EXISTS menu_item_modifiers_update ON public.menu_item_modifiers;
DROP POLICY IF EXISTS menu_item_modifiers_delete ON public.menu_item_modifiers;

CREATE POLICY menu_item_modifiers_write ON public.menu_item_modifiers
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('menu:write')
  );

-- ─── menu_item_available_sides ───
DROP POLICY IF EXISTS menu_item_available_sides_insert ON public.menu_item_available_sides;
DROP POLICY IF EXISTS menu_item_available_sides_update ON public.menu_item_available_sides;
DROP POLICY IF EXISTS menu_item_available_sides_delete ON public.menu_item_available_sides;

CREATE POLICY menu_item_available_sides_write ON public.menu_item_available_sides
  FOR ALL TO authenticated
  USING (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    (tenant_id = public.auth_tenant_id())
    AND public.has_permission_any('menu:write')
  );

-- ─── staff_permissions: revert init-plan rewrite ───
DROP POLICY IF EXISTS staff_permissions_select_self ON public.staff_permissions;

CREATE POLICY staff_permissions_select_self ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
