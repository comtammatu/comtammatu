-- =============================================================
-- Auth v2 — M4c.2: Inventory remainder + Production + Procurement
-- 8 tables: inventory_locations, recipes,
--           production_orders, production_order_items, production_recipes,
--           purchase_order_items, supplier_invoices, supplier_payments
-- Structural gates preserved: branch_kind='branch' on production_*
-- =============================================================

-- ═════════════════════════════════════════════════════
-- inventory_locations (branch-scoped)
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "inventory_locations_select" ON public.inventory_locations;
DROP POLICY IF EXISTS "inventory_locations_manage" ON public.inventory_locations;

CREATE POLICY "inventory_locations_select" ON public.inventory_locations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:read')
  );

CREATE POLICY "inventory_locations_write" ON public.inventory_locations
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  );

-- ═════════════════════════════════════════════════════
-- recipes (tenant catalog)
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "recipes_manage" ON public.recipes;

CREATE POLICY "recipes_write" ON public.recipes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

-- ═════════════════════════════════════════════════════
-- production_* — keep branch_kind='branch' structural gate
-- ═════════════════════════════════════════════════════

-- production_orders: scoped to branch branch
DROP POLICY IF EXISTS "production_orders_manage" ON public.production_orders;

CREATE POLICY "production_orders_write" ON public.production_orders
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'inventory:production_create')
      OR public.has_permission(branch_id, 'inventory:production_confirm')
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = production_orders.branch_id
        AND b.tenant_id = production_orders.tenant_id
        AND b.branch_kind = 'branch'
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'inventory:production_create')
      OR public.has_permission(branch_id, 'inventory:production_confirm')
    )
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = production_orders.branch_id
        AND b.tenant_id = production_orders.tenant_id
        AND b.branch_kind = 'branch'
    )
  );

-- production_order_items — inherit parent
DROP POLICY IF EXISTS "production_order_items_manage" ON public.production_order_items;

CREATE POLICY "production_order_items_write" ON public.production_order_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_order_items.production_order_id
        AND po.tenant_id = production_order_items.tenant_id
        AND (
          public.has_permission(po.branch_id, 'inventory:production_create')
          OR public.has_permission(po.branch_id, 'inventory:production_confirm')
        )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = production_order_items.production_order_id
        AND po.tenant_id = production_order_items.tenant_id
        AND (
          public.has_permission(po.branch_id, 'inventory:production_create')
          OR public.has_permission(po.branch_id, 'inventory:production_confirm')
        )
    )
  );

-- production_recipes: tenant-scoped catalog for branch
DROP POLICY IF EXISTS "production_recipes_manage" ON public.production_recipes;

CREATE POLICY "production_recipes_write" ON public.production_recipes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('menu:write')
  );

-- ═════════════════════════════════════════════════════
-- purchase_order_items — inherit parent
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "po_items_manage" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_write" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_select" ON public.purchase_order_items;

CREATE POLICY "purchase_order_items_write" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:po_create')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:po_create')
  );

-- ═════════════════════════════════════════════════════
-- supplier_invoices
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "supplier_invoices_manage" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_select" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_write" ON public.supplier_invoices;

CREATE POLICY "supplier_invoices_select" ON public.supplier_invoices
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:read')
  );

CREATE POLICY "supplier_invoices_write" ON public.supplier_invoices
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:invoice_create')
      OR public.has_permission_any('procurement:invoice_match')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:invoice_create')
      OR public.has_permission_any('procurement:invoice_match')
    )
  );

-- ═════════════════════════════════════════════════════
-- supplier_payments — finance-sensitive
-- ═════════════════════════════════════════════════════
DROP POLICY IF EXISTS "sp_manage" ON public.supplier_payments;
DROP POLICY IF EXISTS "sp_select" ON public.supplier_payments;

CREATE POLICY "supplier_payments_select" ON public.supplier_payments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY "supplier_payments_write" ON public.supplier_payments
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:ap_pay')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:ap_pay')
  );
