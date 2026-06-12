-- =============================================================
-- GRN semantic change: `received_quantity` = "Số đã giao" (total delivered)
-- Stock impact = received_quantity − rejected_quantity (= net accepted into stock)
--
-- Decision (4-agent debate 2026-05-06):
--   User mental model + Vietnamese business norm: "đã giao 5, trả 3 → vào kho 2".
--   Trước fix: received_quantity = số nhận tốt vào kho; rejected_quantity = phụ trội.
--             Stock += received_quantity (rejected info-only) → stock cộng dư khi rejected > 0.
--   Sau fix: received_quantity = tổng đã giao; rejected_quantity = subset bị từ chối.
--           Stock += (received − rejected). PO fulfillment dùng net. GL inventory_total = net × unit_cost.
--
-- Backwards compat:
--   • stock_movements append-only — KHÔNG re-post lịch sử.
--   • grn_items.received_quantity backfill = received_old + rejected_old (cho mọi row có rejected > 0).
--     Sau backfill: net (received_new − rejected) = received_old → mọi aggregate đọc từ grn_items
--     vẫn cho ra số stock đúng như trước đây.
--
-- Out of scope (defer):
--   • Over-delivery validation (received > po × 1.10)
--   • supplier_invoices 3-way matching split AP/credit logic
--   • mv_grn_price_baseline filter cho net=0 lines
-- =============================================================

-- ─── 1. CHECK constraint: rejected ≤ received ────────────────
ALTER TABLE public.grn_items
  ADD CONSTRAINT grn_items_rejected_le_received
  CHECK (COALESCE(rejected_quantity, 0) <= received_quantity) NOT VALID;

-- ─── 2. Backfill: received_quantity := received + rejected (cho row có rejected > 0) ─
-- Áp dụng cho TẤT CẢ status (draft + confirmed + cancelled). Stock_movements đã ghi
-- quantity_change = received_old; sau backfill, công thức (received_new − rejected) = received_old
-- → reader nào đọc grn_items đều cho ra net đúng = số stock_movements đã ghi.
UPDATE public.grn_items
SET received_quantity = received_quantity + COALESCE(rejected_quantity, 0)
WHERE COALESCE(rejected_quantity, 0) > 0;

ALTER TABLE public.grn_items VALIDATE CONSTRAINT grn_items_rejected_le_received;

COMMENT ON COLUMN public.grn_items.received_quantity IS
  'Tổng số lượng nhà cung cấp đã giao (gross delivered). Stock impact = received − rejected. Số nhận tốt vào kho được tính bằng (received − rejected_quantity).';

COMMENT ON COLUMN public.grn_items.rejected_quantity IS
  'Số lượng (subset của received_quantity) bị từ chối + trả NCC. Bắt buộc ≤ received_quantity.';

-- ─── 3. Redefine confirm_goods_receipt_note: stock = net (received − rejected) ─
-- Latest prior version: 20260425000000_stock_levels_per_location.sql:216
-- Changes:
--   • v_recv = received_quantity − COALESCE(rejected_quantity, 0)
--   • CONTINUE khi v_recv ≤ 0 (handle full-reject + zero-delivery)
--   • inventory_total += v_recv × unit_cost (parity với stock value)
--   • PO fulfillment aggregate dùng SUM(received − rejected) thay vì SUM(received)
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

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_default_receive_location_missing' USING ERRCODE = 'P0002';
  END IF;

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
    IF v_item.price_variance_pct IS NOT NULL
       AND ABS(v_item.price_variance_pct) > v_review_pct THEN
      UPDATE public.grn_items
      SET requires_review = TRUE
      WHERE id = v_item.id;
      v_review_count := v_review_count + 1;
    END IF;

    -- NET stock impact = delivered − rejected. Skip when net ≤ 0 (full-reject hoặc zero-delivery).
    v_recv := v_item.received_quantity - COALESCE(v_item.rejected_quantity, 0);

    IF v_item.quality_status = 'rejected' OR v_recv <= 0 THEN
      CONTINUE;
    END IF;

    v_cost := v_item.unit_cost;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
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
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
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
      SELECT gi.ingredient_id,
             SUM(gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::NUMERIC(15,3) AS qty
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
  'Atomic confirm GRN. Stock += (received_quantity − rejected_quantity). PO fulfillment aggregate dùng net. GL journal posts net × unit_cost. Permission: procurement:grn_confirm.';

-- ─── 4. Drop & redefine amend_grn_line: thêm p_rejected_quantity ─
DROP FUNCTION IF EXISTS public.amend_grn_line(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.amend_grn_line(
  p_grn_id              BIGINT,
  p_line_id             BIGINT,
  p_received_quantity   NUMERIC,
  p_unit_cost           NUMERIC,
  p_reason              TEXT,
  p_rejected_quantity   NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_line            RECORD;
  v_old_qty         NUMERIC(15,3);
  v_old_rej         NUMERIC(15,3);
  v_old_cost        NUMERIC(15,2);
  v_old_net         NUMERIC(15,3);
  v_new_qty         NUMERIC(15,3) := p_received_quantity;
  v_new_rej         NUMERIC(15,3);
  v_new_cost        NUMERIC(15,2) := p_unit_cost;
  v_new_net         NUMERIC(15,3);
  v_delta_qty       NUMERIC(15,3);
  v_delta_value     NUMERIC(15,2);
  v_current_qty     NUMERIC(15,3);
  v_active_returns  INT;
  v_paid_invoices   INT;
  v_location_id     BIGINT;
  v_invoice_id      BIGINT;
  v_po_status       TEXT;
  v_all_fulfilled   BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required_min_5_chars' USING ERRCODE = '22023';
  END IF;

  IF p_received_quantity IS NULL OR p_received_quantity < 0
     OR p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Lock GRN row
  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_amend') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF v_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'grn_not_confirmed_use_upsert' USING ERRCODE = '22023';
  END IF;

  -- Lock GRN line row
  SELECT gi.* INTO v_line
  FROM public.grn_items gi
  WHERE gi.id = p_line_id
    AND gi.grn_id = p_grn_id
    AND gi.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_line_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_old_qty := v_line.received_quantity;
  v_old_rej := COALESCE(v_line.rejected_quantity, 0);
  v_old_cost := v_line.unit_cost;
  v_old_net := v_old_qty - v_old_rej;

  -- Caller có thể giữ nguyên rejected (NULL = không đổi) hoặc đổi giá trị mới.
  v_new_rej := COALESCE(p_rejected_quantity, v_old_rej);

  IF v_new_rej < 0 OR v_new_rej > v_new_qty THEN
    RAISE EXCEPTION 'rejected_exceeds_received' USING ERRCODE = '22023';
  END IF;

  v_new_net := v_new_qty - v_new_rej;

  -- Hard-block: linked supplier_return active
  SELECT COUNT(*) INTO v_active_returns
  FROM public.supplier_return_items sri
  JOIN public.supplier_returns sr ON sr.id = sri.return_id
  WHERE sri.tenant_id = v_tenant
    AND sri.grn_item_id = p_line_id
    AND sr.status NOT IN ('cancelled');

  IF v_active_returns > 0 THEN
    RAISE EXCEPTION 'has_active_supplier_return' USING ERRCODE = '23514';
  END IF;

  -- Hard-block: linked supplier_invoice with payment_status != 'unpaid'
  SELECT COUNT(*) INTO v_paid_invoices
  FROM public.supplier_invoices si
  WHERE si.tenant_id = v_tenant
    AND si.grn_id = p_grn_id
    AND COALESCE(si.payment_status, 'unpaid') <> 'unpaid';

  IF v_paid_invoices > 0 THEN
    RAISE EXCEPTION 'has_paid_invoice' USING ERRCODE = '23514';
  END IF;

  -- Delta dựa trên NET (số đã vào kho), không phải gross delivered
  v_delta_qty := v_new_net - v_old_net;
  v_delta_value := (v_new_net * v_new_cost) - (v_old_net * v_old_cost);

  -- Hard-block: stock would go negative
  SELECT current_quantity INTO v_current_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant
    AND branch_id = v_grn.branch_id
    AND ingredient_id = v_line.ingredient_id;

  v_current_qty := COALESCE(v_current_qty, 0);

  IF v_current_qty + v_delta_qty < 0 THEN
    RAISE EXCEPTION 'negative_stock' USING ERRCODE = '23514';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  -- Insert compensating stock_movement (delta NET)
  IF v_delta_qty <> 0 THEN
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_line.ingredient_id, 'grn_amend',
      v_delta_qty,
      'GRN ' || v_grn.grn_number || ' amend (line ' || p_line_id || '): '
        || v_old_qty || '/' || v_old_rej || ' → ' || v_new_qty || '/' || v_new_rej
        || ' @ ' || v_old_cost || ' → ' || v_new_cost
        || ' — ' || trim(p_reason),
      v_uid, p_grn_id, v_new_cost, v_location_id
    );
  END IF;

  -- Update grn_items
  UPDATE public.grn_items
  SET received_quantity = v_new_qty,
      rejected_quantity = v_new_rej,
      unit_cost = v_new_cost,
      total_cost = ROUND(v_new_qty * v_new_cost, 2)
  WHERE id = p_line_id AND tenant_id = v_tenant;

  -- Re-evaluate PO status if linked (sử dụng net cùng công thức confirm)
  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1 FROM public.purchase_orders
    WHERE id = v_grn.po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id, SUM(poi.quantity)::NUMERIC(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_grn.po_id AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id,
             SUM(gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::NUMERIC(15,3) AS qty
      FROM public.grn_items gi
      JOIN public.goods_received_notes g
        ON g.id = gi.grn_id AND g.status = 'confirmed'
      WHERE g.po_id = v_grn.po_id AND gi.tenant_id = v_tenant
      GROUP BY gi.ingredient_id
    )
    SELECT bool_and(COALESCE(r.qty, 0) >= o.qty * 0.95)
    INTO v_all_fulfilled
    FROM ordered o
    LEFT JOIN received r USING (ingredient_id)
    WHERE o.qty > 0;

    UPDATE public.purchase_orders po
    SET status = CASE
          WHEN COALESCE(v_all_fulfilled, TRUE) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant
      AND po.status IN ('sent', 'partially_received', 'received')
    RETURNING po.status INTO v_po_status;
  END IF;

  -- Re-trigger 3-way matching for any linked invoice (best-effort)
  FOR v_invoice_id IN
    SELECT id FROM public.supplier_invoices
    WHERE tenant_id = v_tenant AND grn_id = p_grn_id
  LOOP
    PERFORM public.recompute_supplier_invoice_matching(v_invoice_id);
  END LOOP;

  RETURN jsonb_build_object(
    'grn_id',      p_grn_id,
    'line_id',     p_line_id,
    'old_qty',     v_old_qty,
    'old_rejected', v_old_rej,
    'new_qty',     v_new_qty,
    'new_rejected', v_new_rej,
    'old_cost',    v_old_cost,
    'new_cost',    v_new_cost,
    'delta_qty',   v_delta_qty,
    'delta_value', v_delta_value,
    'po_id',       v_grn.po_id,
    'po_status',   v_po_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.amend_grn_line(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amend_grn_line(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.amend_grn_line(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT, NUMERIC) IS
  'Owner-only post-confirm GRN line amendment. Delta dựa trên NET (received − rejected). Compensating stock_movement (grn_amend) → trigger trg_update_stock_on_movement upsert stock_levels.current_quantity. PO fulfillment dùng SUM(received − rejected). Permission: procurement:grn_amend.';

-- ─── 5. Patch grn_is_auto_approvable: dùng net (received − rejected) cho tổng GRN value ─
-- Latest prior: 20260425162000_s9b_fix_reason_array_append.sql:18
CREATE OR REPLACE FUNCTION public.grn_is_auto_approvable(p_grn_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id(); v_grn RECORD; v_tz TEXT; v_local_time TIMESTAMP; v_win RECORD;
  v_in_base BOOLEAN := false; v_in_ext BOOLEAN := false; v_in_window BOOLEAN;
  v_total_grn NUMERIC; v_total_po NUMERIC; v_line_qty_max NUMERIC; v_line_prc_max NUMERIC;
  v_bad_qc INT; v_bad_review INT; v_bad_var INT; v_sup_hist INT; v_trust NUMERIC;
  v_cap NUMERIC := 10000000;
  v_c1 BOOLEAN; v_c2 BOOLEAN; v_c3 BOOLEAN; v_c4 BOOLEAN;
  v_c5 BOOLEAN; v_c6 BOOLEAN; v_c7 BOOLEAN; v_c8 BOOLEAN;
  v_hard_ok BOOLEAN; v_soft_ok BOOLEAN; v_approved BOOLEAN;
  v_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_grn FROM public.goods_received_notes WHERE id = p_grn_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'grn not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'inventory:read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT timezone INTO v_tz FROM public.branches WHERE id = v_grn.branch_id;
  IF v_tz IS NULL THEN v_tz := 'Asia/Ho_Chi_Minh'; END IF;
  v_local_time := now() AT TIME ZONE v_tz;
  SELECT enabled, start_time, end_time INTO v_win FROM public.branch_express_window WHERE branch_id = v_grn.branch_id;
  IF FOUND AND v_win.enabled THEN
    v_in_base := (v_local_time::TIME >= v_win.start_time AND v_local_time::TIME < v_win.end_time);
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.grn_express_extend_audit WHERE branch_id = v_grn.branch_id AND extended_until > now() AND created_at > now() - INTERVAL '1 day') INTO v_in_ext;
  v_in_window := v_in_base OR v_in_ext;

  v_c1 := v_grn.po_id IS NOT NULL;
  IF NOT v_c1 THEN v_reasons := array_append(v_reasons, 'no_po'); END IF;

  SELECT COUNT(*) INTO v_bad_var FROM public.grn_items WHERE grn_id = p_grn_id AND (variance_tier IS NULL OR variance_tier > 1);
  v_c2 := v_bad_var = 0;
  IF NOT v_c2 THEN v_reasons := array_append(v_reasons, 'variance_tier_gt1'); END IF;

  IF v_c1 THEN
    -- NET value (received − rejected) × cost: parity với GL inventory_total và stock value
    SELECT COALESCE(SUM((received_quantity - COALESCE(rejected_quantity, 0)) * unit_cost), 0)
      INTO v_total_grn FROM public.grn_items WHERE grn_id = p_grn_id;
    SELECT COALESCE(SUM(line_total), 0) INTO v_total_po FROM public.purchase_order_items WHERE po_id = v_grn.po_id;
    -- Line qty variance đo lường delivered vs ordered (NCC giao đúng số đặt) → vẫn dùng received gross
    SELECT COALESCE(MAX(ABS(gi.received_quantity - gi.po_quantity) / NULLIF(gi.po_quantity, 0)), 0) INTO v_line_qty_max FROM public.grn_items gi WHERE gi.grn_id = p_grn_id;
    SELECT COALESCE(MAX(ABS(gi.unit_cost - gi.po_unit_price) / NULLIF(gi.po_unit_price, 0)), 0) INTO v_line_prc_max FROM public.grn_items gi WHERE gi.grn_id = p_grn_id;
    v_c3 := (v_total_po > 0 AND ABS(v_total_grn - v_total_po) / v_total_po <= 0.03) AND v_line_qty_max <= 0.10 AND v_line_prc_max <= 0.15;
  ELSE
    v_c3 := false;
  END IF;
  IF NOT v_c3 THEN v_reasons := array_append(v_reasons, 'line_totals_diff'); END IF;

  SELECT COUNT(*) INTO v_bad_qc FROM public.grn_items WHERE grn_id = p_grn_id
    AND (quality_status IN ('rejected','partial') OR rejected_quantity > 0 OR short_delivery_action IS NOT NULL);
  v_c4 := v_bad_qc = 0;
  IF NOT v_c4 THEN v_reasons := array_append(v_reasons, 'quality_issue'); END IF;

  IF v_total_grn IS NULL THEN
    SELECT COALESCE(SUM((received_quantity - COALESCE(rejected_quantity, 0)) * unit_cost), 0)
      INTO v_total_grn FROM public.grn_items WHERE grn_id = p_grn_id;
  END IF;
  v_c5 := v_total_grn <= v_cap;
  IF NOT v_c5 THEN v_reasons := array_append(v_reasons, 'value_cap'); END IF;

  SELECT COUNT(*) INTO v_sup_hist FROM public.goods_received_notes WHERE supplier_id = v_grn.supplier_id
    AND status = 'confirmed' AND received_date > now() - INTERVAL '90 days' AND id <> p_grn_id;
  v_c6 := v_sup_hist >= 3;
  IF NOT v_c6 THEN v_reasons := array_append(v_reasons, 'supplier_history_lt3'); END IF;

  SELECT COUNT(*) INTO v_bad_review FROM public.grn_items gi WHERE gi.grn_id = p_grn_id
    AND public.inventory_requires_manual_review(gi.ingredient_id) = true;
  v_c7 := v_bad_review = 0;
  IF NOT v_c7 THEN v_reasons := array_append(v_reasons, 'ingredient_manual_review'); END IF;

  v_trust := public.compute_user_trust_score(v_grn.created_by, v_grn.branch_id);
  v_c8 := v_trust >= 70;
  IF NOT v_c8 THEN v_reasons := array_append(v_reasons, 'trust_score_lt70'); END IF;

  v_hard_ok := v_c1 AND v_c3 AND v_c4 AND v_c5 AND v_c7 AND v_c8;
  v_soft_ok := v_c2 AND v_c6;
  v_approved := v_hard_ok AND (v_soft_ok OR v_in_window);

  RETURN jsonb_build_object('grn_id', p_grn_id, 'approved', v_approved, 'hard_ok', v_hard_ok, 'soft_ok', v_soft_ok,
    'in_window', v_in_window, 'in_base_window', v_in_base, 'in_extended_window', v_in_ext,
    'total_grn_value', v_total_grn, 'total_po_value', v_total_po, 'supplier_grn_count_90d', v_sup_hist,
    'trust_score', v_trust,
    'conditions', jsonb_build_object('c1_has_po', v_c1, 'c2_variance_ok', v_c2, 'c3_line_totals_diff', v_c3,
      'c4_no_quality_issue', v_c4, 'c5_value_cap', v_c5, 'c6_supplier_history', v_c6,
      'c7_no_manual_review', v_c7, 'c8_trust_score_ok', v_c8),
    'failed_reasons', to_jsonb(v_reasons), 'evaluated_at', now());
END; $function$;

GRANT EXECUTE ON FUNCTION public.grn_is_auto_approvable(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.grn_is_auto_approvable(BIGINT) IS
  'Auto-approve evaluator. v_total_grn dùng net (received − rejected) × cost — parity với GL inventory_total và stock value. Line qty variance vẫn so sánh delivered vs ordered.';
