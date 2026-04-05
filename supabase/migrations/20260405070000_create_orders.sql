-- =============================================================
-- M2-S1: Order Schema + State Machine
-- Tables: orders, order_items, order_status_history
-- =============================================================

-- ========================
-- 1. orders
-- ========================
CREATE TABLE public.orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id BIGINT REFERENCES public.tables(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'dine_in'
    CHECK (order_type IN ('dine_in', 'takeaway')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  customer_count INT NOT NULL DEFAULT 1 CHECK (customer_count > 0),
  note TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, order_number, tenant_id)
);

CREATE INDEX idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX idx_orders_branch ON public.orders(branch_id);
CREATE INDEX idx_orders_table ON public.orders(table_id);
CREATE INDEX idx_orders_created_by ON public.orders(created_by);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.orders
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "branch_insert" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "branch_update" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO authenticated;
-- No DELETE — orders are business records, use status = 'cancelled' instead

-- ========================
-- 2. order_items
-- ========================
CREATE TABLE public.order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  variant_id BIGINT REFERENCES public.menu_item_variants(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  variant_name TEXT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(15,2) NOT NULL,
  modifiers JSONB NOT NULL DEFAULT '[]',
  sides JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(15,2) NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.order_items.modifiers IS 'Snapshot: [{"modifier_id": bigint, "name": text, "price": numeric}]';
COMMENT ON COLUMN public.order_items.sides IS 'Snapshot: [{"side_item_id": bigint, "name": text, "price": numeric, "quantity": int}]';

CREATE INDEX idx_order_items_tenant ON public.order_items(tenant_id);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_menu_item ON public.order_items(menu_item_id);

CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "branch_insert" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.tenant_id = order_items.tenant_id
        AND (
          o.branch_id = public.auth_branch_id()
          OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        )
    )
  );

CREATE POLICY "branch_update" ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.tenant_id = order_items.tenant_id
        AND (
          o.branch_id = public.auth_branch_id()
          OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.tenant_id = order_items.tenant_id
        AND (
          o.branch_id = public.auth_branch_id()
          OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.order_items TO authenticated;
-- No DELETE — order items follow parent order lifecycle

-- ========================
-- 3. order_status_history (audit trail — immutable)
-- ========================
CREATE TABLE public.order_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_tenant ON public.order_status_history(tenant_id);
CREATE INDEX idx_order_status_history_order ON public.order_status_history(order_id);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "branch_insert" ON public.order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.tenant_id = order_status_history.tenant_id
        AND (
          o.branch_id = public.auth_branch_id()
          OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        )
    )
  );

-- No UPDATE or DELETE policies — audit trail is immutable

GRANT SELECT, INSERT ON TABLE public.order_status_history TO authenticated;
