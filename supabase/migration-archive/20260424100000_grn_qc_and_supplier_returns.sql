-- =============================================================
-- GRN QC mechanism + Supplier Returns
--
-- Adds the missing QC layer at receiving:
--   1. Hàng hư → reject + auto draft supplier_return
--   2. Hàng thiếu → received_quantity < po_quantity + short_delivery_action
--   3. Hàng đổi giá → po_unit_price snapshot + variance % + requires_review (>15%)
--
-- F&B-tuned design: NO BLOCK on price variance (fresh produce price swings 10-30%/week).
-- Threshold breaches set requires_review=TRUE for post-hoc audit + dashboard alert.
--
-- Returns from already-received stock supported via supplier_return:
-- inserts stock_movements with type='supplier_return' (negative qty).
-- =============================================================

-- ─── 1. Expand stock_movements.type to include supplier_return ───
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (
    type IN (
      'adjustment',
      'count_adjustment',
      'consumption',
      'grn_receipt',
      'transfer_out',
      'transfer_in',
      'production_consumption',
      'production_output',
      'supplier_return'
    )
  );

-- ─── 2. Extend grn_items with QC + price-variance columns ───
ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS po_unit_price            NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS price_variance_pct       NUMERIC(7,3) GENERATED ALWAYS AS (
    CASE
      WHEN po_unit_price IS NULL OR po_unit_price = 0 THEN NULL
      ELSE ROUND((unit_cost - po_unit_price) / po_unit_price * 100, 3)
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS price_override_note      TEXT,
  ADD COLUMN IF NOT EXISTS price_override_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS rejected_photo_url       TEXT,
  ADD COLUMN IF NOT EXISTS requires_review          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS short_delivery_action    TEXT
    CHECK (short_delivery_action IS NULL OR short_delivery_action IN (
      'accept_and_close', 'wait_backorder', 'request_credit'
    ));

CREATE INDEX IF NOT EXISTS idx_grn_items_requires_review
  ON public.grn_items(tenant_id) WHERE requires_review = TRUE;

COMMENT ON COLUMN public.grn_items.po_unit_price IS
  'Snapshot of PO line unit_price_est at GRN-from-PO creation. NULL for ad-hoc GRNs.';
COMMENT ON COLUMN public.grn_items.requires_review IS
  'Auto-set to TRUE when |price_variance_pct| > inventory_qc_settings.price_variance_review_pct. Audit-only flag, does not block.';
COMMENT ON COLUMN public.grn_items.short_delivery_action IS
  'Required when received_quantity < po_quantity beyond tolerance. accept_and_close = close PO line; wait_backorder = keep PO open for supplement GRN; request_credit = auto-create supplier_return as credit_note.';

-- ─── 3. inventory_qc_settings (per tenant tolerance config) ───
CREATE TABLE IF NOT EXISTS public.inventory_qc_settings (
  tenant_id                  BIGINT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  qty_short_tolerance_pct    NUMERIC(5,2) NOT NULL DEFAULT 5.00,   -- ≤5% short = silent accept
  price_variance_warn_pct    NUMERIC(5,2) NOT NULL DEFAULT 5.00,   -- >5% = note required
  price_variance_review_pct  NUMERIC(5,2) NOT NULL DEFAULT 15.00,  -- >15% = note + photo + flag
  reject_requires_photo      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                 UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.inventory_qc_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qc_settings_select" ON public.inventory_qc_settings;
CREATE POLICY "qc_settings_select" ON public.inventory_qc_settings
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

DROP POLICY IF EXISTS "qc_settings_manage" ON public.inventory_qc_settings;
CREATE POLICY "qc_settings_manage" ON public.inventory_qc_settings
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'settings:tenant')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'settings:tenant')
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.inventory_qc_settings TO authenticated;

-- Seed defaults for every existing tenant
INSERT INTO public.inventory_qc_settings (tenant_id)
  SELECT id FROM public.tenants
  ON CONFLICT (tenant_id) DO NOTHING;

-- ─── 4. supplier_returns + supplier_return_items ───
CREATE TABLE IF NOT EXISTS public.supplier_returns (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  supplier_id     BIGINT NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  grn_id          BIGINT REFERENCES public.goods_received_notes(id) ON DELETE SET NULL,
  return_number   TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('grn_reject', 'post_receipt')),
  reason          TEXT NOT NULL CHECK (reason IN (
    'damaged', 'wrong_item', 'expired', 'quality_fail', 'short_delivery_credit', 'other'
  )),
  resolution      TEXT NOT NULL DEFAULT 'replacement'
    CHECK (resolution IN ('replacement', 'credit_note', 'cash_refund')),
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'credited', 'refunded', 'cancelled')),
  notes           TEXT,
  total_value     NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  confirmed_by    UUID REFERENCES public.profiles(id),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (return_number, tenant_id)
);

DROP TRIGGER IF EXISTS trg_supplier_returns_updated_at ON public.supplier_returns;
CREATE TRIGGER trg_supplier_returns_updated_at
  BEFORE UPDATE ON public.supplier_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_supplier_returns_tenant   ON public.supplier_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON public.supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_branch   ON public.supplier_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_grn      ON public.supplier_returns(grn_id) WHERE grn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_returns_status   ON public.supplier_returns(status);

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_returns_select" ON public.supplier_returns;
CREATE POLICY "supplier_returns_select" ON public.supplier_returns
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'supplier_return:read')
  );

-- INSERT/UPDATE/DELETE go through SECURITY DEFINER RPCs only.
-- No direct write policies — clients cannot bypass RPC validation.
GRANT SELECT ON TABLE public.supplier_returns TO authenticated;

CREATE TABLE IF NOT EXISTS public.supplier_return_items (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_id       BIGINT NOT NULL REFERENCES public.supplier_returns(id) ON DELETE CASCADE,
  ingredient_id   BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity        NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL,
  unit_cost       NUMERIC(15,2) NOT NULL,
  total_cost      NUMERIC(15,2) NOT NULL,
  grn_item_id     BIGINT REFERENCES public.grn_items(id) ON DELETE SET NULL,
  reason_detail   TEXT,
  photo_url       TEXT,
  stock_movement_id BIGINT,  -- set when source='post_receipt' upon confirm

  UNIQUE (return_id, ingredient_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return ON public.supplier_return_items(return_id);

ALTER TABLE public.supplier_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_return_items_select" ON public.supplier_return_items;
CREATE POLICY "supplier_return_items_select" ON public.supplier_return_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

GRANT SELECT ON TABLE public.supplier_return_items TO authenticated;

-- ─── 5. New permission keys ───
INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('supplier_return:read',    'inventory_procurement', 'Xem phiếu trả hàng nhà cung cấp',    'either'),
  ('supplier_return:create',  'inventory_procurement', 'Tạo phiếu trả hàng nhà cung cấp',    'branch'),
  ('supplier_return:confirm', 'inventory_procurement', 'Xác nhận/gửi phiếu trả hàng NCC',    'branch')
ON CONFLICT (key) DO NOTHING;

-- ─── 6. Append new keys to relevant system templates (kho_truong, quan_ly_CN, quan_ly_vung, super_manager, ke_toan_truong) ───
DO $$
DECLARE
  v_new_keys TEXT[] := ARRAY['supplier_return:read', 'supplier_return:create', 'supplier_return:confirm'];
BEGIN
  UPDATE public.role_templates
  SET permission_keys = ARRAY(
    SELECT DISTINCT k FROM unnest(permission_keys || v_new_keys) AS k ORDER BY k
  ),
  updated_at = now()
  WHERE is_system = TRUE
    AND name IN ('kho_truong', 'quan_ly_CN', 'quan_ly_vung', 'super_manager', 'ke_toan_truong');

  -- ke_toan needs read-only (for credit_note workflow visibility)
  UPDATE public.role_templates
  SET permission_keys = ARRAY(
    SELECT DISTINCT k FROM unnest(permission_keys || ARRAY['supplier_return:read']) AS k ORDER BY k
  ),
  updated_at = now()
  WHERE is_system = TRUE AND name = 'ke_toan';
END $$;

-- ─── 7. RPC: confirm_goods_receipt_note — augmented with QC requires_review flagging ───
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_item            RECORD;
  v_branch          RECORD;
  v_old_q           NUMERIC(15,3);
  v_old_wac         NUMERIC(15,2);
  v_recv            NUMERIC(15,3);
  v_cost            NUMERIC(15,2);
  v_new_q           NUMERIC(15,3);
  v_new_wac         NUMERIC(15,2);
  v_location_id     BIGINT;
  v_inventory_total NUMERIC(15,2) := 0;
  v_journal_id      BIGINT;
  v_lines           JSONB;
  v_all_fulfilled   BOOLEAN;
  v_po_status       TEXT;
  v_review_pct      NUMERIC(5,2);
  v_review_count    INT := 0;
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

  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id
    AND b.tenant_id = v_tenant
    AND b.branch_kind IN ('branch', 'branch');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_must_be_procurement' USING ERRCODE = '23514';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  -- Load tenant QC settings (with sane fallback if row missing)
  SELECT COALESCE(qc.price_variance_review_pct, 15.0)
  INTO v_review_pct
  FROM public.inventory_qc_settings qc
  WHERE qc.tenant_id = v_tenant;
  IF NOT FOUND THEN
    v_review_pct := 15.0;
  END IF;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    -- Flag price-variance review (post-hoc audit, never blocks)
    IF v_item.price_variance_pct IS NOT NULL
       AND ABS(v_item.price_variance_pct) > v_review_pct THEN
      UPDATE public.grn_items
      SET requires_review = TRUE
      WHERE id = v_item.id;
      v_review_count := v_review_count + 1;
    END IF;

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
      reason, created_by, grn_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost, v_location_id
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

    v_inventory_total := v_inventory_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  IF v_inventory_total > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'rule_code', 'GRN_INVENTORY',
      'amount', v_inventory_total,
      'line_description', 'Nhap kho GRN #' || v_grn.grn_number
    ));
    v_journal_id := public.auto_post_journal(
      v_tenant, v_grn.branch_id, 'purchase', p_grn_id,
      'Nhap kho phieu ' || v_grn.grn_number, v_lines, now(), v_uid
    );
    IF v_journal_id IS NOT NULL THEN
      UPDATE public.goods_received_notes
      SET journal_entry_id = v_journal_id
      WHERE id = p_grn_id;
    END IF;
  END IF;

  -- ── PO fulfillment sync (atomic, concurrency-safe) ──
  -- NCC giao bù (back-order) supported: PO stays partially_received until cumulative ≥95%.
  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1
    FROM public.purchase_orders
    WHERE id = v_grn.po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id, SUM(poi.quantity)::NUMERIC(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_grn.po_id
        AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id, SUM(gi.received_quantity)::NUMERIC(15,3) AS qty
      FROM public.grn_items gi
      JOIN public.goods_received_notes g
        ON g.id = gi.grn_id AND g.status = 'confirmed'
      WHERE g.po_id = v_grn.po_id
        AND gi.tenant_id = v_tenant
      GROUP BY gi.ingredient_id
    )
    SELECT bool_and(COALESCE(r.qty, 0) >= o.qty * 0.95)
    INTO v_all_fulfilled
    FROM ordered o
    LEFT JOIN received r USING (ingredient_id)
    WHERE o.qty > 0;

    -- short_delivery_action='accept_and_close' on any GRN item forces PO close even if <95%
    UPDATE public.purchase_orders po
    SET status = CASE
          WHEN COALESCE(v_all_fulfilled, TRUE) THEN 'received'
          WHEN EXISTS (
            SELECT 1 FROM public.grn_items gi2
            JOIN public.goods_received_notes g2 ON g2.id = gi2.grn_id
            WHERE g2.po_id = v_grn.po_id
              AND g2.tenant_id = v_tenant
              AND gi2.short_delivery_action = 'accept_and_close'
          ) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant
      AND po.status IN ('sent', 'partially_received')
    RETURNING po.status INTO v_po_status;
  END IF;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'journal_entry_id', v_journal_id,
    'po_id', v_grn.po_id,
    'po_status', v_po_status,
    'review_count', v_review_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(BIGINT) IS
  'Confirms GRN atomically: stock_movements + WAC + PO sync + GL post. Sets requires_review=TRUE on lines whose |price_variance_pct| > tenant qc_settings.price_variance_review_pct (post-hoc audit, never blocks). Honors short_delivery_action=accept_and_close to close PO even when <95% fulfilled.';

-- ─── 8. RPC: create_supplier_return_from_grn ───
-- Used when GRN has rejected lines → auto-creates a return for supplier sign-off.
-- Hàng từ chối CHƯA vào kho (RPC confirm_grn skips them) → no stock_movement needed.
CREATE OR REPLACE FUNCTION public.create_supplier_return_from_grn(
  p_grn_id     BIGINT,
  p_resolution TEXT DEFAULT 'replacement',  -- replacement | credit_note | cash_refund
  p_reason     TEXT DEFAULT 'damaged',
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_grn     RECORD;
  v_return_id BIGINT;
  v_ret_num   TEXT;
  v_total     NUMERIC(15,2) := 0;
  v_lines_inserted INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_resolution NOT IN ('replacement','credit_note','cash_refund') THEN
    RAISE EXCEPTION 'invalid_resolution' USING ERRCODE = '22023';
  END IF;
  IF p_reason NOT IN ('damaged','wrong_item','expired','quality_fail','short_delivery_credit','other') THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'supplier_return:create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND (gi.quality_status = 'rejected' OR COALESCE(gi.rejected_quantity,0) > 0)
  ) THEN
    RAISE EXCEPTION 'no_rejected_lines' USING ERRCODE = '22023';
  END IF;

  v_ret_num := 'SR-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('public.supplier_returns_id_seq')::TEXT, 4, '0');

  INSERT INTO public.supplier_returns (
    tenant_id, branch_id, supplier_id, grn_id, return_number,
    source, reason, resolution, status, notes, total_value, created_by
  ) VALUES (
    v_tenant, v_grn.branch_id, v_grn.supplier_id, p_grn_id, v_ret_num,
    'grn_reject', p_reason, p_resolution, 'draft', p_notes, 0, v_uid
  ) RETURNING id INTO v_return_id;

  -- Copy rejected lines (rejected_quantity if set, else full received_quantity when status='rejected')
  WITH rej AS (
    INSERT INTO public.supplier_return_items (
      tenant_id, return_id, ingredient_id, quantity, unit, unit_cost, total_cost,
      grn_item_id, reason_detail, photo_url
    )
    SELECT
      v_tenant,
      v_return_id,
      gi.ingredient_id,
      CASE
        WHEN gi.quality_status = 'rejected' AND COALESCE(gi.rejected_quantity,0) = 0
          THEN gi.received_quantity
        ELSE gi.rejected_quantity
      END,
      gi.unit,
      gi.unit_cost,
      ROUND(
        CASE
          WHEN gi.quality_status = 'rejected' AND COALESCE(gi.rejected_quantity,0) = 0
            THEN gi.received_quantity
          ELSE gi.rejected_quantity
        END * gi.unit_cost, 2
      ),
      gi.id,
      gi.rejection_reason,
      gi.rejected_photo_url
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND (gi.quality_status = 'rejected' OR COALESCE(gi.rejected_quantity,0) > 0)
    RETURNING total_cost
  )
  SELECT COALESCE(SUM(total_cost), 0), COUNT(*) INTO v_total, v_lines_inserted FROM rej;

  UPDATE public.supplier_returns SET total_value = v_total WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_ret_num,
    'lines', v_lines_inserted,
    'total_value', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_return_from_grn(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier_return_from_grn(BIGINT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 9. RPC: create_supplier_return_from_stock ───
-- Hàng đã vào kho phát hiện hỏng → trả NCC, ghi stock_movement âm khi confirm.
CREATE OR REPLACE FUNCTION public.create_supplier_return_from_stock(
  p_branch_id   BIGINT,
  p_supplier_id BIGINT,
  p_resolution  TEXT,
  p_reason      TEXT,
  p_notes       TEXT,
  p_lines       JSONB    -- [{ingredient_id, quantity, unit_cost, reason_detail?, photo_url?}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_branch  RECORD;
  v_return_id BIGINT;
  v_ret_num   TEXT;
  v_total     NUMERIC(15,2) := 0;
  v_line      JSONB;
  v_ing_id    BIGINT;
  v_qty       NUMERIC(15,3);
  v_unit_cost NUMERIC(15,2);
  v_unit      TEXT;
  v_lines_inserted INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'supplier_return:create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_resolution NOT IN ('replacement','credit_note','cash_refund') THEN
    RAISE EXCEPTION 'invalid_resolution' USING ERRCODE = '22023';
  END IF;
  IF p_reason NOT IN ('damaged','wrong_item','expired','quality_fail','short_delivery_credit','other') THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'no_lines' USING ERRCODE = '22023';
  END IF;

  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = p_branch_id AND b.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_ret_num := 'SR-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('public.supplier_returns_id_seq')::TEXT, 4, '0');

  INSERT INTO public.supplier_returns (
    tenant_id, branch_id, supplier_id, grn_id, return_number,
    source, reason, resolution, status, notes, total_value, created_by
  ) VALUES (
    v_tenant, p_branch_id, p_supplier_id, NULL, v_ret_num,
    'post_receipt', p_reason, p_resolution, 'draft', p_notes, 0, v_uid
  ) RETURNING id INTO v_return_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ing_id    := (v_line->>'ingredient_id')::BIGINT;
    v_qty       := (v_line->>'quantity')::NUMERIC(15,3);
    v_unit_cost := (v_line->>'unit_cost')::NUMERIC(15,2);

    IF v_ing_id IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_unit_cost IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;

    SELECT i.unit INTO v_unit
    FROM public.ingredients i
    WHERE i.id = v_ing_id AND i.tenant_id = v_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.supplier_return_items (
      tenant_id, return_id, ingredient_id, quantity, unit, unit_cost, total_cost,
      reason_detail, photo_url
    ) VALUES (
      v_tenant, v_return_id, v_ing_id, v_qty, v_unit, v_unit_cost,
      ROUND(v_qty * v_unit_cost, 2),
      v_line->>'reason_detail', v_line->>'photo_url'
    );
    v_total := v_total + ROUND(v_qty * v_unit_cost, 2);
    v_lines_inserted := v_lines_inserted + 1;
  END LOOP;

  UPDATE public.supplier_returns SET total_value = v_total WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_ret_num,
    'lines', v_lines_inserted,
    'total_value', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_return_from_stock(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier_return_from_stock(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ─── 10. RPC: confirm_supplier_return — moves status to 'sent', and for post_receipt source posts negative stock movement ───
CREATE OR REPLACE FUNCTION public.confirm_supplier_return(p_return_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_ret     RECORD;
  v_item    RECORD;
  v_old_q   NUMERIC(15,3);
  v_mv_id   BIGINT;
  v_lines_processed INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_ret
  FROM public.supplier_returns
  WHERE id = p_return_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'return_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_ret.branch_id, 'supplier_return:confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_ret.status <> 'draft' THEN
    RAISE EXCEPTION 'return_not_draft' USING ERRCODE = '22023';
  END IF;

  -- For post_receipt returns, decrement stock atomically per line (FOR UPDATE serialise)
  IF v_ret.source = 'post_receipt' THEN
    FOR v_item IN
      SELECT * FROM public.supplier_return_items
      WHERE return_id = p_return_id AND tenant_id = v_tenant
      ORDER BY ingredient_id
    LOOP
      SELECT current_quantity INTO v_old_q
      FROM public.stock_levels
      WHERE tenant_id = v_tenant
        AND branch_id = v_ret.branch_id
        AND ingredient_id = v_item.ingredient_id
      FOR UPDATE;

      IF NOT FOUND OR COALESCE(v_old_q, 0) < v_item.quantity THEN
        RAISE EXCEPTION 'insufficient_stock_for_return' USING ERRCODE = '23514',
          DETAIL = format('ingredient_id=%s, requested=%s, available=%s',
                          v_item.ingredient_id, v_item.quantity, COALESCE(v_old_q, 0));
      END IF;

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, unit_cost
      ) VALUES (
        v_tenant, v_ret.branch_id, v_item.ingredient_id, 'supplier_return',
        -v_item.quantity,
        'Trả NCC ' || v_ret.return_number, v_uid, v_item.unit_cost
      ) RETURNING id INTO v_mv_id;

      UPDATE public.supplier_return_items
      SET stock_movement_id = v_mv_id
      WHERE id = v_item.id;

      v_lines_processed := v_lines_processed + 1;
    END LOOP;
  END IF;

  UPDATE public.supplier_returns
  SET status = 'sent',
      confirmed_by = v_uid,
      confirmed_at = now(),
      updated_at = now()
  WHERE id = p_return_id;

  RETURN jsonb_build_object(
    'return_id', p_return_id,
    'status', 'sent',
    'lines_processed', v_lines_processed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_supplier_return(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_supplier_return(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.confirm_supplier_return(BIGINT) IS
  'Moves supplier_return draft → sent. For source=post_receipt, decrements stock_levels atomically (FOR UPDATE) and inserts negative stock_movement type=supplier_return.';
