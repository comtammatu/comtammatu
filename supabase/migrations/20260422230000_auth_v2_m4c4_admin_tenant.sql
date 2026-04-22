-- =============================================================
-- Auth v2 — M4c.4: Admin/tenant config + leftovers
-- 9 tables: areas, area_branches, branches, profiles, system_settings,
--           audit_logs, branch_zones, order_daily_counters, tax_invoices
-- =============================================================

-- ═════════════════════════════════════════════════════
-- areas / area_branches (tenant-scoped admin config)
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "areas_manage" ON public.areas;

CREATE POLICY "areas_write" ON public.areas
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

DROP POLICY IF EXISTS "area_branches_manage" ON public.area_branches;

CREATE POLICY "area_branches_write" ON public.area_branches
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

-- ═════════════════════════════════════════════════════
-- branches — SELECT open to tenant (branch selector UI); manage = settings:tenant
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Managers can manage branches" ON public.branches;

CREATE POLICY "branches_write" ON public.branches
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

-- ═════════════════════════════════════════════════════
-- profiles — self-view + admin view via staff:view
-- Keep existing self-update policies; replace admin SELECT.
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select_self" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('staff:view')
      OR public.has_permission_any('hr:view_employee')
    )
  );

-- ═════════════════════════════════════════════════════
-- system_settings — tenant-wide config
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "manager_insert" ON public.system_settings;
DROP POLICY IF EXISTS "manager_update" ON public.system_settings;
DROP POLICY IF EXISTS "manager_delete" ON public.system_settings;
DROP POLICY IF EXISTS "manager_write"  ON public.system_settings;

CREATE POLICY "system_settings_write" ON public.system_settings
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('settings:tenant')
  );

-- ═════════════════════════════════════════════════════
-- audit_logs — admin view only
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;

CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('settings:tenant')
      OR public.has_permission_any('staff:assign_permission')
    )
  );

-- ═════════════════════════════════════════════════════
-- branch_zones — per-branch config
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "manager_insert" ON public.branch_zones;
DROP POLICY IF EXISTS "manager_update" ON public.branch_zones;
DROP POLICY IF EXISTS "manager_delete" ON public.branch_zones;

CREATE POLICY "branch_zones_write" ON public.branch_zones
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
-- order_daily_counters — internal sequence, updated when orders created
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "branch_all" ON public.order_daily_counters;

CREATE POLICY "order_daily_counters_write" ON public.order_daily_counters
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  );

-- ═════════════════════════════════════════════════════
-- tax_invoices — branch-scoped e-invoices
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "tax_invoices_select" ON public.tax_invoices;
DROP POLICY IF EXISTS "tax_invoices_insert" ON public.tax_invoices;
DROP POLICY IF EXISTS "tax_invoices_update" ON public.tax_invoices;

CREATE POLICY "tax_invoices_select" ON public.tax_invoices
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:read')
  );

CREATE POLICY "tax_invoices_insert" ON public.tax_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  );

CREATE POLICY "tax_invoices_update" ON public.tax_invoices
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  );
