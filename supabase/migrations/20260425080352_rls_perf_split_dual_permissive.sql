-- =============================================================
-- Tier 2 — RLS perf: split FOR ALL → INSERT/UPDATE/DELETE
-- Driver: Supabase advisor `multiple_permissive_policies` flagged
-- 6 tables where `*_write` (FOR ALL, USING+CHECK = tenant + has_permission)
-- and `tenant_select` (FOR SELECT, USING = tenant) BOTH fire on every
-- SELECT. Effective SELECT predicate today = (tenant ∧ perm) ∨ tenant
-- ≡ tenant (absorption law). Splitting `*_write` into per-action
-- INSERT/UPDATE/DELETE keeps write predicates IDENTICAL while letting
-- SELECT fire only `tenant_select`. Visibility unchanged; one fewer
-- policy evaluated per row on every read.
--
-- Also fixes `staff_permissions_select_self` init-plan antipattern
-- (raw `auth.uid()` re-eval per row → wrap in `(select ...)`).
--
-- USING == WITH CHECK byte-for-byte for each new UPDATE policy
-- (matches the original FOR ALL behavior).
--
-- Regression rule [2026-04-22] RLS-PERMISSIVE-POLICIES-OR is respected:
-- no permissive predicates collapsed; only redundant SELECT-side of
-- FOR ALL removed. SELECT visibility is mathematically unchanged.
-- =============================================================

-- ─── branches ───────────────────────────────────────────────
DROP POLICY IF EXISTS branches_write ON public.branches;

CREATE POLICY branches_insert ON public.branches
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

CREATE POLICY branches_update ON public.branches
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

CREATE POLICY branches_delete ON public.branches
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

-- ─── tables ─────────────────────────────────────────────────
DROP POLICY IF EXISTS tables_write ON public.tables;

CREATE POLICY tables_insert ON public.tables
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

CREATE POLICY tables_update ON public.tables
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

CREATE POLICY tables_delete ON public.tables
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- ─── pos_terminals ──────────────────────────────────────────
DROP POLICY IF EXISTS pos_terminals_write ON public.pos_terminals;

CREATE POLICY pos_terminals_insert ON public.pos_terminals
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

CREATE POLICY pos_terminals_update ON public.pos_terminals
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

CREATE POLICY pos_terminals_delete ON public.pos_terminals
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- ─── menu_item_variants ─────────────────────────────────────
DROP POLICY IF EXISTS menu_item_variants_write ON public.menu_item_variants;

CREATE POLICY menu_item_variants_insert ON public.menu_item_variants
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY menu_item_variants_update ON public.menu_item_variants
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY menu_item_variants_delete ON public.menu_item_variants
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

-- ─── menu_item_modifiers ────────────────────────────────────
DROP POLICY IF EXISTS menu_item_modifiers_write ON public.menu_item_modifiers;

CREATE POLICY menu_item_modifiers_insert ON public.menu_item_modifiers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY menu_item_modifiers_update ON public.menu_item_modifiers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY menu_item_modifiers_delete ON public.menu_item_modifiers
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

-- ─── menu_item_available_sides ──────────────────────────────
DROP POLICY IF EXISTS menu_item_available_sides_write ON public.menu_item_available_sides;

CREATE POLICY menu_item_available_sides_insert ON public.menu_item_available_sides
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY menu_item_available_sides_update ON public.menu_item_available_sides
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY menu_item_available_sides_delete ON public.menu_item_available_sides
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

-- ─── staff_permissions: init-plan fix ───────────────────────
-- Wrap auth.uid() in (select ...) so it evaluates ONCE per query
-- (InitPlan), not per-row. Pure perf rewrite — same uuid returned.
-- The dual-policy pair (select_self + select_admin) is intentionally
-- preserved: predicates have different shapes (admin needs tenant +
-- has_permission gate, self scopes by user_id) → collapsing would
-- complicate audit without meaningful win, and risks re-introducing
-- the 2026-04-22 RLS-PERMISSIVE-POLICIES-OR leak.
DROP POLICY IF EXISTS staff_permissions_select_self ON public.staff_permissions;

CREATE POLICY staff_permissions_select_self ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
