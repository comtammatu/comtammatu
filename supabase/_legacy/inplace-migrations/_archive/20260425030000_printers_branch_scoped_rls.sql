-- Harden printers RLS: restrict INSERT/UPDATE/DELETE to the row's own branch
-- for branch-scoped roles. Cross-branch roles (owner, super_manager,
-- area_manager) remain unconstrained within the tenant.
--
-- Rationale: prior policies only checked tenant_id + printer:manage permission.
-- A branch_manager of branch A could write to branch B's printer rows by
-- posting a different branch_id — an auth bypass within the tenant.
-- Defense-in-depth backstop for the server-action guards in
-- apps/web/app/admin/settings/printers/actions.ts.

DROP POLICY IF EXISTS "printers_insert" ON public.printers;
DROP POLICY IF EXISTS "printers_update" ON public.printers;
DROP POLICY IF EXISTS "printers_delete" ON public.printers;

CREATE POLICY "printers_insert" ON public.printers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR branch_id = public.auth_branch_id()
    )
  );

CREATE POLICY "printers_update" ON public.printers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR branch_id = public.auth_branch_id()
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR branch_id = public.auth_branch_id()
    )
  );

CREATE POLICY "printers_delete" ON public.printers
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR branch_id = public.auth_branch_id()
    )
  );
