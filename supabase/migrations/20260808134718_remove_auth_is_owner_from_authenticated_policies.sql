-- Authenticated RLS must not call public.auth_is_owner / public.has_position:
-- EXECUTE on those helpers is revoked from authenticated (service_role only).
-- Direct policy calls raise 42501 and surface as PostgREST 403.

ALTER POLICY pos_void_requests_select
ON public.pos_void_requests
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    public.has_permission(branch_id, 'pos:use')
    OR public.has_permission(branch_id, 'settings:branch')
  )
);

ALTER POLICY branch_revenue_targets_delete
ON public.branch_revenue_targets
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() IN ('owner', 'accountant')
  AND public.has_permission_any('finance:view')
);

ALTER POLICY branch_revenue_targets_insert
ON public.branch_revenue_targets
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() IN ('owner', 'accountant')
  AND public.has_permission_any('finance:view')
);

ALTER POLICY branch_revenue_targets_update
ON public.branch_revenue_targets
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() IN ('owner', 'accountant')
  AND public.has_permission_any('finance:view')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() IN ('owner', 'accountant')
  AND public.has_permission_any('finance:view')
);
