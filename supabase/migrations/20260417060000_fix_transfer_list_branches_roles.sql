-- Fix: stock_transfer_list_branches was missing warehouse_manager and production_manager.
-- These roles are in INVENTORY_OPS_ROLES and could manage stock_transfers via RLS,
-- but the branch picker RPC returned empty → "Tạo phiếu" button was hidden for Kho Tổng users.

DROP FUNCTION IF EXISTS public.stock_transfer_list_branches();

CREATE FUNCTION public.stock_transfer_list_branches()
RETURNS TABLE (
  id            bigint,
  name          text,
  is_headquarters boolean,
  branch_kind   text,
  is_active     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.is_headquarters, b.branch_kind, b.is_active
  FROM public.branches b
  WHERE b.tenant_id = public.auth_tenant_id()
    AND b.is_active = true
    AND public.auth_role() IN (
      'owner',
      'super_manager',
      'area_manager',
      'branch_manager',
      'warehouse_manager',
      'production_manager'
    )
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION public.stock_transfer_list_branches() TO authenticated;
