-- Extend transfer branch picker metadata so the UI can distinguish
-- tenant, branch, and branch warehouses.

DROP FUNCTION IF EXISTS public.stock_transfer_list_branches();

CREATE FUNCTION public.stock_transfer_list_branches()
RETURNS TABLE (
  id bigint,
  name text,
  is_tenant boolean,
  branch_kind text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.is_tenant, b.branch_kind, b.is_active
  FROM public.branches b
  WHERE b.tenant_id = public.auth_tenant_id()
    AND b.is_active = true
    AND public.auth_role() IN (
      'owner',
      'super_manager',
      'area_manager',
      'branch_manager'
    )
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION public.stock_transfer_list_branches() TO authenticated;
