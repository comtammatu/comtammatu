ALTER POLICY refunds_select ON public.refunds
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(branch_id, 'orders:refund_approve')
);

ALTER POLICY refunds_insert ON public.refunds
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(branch_id, 'orders:refund')
);

ALTER POLICY refunds_update ON public.refunds
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(branch_id, 'orders:refund_approve')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(branch_id, 'orders:refund_approve')
);
