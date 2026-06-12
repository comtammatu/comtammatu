-- Fix: branches_select RLS restricted branch_manager / warehouse_manager /
-- production_manager to their own branch row, breaking cross-branch flows:
--   1. createStockTransfer → loadBranchKind(other_branch) returned null →
--      "Chi nhánh không hợp lệ" when creating inbound (from tenant/warehouse)
--      or outbound (to tenant/other branch) tickets.
--   2. fetchStockTransfers / fetchStockTransferDetail enrichment showed
--      "—" or "Chi nhánh #<id>" for the counterpart branch because the
--      branches table returned only the user's own branch row.
--   3. fetchInventorySiteContext / fetchProcurementBranches returned empty
--      for managers whose scope differs from the warehouse/branch.
--
-- The stock_transfer_list_branches RPC already gives these manager roles
-- tenant-wide branch visibility via SECURITY DEFINER — the table RLS must
-- match that design intent. Cashier/waiter/chef remain scoped to own branch.

DROP POLICY IF EXISTS "branches_select" ON public.branches;

CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN (
        'owner',
        'super_manager',
        'office',
        'area_manager',
        'branch_manager',
        'warehouse_manager',
        'production_manager'
      )
      OR (
        public.auth_role() IN ('cashier', 'waiter', 'chef')
        AND id = COALESCE(
          public.auth_branch_id(),
          (SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
    )
  );
