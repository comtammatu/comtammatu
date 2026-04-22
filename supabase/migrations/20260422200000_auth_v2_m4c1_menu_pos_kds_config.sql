-- =============================================================
-- Auth v2 — M4c.1: Menu + POS/KDS/Tables settings RLS cutover
-- 10 tables: menu_items, menu_categories, menu_item_available_sides,
--            menu_item_modifiers, menu_item_variants,
--            pos_terminals, tables, printer_configs,
--            kds_stations, kds_station_categories
-- Pattern: SELECT = tenant_id match (catalog read); WRITE = permission check
-- =============================================================

-- ═════════════════════════════════════════════════════
-- MENU DOMAIN
-- ═════════════════════════════════════════════════════

-- menu_items: tenant catalog. SELECT open to tenant; WRITE = menu:write
-- Existing SELECT policy `tenant_select` from 20260402000003 kept unchanged.
DROP POLICY IF EXISTS "manager_insert" ON public.menu_items;
DROP POLICY IF EXISTS "manager_update" ON public.menu_items;
DROP POLICY IF EXISTS "manager_delete" ON public.menu_items;

CREATE POLICY "menu_items_insert" ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY "menu_items_update" ON public.menu_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

CREATE POLICY "menu_items_delete" ON public.menu_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

-- menu_categories: manage via menu:manage_category
DROP POLICY IF EXISTS "manager_insert" ON public.menu_categories;
DROP POLICY IF EXISTS "manager_update" ON public.menu_categories;
DROP POLICY IF EXISTS "manager_delete" ON public.menu_categories;

CREATE POLICY "menu_categories_insert" ON public.menu_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:manage_category')
  );

CREATE POLICY "menu_categories_update" ON public.menu_categories
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:manage_category')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:manage_category')
  );

CREATE POLICY "menu_categories_delete" ON public.menu_categories
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:manage_category')
  );

-- menu_item_variants / modifiers / available_sides: inherit menu:write
DROP POLICY IF EXISTS "manager_insert" ON public.menu_item_variants;
DROP POLICY IF EXISTS "manager_update" ON public.menu_item_variants;
DROP POLICY IF EXISTS "manager_delete" ON public.menu_item_variants;

CREATE POLICY "menu_item_variants_write" ON public.menu_item_variants
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

DROP POLICY IF EXISTS "manager_insert" ON public.menu_item_modifiers;
DROP POLICY IF EXISTS "manager_update" ON public.menu_item_modifiers;
DROP POLICY IF EXISTS "manager_delete" ON public.menu_item_modifiers;

CREATE POLICY "menu_item_modifiers_write" ON public.menu_item_modifiers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

DROP POLICY IF EXISTS "manager_insert" ON public.menu_item_available_sides;
DROP POLICY IF EXISTS "manager_delete" ON public.menu_item_available_sides;

CREATE POLICY "menu_item_available_sides_write" ON public.menu_item_available_sides
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

-- ═════════════════════════════════════════════════════
-- POS SETTINGS (branch-scoped)
-- ═════════════════════════════════════════════════════

-- pos_terminals: per-branch config; read by any POS user, manage by settings:branch
DROP POLICY IF EXISTS "manager_insert" ON public.pos_terminals;
DROP POLICY IF EXISTS "manager_update" ON public.pos_terminals;
DROP POLICY IF EXISTS "manager_delete" ON public.pos_terminals;

CREATE POLICY "pos_terminals_write" ON public.pos_terminals
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- tables (restaurant tables): per-branch, settings:branch for manage
DROP POLICY IF EXISTS "manager_insert" ON public.tables;
DROP POLICY IF EXISTS "manager_update" ON public.tables;
DROP POLICY IF EXISTS "manager_delete" ON public.tables;

CREATE POLICY "tables_write" ON public.tables
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- printer_configs: per-branch
DROP POLICY IF EXISTS "manager_insert" ON public.printer_configs;
DROP POLICY IF EXISTS "manager_update" ON public.printer_configs;
DROP POLICY IF EXISTS "manager_delete" ON public.printer_configs;

CREATE POLICY "printer_configs_write" ON public.printer_configs
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- ═════════════════════════════════════════════════════
-- KDS SETTINGS (branch-scoped)
-- ═════════════════════════════════════════════════════

-- kds_stations: per-branch station config
DROP POLICY IF EXISTS "management_insert" ON public.kds_stations;
DROP POLICY IF EXISTS "management_update" ON public.kds_stations;
DROP POLICY IF EXISTS "management_delete" ON public.kds_stations;

CREATE POLICY "kds_stations_write" ON public.kds_stations
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'settings:branch')
  );

-- kds_station_categories: mapping, tenant-scoped; use menu:manage_category for consistency
-- (category assignment = menu admin task)
DROP POLICY IF EXISTS "management_insert" ON public.kds_station_categories;
DROP POLICY IF EXISTS "management_update" ON public.kds_station_categories;
DROP POLICY IF EXISTS "management_delete" ON public.kds_station_categories;

CREATE POLICY "kds_station_categories_write" ON public.kds_station_categories
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:manage_category')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:manage_category')
  );
