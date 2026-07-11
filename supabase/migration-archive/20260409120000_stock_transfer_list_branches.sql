-- Full tenant branch list for luân chuyển UI (branch_manager RLS only allows own branch on branches table).
CREATE OR REPLACE FUNCTION public.stock_transfer_list_branches()
RETURNS TABLE (
  id bigint,
  name text,
  is_tenant boolean,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.is_tenant, b.is_active
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
