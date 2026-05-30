-- =============================================================
-- Auth v2 — M4b.2: Wholesale RLS cutover for M4 in-scope tables.
-- Replaces auth_role() checks with has_permission() / has_permission_any().
-- Structural gates (branch_kind = warehouse/central_kitchen, HQ-only triggers)
-- are preserved as separate predicates; only the role-based check is replaced.
-- =============================================================

-- ═════════════════════════════════════════════════════
-- ORDERS / POS DOMAIN
-- ═════════════════════════════════════════════════════

-- ─── orders ───
DROP POLICY IF EXISTS "orders_select"  ON public.orders;
DROP POLICY IF EXISTS "branch_insert"  ON public.orders;
DROP POLICY IF EXISTS "branch_update"  ON public.orders;
DROP POLICY IF EXISTS "tenant_select"  ON public.orders;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:read')
  );

CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  );

CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  );

-- ─── order_items — inherit from parent orders ───
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
DROP POLICY IF EXISTS "tenant_select"      ON public.order_items;
DROP POLICY IF EXISTS "branch_insert"      ON public.order_items;
DROP POLICY IF EXISTS "branch_update"      ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
        AND public.has_permission(o.branch_id, 'orders:read')
    )
  );

CREATE POLICY "order_items_insert" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
        AND public.has_permission(o.branch_id, 'orders:write')
    )
  );

CREATE POLICY "order_items_update" ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
        AND public.has_permission(o.branch_id, 'orders:write')
    )
  );

-- ─── order_status_history ───
DROP POLICY IF EXISTS "order_status_history_select" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_insert" ON public.order_status_history;
DROP POLICY IF EXISTS "tenant_select"               ON public.order_status_history;
DROP POLICY IF EXISTS "branch_insert"               ON public.order_status_history;

CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.tenant_id = order_status_history.tenant_id
        AND public.has_permission(o.branch_id, 'orders:read')
    )
  );

CREATE POLICY "order_status_history_insert" ON public.order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.tenant_id = order_status_history.tenant_id
        AND public.has_permission(o.branch_id, 'orders:write')
    )
  );

-- ─── payments ───
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_update" ON public.payments;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:read')
  );

CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  );

CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:write')
  );

-- ─── pos_sessions ───
DROP POLICY IF EXISTS "pos_sessions_select" ON public.pos_sessions;
DROP POLICY IF EXISTS "pos_sessions_insert" ON public.pos_sessions;
DROP POLICY IF EXISTS "pos_sessions_update" ON public.pos_sessions;
DROP POLICY IF EXISTS "tenant_select"       ON public.pos_sessions;
DROP POLICY IF EXISTS "branch_insert"       ON public.pos_sessions;
DROP POLICY IF EXISTS "branch_update"       ON public.pos_sessions;

CREATE POLICY "pos_sessions_select" ON public.pos_sessions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:use')
  );

CREATE POLICY "pos_sessions_insert" ON public.pos_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:open_cashbox')
  );

CREATE POLICY "pos_sessions_update" ON public.pos_sessions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:use')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:use')
  );

-- ═════════════════════════════════════════════════════
-- INVENTORY DOMAIN
-- ═════════════════════════════════════════════════════

-- ─── stock_levels (branch-scoped) ───
DROP POLICY IF EXISTS "stock_levels_select" ON public.stock_levels;
DROP POLICY IF EXISTS "stock_levels_insert" ON public.stock_levels;
DROP POLICY IF EXISTS "stock_levels_update" ON public.stock_levels;
DROP POLICY IF EXISTS "stock_levels_manage" ON public.stock_levels;

CREATE POLICY "stock_levels_select" ON public.stock_levels
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:read')
  );

CREATE POLICY "stock_levels_insert" ON public.stock_levels
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  );

CREATE POLICY "stock_levels_update" ON public.stock_levels
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  );

-- ─── stock_movements (branch-scoped) ───
DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_insert" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_manage" ON public.stock_movements;

CREATE POLICY "stock_movements_select" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:read')
  );

CREATE POLICY "stock_movements_insert" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  );

-- ─── stock_transfers ───
-- Branch scoping: sender branch vs receiver branch.
-- Simplification for phase 1: require inventory:transfer_create (any of from/to branch) for INSERT,
-- inventory:write for UPDATE (ship/receive transitions guarded by application-level checks).
DROP POLICY IF EXISTS "stock_transfers_select" ON public.stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_insert" ON public.stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_update" ON public.stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_manage" ON public.stock_transfers;

CREATE POLICY "stock_transfers_select" ON public.stock_transfers
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(from_branch_id, 'inventory:read')
      OR public.has_permission(to_branch_id,   'inventory:read')
    )
  );

CREATE POLICY "stock_transfers_insert" ON public.stock_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(from_branch_id, 'inventory:transfer_create')
      OR public.has_permission(to_branch_id,   'inventory:transfer_create')
    )
  );

CREATE POLICY "stock_transfers_update" ON public.stock_transfers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(from_branch_id, 'inventory:write')
      OR public.has_permission(to_branch_id,   'inventory:write')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(from_branch_id, 'inventory:write')
      OR public.has_permission(to_branch_id,   'inventory:write')
    )
  );

-- ─── stock_transfer_items — inherit from parent ───
DROP POLICY IF EXISTS "stock_transfer_items_select" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_insert" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_update" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_manage" ON public.stock_transfer_items;

CREATE POLICY "stock_transfer_items_select" ON public.stock_transfer_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stock_transfers t
      WHERE t.id = stock_transfer_items.transfer_id
        AND t.tenant_id = stock_transfer_items.tenant_id
        AND (
          public.has_permission(t.from_branch_id, 'inventory:read')
          OR public.has_permission(t.to_branch_id,   'inventory:read')
        )
    )
  );

CREATE POLICY "stock_transfer_items_write" ON public.stock_transfer_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stock_transfers t
      WHERE t.id = stock_transfer_items.transfer_id
        AND t.tenant_id = stock_transfer_items.tenant_id
        AND (
          public.has_permission(t.from_branch_id, 'inventory:write')
          OR public.has_permission(t.to_branch_id,   'inventory:write')
        )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stock_transfers t
      WHERE t.id = stock_transfer_items.transfer_id
        AND t.tenant_id = stock_transfer_items.tenant_id
        AND (
          public.has_permission(t.from_branch_id, 'inventory:write')
          OR public.has_permission(t.to_branch_id,   'inventory:write')
        )
    )
  );

-- ─── stock_issues ───
DROP POLICY IF EXISTS "stock_issues_select" ON public.stock_issues;
DROP POLICY IF EXISTS "stock_issues_insert" ON public.stock_issues;
DROP POLICY IF EXISTS "stock_issues_update" ON public.stock_issues;
DROP POLICY IF EXISTS "stock_issues_manage" ON public.stock_issues;

CREATE POLICY "stock_issues_select" ON public.stock_issues
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:read')
  );

CREATE POLICY "stock_issues_insert" ON public.stock_issues
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  );

CREATE POLICY "stock_issues_update" ON public.stock_issues
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  );

-- ─── stock_issue_items — inherit from parent (keep status='draft' gate) ───
DROP POLICY IF EXISTS "stock_issue_items_select" ON public.stock_issue_items;
DROP POLICY IF EXISTS "stock_issue_items_insert" ON public.stock_issue_items;
DROP POLICY IF EXISTS "stock_issue_items_update" ON public.stock_issue_items;
DROP POLICY IF EXISTS "stock_issue_items_delete" ON public.stock_issue_items;
DROP POLICY IF EXISTS "stock_issue_items_manage" ON public.stock_issue_items;

CREATE POLICY "stock_issue_items_select" ON public.stock_issue_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stock_issues i
      WHERE i.id = stock_issue_items.issue_id
        AND i.tenant_id = stock_issue_items.tenant_id
        AND public.has_permission(i.branch_id, 'inventory:read')
    )
  );

CREATE POLICY "stock_issue_items_write" ON public.stock_issue_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stock_issues i
      WHERE i.id = stock_issue_items.issue_id
        AND i.tenant_id = stock_issue_items.tenant_id
        AND i.status = 'draft'
        AND public.has_permission(i.branch_id, 'inventory:write')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stock_issues i
      WHERE i.id = stock_issue_items.issue_id
        AND i.tenant_id = stock_issue_items.tenant_id
        AND i.status = 'draft'
        AND public.has_permission(i.branch_id, 'inventory:write')
    )
  );

-- ─── stocktake_sessions ───
DROP POLICY IF EXISTS "stocktake_sessions_select" ON public.stocktake_sessions;
DROP POLICY IF EXISTS "stocktake_sessions_insert" ON public.stocktake_sessions;
DROP POLICY IF EXISTS "stocktake_sessions_update" ON public.stocktake_sessions;
DROP POLICY IF EXISTS "stocktake_sessions_manage" ON public.stocktake_sessions;

CREATE POLICY "stocktake_sessions_select" ON public.stocktake_sessions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:read')
  );

CREATE POLICY "stocktake_sessions_insert" ON public.stocktake_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:stocktake_create')
  );

CREATE POLICY "stocktake_sessions_update" ON public.stocktake_sessions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:write')
  );

-- ─── stocktake_lines ───
DROP POLICY IF EXISTS "stocktake_lines_select" ON public.stocktake_lines;
DROP POLICY IF EXISTS "stocktake_lines_insert" ON public.stocktake_lines;
DROP POLICY IF EXISTS "stocktake_lines_update" ON public.stocktake_lines;
DROP POLICY IF EXISTS "stocktake_lines_manage" ON public.stocktake_lines;

CREATE POLICY "stocktake_lines_select" ON public.stocktake_lines
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stocktake_sessions s
      WHERE s.id = stocktake_lines.session_id
        AND s.tenant_id = stocktake_lines.tenant_id
        AND public.has_permission(s.branch_id, 'inventory:read')
    )
  );

CREATE POLICY "stocktake_lines_write" ON public.stocktake_lines
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stocktake_sessions s
      WHERE s.id = stocktake_lines.session_id
        AND s.tenant_id = stocktake_lines.tenant_id
        AND public.has_permission(s.branch_id, 'inventory:write')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.stocktake_sessions s
      WHERE s.id = stocktake_lines.session_id
        AND s.tenant_id = stocktake_lines.tenant_id
        AND public.has_permission(s.branch_id, 'inventory:write')
    )
  );

-- ─── suppliers (tenant-scoped) ───
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_manage" ON public.suppliers;

CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:read')
  );

CREATE POLICY "suppliers_write" ON public.suppliers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:supplier_manage')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:supplier_manage')
  );

-- ─── purchase_orders (HQ-only enforced by trigger; RLS checks permission) ───
DROP POLICY IF EXISTS "purchase_orders_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_manage" ON public.purchase_orders;

CREATE POLICY "purchase_orders_select" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:read')
  );

CREATE POLICY "purchase_orders_insert" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:po_create')
  );

CREATE POLICY "purchase_orders_update" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:po_create')
      OR public.has_permission_any('procurement:po_approve')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:po_create')
      OR public.has_permission_any('procurement:po_approve')
    )
  );

-- ─── purchase_order_items — inherit from parent ───
DROP POLICY IF EXISTS "purchase_order_items_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_insert" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_update" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_manage" ON public.purchase_order_items;

CREATE POLICY "purchase_order_items_select" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:read')
  );

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

-- ─── goods_received_notes (HQ-only enforced by trigger) ───
DROP POLICY IF EXISTS "goods_received_notes_select" ON public.goods_received_notes;
DROP POLICY IF EXISTS "goods_received_notes_insert" ON public.goods_received_notes;
DROP POLICY IF EXISTS "goods_received_notes_update" ON public.goods_received_notes;
DROP POLICY IF EXISTS "goods_received_notes_manage" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_select" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_insert" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_update" ON public.goods_received_notes;
DROP POLICY IF EXISTS "grn_manage" ON public.goods_received_notes;

CREATE POLICY "grn_select" ON public.goods_received_notes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:read')
  );

CREATE POLICY "grn_insert" ON public.goods_received_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:grn_create')
  );

CREATE POLICY "grn_update" ON public.goods_received_notes
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:grn_create')
      OR public.has_permission_any('procurement:grn_confirm')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:grn_create')
      OR public.has_permission_any('procurement:grn_confirm')
    )
  );

-- ─── grn_items — inherit from parent ───
DROP POLICY IF EXISTS "grn_items_select" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_insert" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_update" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_manage" ON public.grn_items;
DROP POLICY IF EXISTS "grn_items_write"  ON public.grn_items;

CREATE POLICY "grn_items_select" ON public.grn_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:read')
  );

CREATE POLICY "grn_items_write" ON public.grn_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:grn_create')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('procurement:grn_create')
  );
