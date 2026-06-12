-- =============================================================
-- M5 Stock Enterprise: tenant procurement (PO/GRN/WAC), transfers tenant→branch,
-- supplier invoices + matching, recipes + consume on order completed.
-- Convention: only branches with is_tenant = true receive external GRNs.
-- =============================================================

-- ─── 1. stock_levels: weighted average cost ───

ALTER TABLE public.stock_levels
  ADD COLUMN IF NOT EXISTS avg_unit_cost NUMERIC(15,2);

COMMENT ON COLUMN public.stock_levels.avg_unit_cost IS 'Weighted average unit cost (WAC) at this branch warehouse.';

-- ─── 2. stock_movements: extend types + refs ───

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS grn_id BIGINT,
  ADD COLUMN IF NOT EXISTS transfer_id BIGINT,
  ADD COLUMN IF NOT EXISTS order_id BIGINT,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,2);

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (
    type IN (
      'adjustment',
      'count_adjustment',
      'consumption',
      'grn_receipt',
      'transfer_out',
      'transfer_in'
    )
  );

CREATE INDEX IF NOT EXISTS idx_stock_movements_grn ON public.stock_movements(grn_id) WHERE grn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer ON public.stock_movements(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON public.stock_movements(order_id) WHERE order_id IS NOT NULL;

-- FKs added after parent tables exist — see §8 below (forward refs resolved via ALTER at end)

-- ─── 3. suppliers ───

CREATE TABLE public.suppliers (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  tax_code        TEXT,
  phone           TEXT,
  address         TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, tenant_id)
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_suppliers_tenant ON public.suppliers(tenant_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "suppliers_manage" ON public.suppliers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO authenticated;

-- ─── 4. purchase_orders + items ───

CREATE TABLE public.purchase_orders (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  supplier_id     BIGINT NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_number       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  ordered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (po_number, tenant_id)
);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_po_tenant ON public.purchase_orders(tenant_id);
CREATE INDEX idx_po_branch ON public.purchase_orders(branch_id);

CREATE OR REPLACE FUNCTION public.enforce_po_branch_is_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.is_tenant = true
  ) THEN
    RAISE EXCEPTION 'purchase_orders: branch must be tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_po_hq_only
  BEFORE INSERT OR UPDATE OF branch_id ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_po_branch_is_tenant();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "purchase_orders_manage" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_orders TO authenticated;

CREATE TABLE public.purchase_order_items (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id             BIGINT NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id     BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity          NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit              TEXT NOT NULL,
  unit_price_est    NUMERIC(15,2),
  line_total        NUMERIC(15,2),

  UNIQUE (po_id, ingredient_id, tenant_id)
);

CREATE INDEX idx_poi_po ON public.purchase_order_items(po_id);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_items_select" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "po_items_manage" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_order_items TO authenticated;

-- ─── 5. goods_received_notes + grn_items ───

CREATE TABLE public.goods_received_notes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  po_id           BIGINT REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier_id     BIGINT NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  grn_number      TEXT NOT NULL,
  received_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by     UUID REFERENCES public.profiles(id),
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (grn_number, tenant_id)
);

CREATE TRIGGER trg_grn_updated_at
  BEFORE UPDATE ON public.goods_received_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_grn_tenant ON public.goods_received_notes(tenant_id);
CREATE INDEX idx_grn_branch ON public.goods_received_notes(branch_id);

CREATE TRIGGER trg_grn_hq_only
  BEFORE INSERT OR UPDATE OF branch_id ON public.goods_received_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_po_branch_is_tenant();

ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grn_select" ON public.goods_received_notes
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "grn_manage" ON public.goods_received_notes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.goods_received_notes TO authenticated;

CREATE TABLE public.grn_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grn_id              BIGINT NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  ingredient_id       BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  po_quantity         NUMERIC(15,3),
  received_quantity   NUMERIC(15,3) NOT NULL CHECK (received_quantity >= 0),
  unit                TEXT NOT NULL,
  unit_cost           NUMERIC(15,2) NOT NULL,
  total_cost          NUMERIC(15,2) NOT NULL,
  quality_status      TEXT NOT NULL DEFAULT 'accepted'
    CHECK (quality_status IN ('accepted', 'rejected', 'partial')),
  rejected_quantity   NUMERIC(15,3) NOT NULL DEFAULT 0,
  rejection_reason    TEXT,
  expiry_date         DATE,
  batch_number        TEXT,

  UNIQUE (grn_id, ingredient_id, tenant_id)
);

CREATE INDEX idx_grn_items_grn ON public.grn_items(grn_id);

ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grn_items_select" ON public.grn_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "grn_items_manage" ON public.grn_items
  FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grn_items TO authenticated;

-- ─── 6. stock_transfers + items ───

CREATE TABLE public.stock_transfers (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_branch_id      BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id        BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  transfer_number     TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed_ship', 'in_transit', 'received', 'cancelled')),
  notes               TEXT,
  vehicle_info        TEXT,
  created_by          UUID NOT NULL REFERENCES public.profiles(id),
  shipped_at          TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (from_branch_id <> to_branch_id),
  UNIQUE (transfer_number, tenant_id)
);

CREATE TRIGGER trg_stock_transfers_updated_at
  BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_stock_transfers_tenant ON public.stock_transfers(tenant_id);
CREATE INDEX idx_stock_transfers_from ON public.stock_transfers(from_branch_id);
CREATE INDEX idx_stock_transfers_to ON public.stock_transfers(to_branch_id);

CREATE OR REPLACE FUNCTION public.enforce_transfer_from_hq()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.from_branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.is_tenant = true
  ) THEN
    RAISE EXCEPTION 'stock_transfers: from_branch must be tenant' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.to_branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.is_tenant = true
  ) THEN
    RAISE EXCEPTION 'stock_transfers: to_branch must not be tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transfer_hq_to_branch
  BEFORE INSERT OR UPDATE OF from_branch_id, to_branch_id ON public.stock_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_transfer_from_hq();

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_transfers_select" ON public.stock_transfers
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "stock_transfers_manage" ON public.stock_transfers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_transfers TO authenticated;

CREATE TABLE public.stock_transfer_items (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id             BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_id           BIGINT NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  ingredient_id         BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity              NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit                  TEXT NOT NULL,
  unit_cost_at_ship     NUMERIC(15,2),
  quantity_received     NUMERIC(15,3),

  UNIQUE (transfer_id, ingredient_id, tenant_id)
);

CREATE INDEX idx_sti_transfer ON public.stock_transfer_items(transfer_id);

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sti_select" ON public.stock_transfer_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "sti_manage" ON public.stock_transfer_items
  FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_transfer_items TO authenticated;

-- ─── 7. supplier_invoices ───

CREATE TABLE public.supplier_invoices (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id         BIGINT NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  grn_id              BIGINT REFERENCES public.goods_received_notes(id) ON DELETE SET NULL,
  po_id               BIGINT REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_number      TEXT NOT NULL,
  invoice_date        TIMESTAMPTZ NOT NULL,
  subtotal            NUMERIC(15,2) NOT NULL,
  vat_rate            NUMERIC(5,2) NOT NULL DEFAULT 8.00,
  vat_amount          NUMERIC(15,2) NOT NULL,
  total_amount        NUMERIC(15,2) NOT NULL,
  matching_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (matching_status IN ('pending', 'matched', 'discrepancy', 'approved')),
  matching_notes      TEXT,
  created_by          UUID NOT NULL REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (invoice_number, supplier_id, tenant_id)
);

CREATE TRIGGER trg_supplier_invoices_updated_at
  BEFORE UPDATE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_supplier_invoices_tenant ON public.supplier_invoices(tenant_id);
CREATE INDEX idx_supplier_invoices_grn ON public.supplier_invoices(grn_id);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_invoices_select" ON public.supplier_invoices
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "supplier_invoices_manage" ON public.supplier_invoices
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_invoices TO authenticated;

-- ─── 8. recipes ───

CREATE TABLE public.recipes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_item_id    BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id   BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity        NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (menu_item_id, ingredient_id, tenant_id)
);

CREATE INDEX idx_recipes_menu ON public.recipes(menu_item_id);
CREATE INDEX idx_recipes_tenant ON public.recipes(tenant_id);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select" ON public.recipes
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "recipes_manage" ON public.recipes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipes TO authenticated;

-- ─── 9. FKs on stock_movements ───

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_grn_id_fkey
    FOREIGN KEY (grn_id) REFERENCES public.goods_received_notes(id) ON DELETE SET NULL;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_transfer_id_fkey
    FOREIGN KEY (transfer_id) REFERENCES public.stock_transfers(id) ON DELETE SET NULL;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- ─── 10. RPC: confirm_grn ───

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_grn           RECORD;
  v_item          RECORD;
  v_branch        BIGINT;
  v_old_q         NUMERIC(15,3);
  v_old_wac       NUMERIC(15,2);
  v_recv          NUMERIC(15,3);
  v_cost          NUMERIC(15,2);
  v_new_q         NUMERIC(15,3);
  v_new_wac       NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  SELECT b.id INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id AND b.tenant_id = v_tenant AND b.is_tenant = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_tenant_branch' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    IF v_item.quality_status = 'rejected' OR v_item.received_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_recv := v_item.received_quantity;
    v_cost := v_item.unit_cost;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  RETURN jsonb_build_object('grn_id', p_grn_id, 'status', 'confirmed');
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(BIGINT) TO authenticated;

-- ─── 11. Transfer RPCs ───

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_sl        NUMERIC(15,3);
  v_wac       NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_sl, v_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.from_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND OR COALESCE(v_sl, 0) < v_line.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_line.ingredient_id USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost
    ) VALUES (
      v_tenant, v_tr.from_branch_id, v_line.ingredient_id, 'transfer_out', -v_line.quantity,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_wac
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_wac
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'confirmed_ship', shipped_at = now(), updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'confirmed_ship');
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_ship(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_confirm_ship(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_transfer_mark_in_transit(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_tr     RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'confirmed_ship' THEN
    RAISE EXCEPTION 'transfer_wrong_state' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stock_transfers
  SET status = 'in_transit', updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'in_transit');
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_mark_in_transit(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_mark_in_transit(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id BIGINT,
  p_items       JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_recv      NUMERIC(15,3);
  v_cost      NUMERIC(15,2);
  v_old_q     NUMERIC(15,3);
  v_old_wac   NUMERIC(15,2);
  v_new_q     NUMERIC(15,3);
  v_new_wac   NUMERIC(15,2);
  v_key       TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'in_transit' THEN
    RAISE EXCEPTION 'transfer_not_in_transit' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::text;
      IF (p_items ? v_key) THEN
        v_recv := (p_items ->> v_key)::numeric;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items SET quantity_received = 0 WHERE id = v_line.id;
      CONTINUE;
    END IF;

    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received', received_at = now(), updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(BIGINT, JSONB) TO authenticated;

-- ─── 12. recompute_supplier_invoice_matching ───

CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_matching(p_invoice_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   BIGINT := public.auth_tenant_id();
  v_inv      RECORD;
  v_grn_tot  NUMERIC(15,2);
  v_po_tot   NUMERIC(15,2);
  v_status   TEXT := 'matched';
BEGIN
  SELECT * INTO v_inv FROM public.supplier_invoices
  WHERE id = p_invoice_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.grn_id IS NOT NULL THEN
    SELECT COALESCE(SUM(gi.total_cost), 0) INTO v_grn_tot
    FROM public.grn_items gi WHERE gi.grn_id = v_inv.grn_id;
    IF v_inv.total_amount > v_grn_tot * 1.02 THEN
      v_status := 'discrepancy';
    END IF;
  END IF;

  IF v_inv.po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(poi.line_total), 0) INTO v_po_tot
    FROM public.purchase_order_items poi WHERE poi.po_id = v_inv.po_id;
    IF v_po_tot > 0 AND abs(v_inv.subtotal - v_po_tot) / v_po_tot > 0.02 THEN
      v_status := 'discrepancy';
    END IF;
  END IF;

  UPDATE public.supplier_invoices
  SET matching_status = v_status, updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'matching_status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_matching(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_invoice_matching(BIGINT) TO authenticated;

-- ─── 13. consume_stock_for_order + hook in transition_order_status ───

CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_order     RECORD;
  v_need      RECORD;
  v_sl        NUMERIC(15,3);
  v_total     NUMERIC(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order FROM public.orders o
  WHERE o.id = p_order_id AND o.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id AND sm.type = 'consumption' AND sm.tenant_id = v_tenant
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed');
  END IF;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::numeric * r.quantity) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost
    )
    SELECT
      v_tenant,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text,
      v_uid,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0)
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id BIGINT,
  p_new_status TEXT,
  p_expected_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_order RECORD;
BEGIN
  v_actor_id := auth.uid();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, table_id, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = v_actor_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_branch IS NOT NULL AND v_order.branch_id <> v_actor_branch THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = 'P0003';
  END IF;

  IF v_order.status <> p_expected_status THEN
    RAISE EXCEPTION 'status_changed:% expected % got %', v_order.status, p_expected_status, v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (p_expected_status = 'new' AND p_new_status = 'confirmed')
    OR (p_expected_status = 'served' AND p_new_status = 'completed')
    OR (p_expected_status NOT IN ('completed') AND p_new_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'invalid_transition:% to %', p_expected_status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_actor_tenant, p_order_id, v_order.status, p_new_status, v_actor_id, p_note
  );

  IF p_new_status = 'cancelled' THEN
    UPDATE public.order_items
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = p_order_id
      AND status NOT IN ('served', 'cancelled');
  END IF;

  IF p_new_status = 'completed' AND p_expected_status = 'served' THEN
    PERFORM public.consume_stock_for_order(p_order_id);
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_order.status,
    'new_status', p_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order_status(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_order_status(BIGINT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(BIGINT, TEXT, TEXT, TEXT) TO authenticated;
