-- =============================================================
-- Auth v2 — HOTFIX: staff_permissions RLS leak
-- Previous policy `staff_permissions_select_tenant` (M1) allowed any
-- authenticated user in a tenant to SELECT every row in that tenant,
-- because PostgreSQL RLS combines permissive policies with OR.
-- A cashier could therefore see the owner's entire permission grant.
--
-- Correct behavior:
--   (a) Users always see their own grants (self-service at /employee/permissions)
--   (b) Managers with `staff:assign_permission` see tenant rows (admin UI)
-- =============================================================

DROP POLICY IF EXISTS staff_permissions_select_tenant ON public.staff_permissions;

-- Keep staff_permissions_select_self (M1) untouched — covers (a).

-- Managers with staff:assign_permission can view all rows in their tenant.
-- Uses has_permission() with tenant-wide check (pass NULL for branch match).
CREATE POLICY staff_permissions_select_admin ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL::BIGINT, 'staff:assign_permission')
  );
