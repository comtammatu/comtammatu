-- =============================================================
-- Fix procurement line item RLS drift.
--
-- 20260417050001 widened procurement header policies for the
-- multi-warehouse roles, but purchase_order_items and grn_items
-- were still left at super_manager-only from 20260412000000.
-- =============================================================

DROP POLICY IF EXISTS "po_items_manage" ON public.purchase_order_items;
CREATE POLICY "po_items_manage" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager')
      OR (
        public.auth_role() IN ('warehouse_manager', 'production_manager')
        AND EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          WHERE po.id = purchase_order_items.po_id
            AND po.tenant_id = purchase_order_items.tenant_id
            AND po.branch_id = public.auth_branch_id()
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager')
      OR (
        public.auth_role() IN ('warehouse_manager', 'production_manager')
        AND EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          WHERE po.id = purchase_order_items.po_id
            AND po.tenant_id = purchase_order_items.tenant_id
            AND po.branch_id = public.auth_branch_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS "grn_items_manage" ON public.grn_items;
CREATE POLICY "grn_items_manage" ON public.grn_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager')
      OR (
        public.auth_role() IN ('warehouse_manager', 'production_manager')
        AND EXISTS (
          SELECT 1
          FROM public.goods_received_notes grn
          WHERE grn.id = grn_items.grn_id
            AND grn.tenant_id = grn_items.tenant_id
            AND grn.branch_id = public.auth_branch_id()
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager')
      OR (
        public.auth_role() IN ('warehouse_manager', 'production_manager')
        AND EXISTS (
          SELECT 1
          FROM public.goods_received_notes grn
          WHERE grn.id = grn_items.grn_id
            AND grn.tenant_id = grn_items.tenant_id
            AND grn.branch_id = public.auth_branch_id()
        )
      )
    )
  );
