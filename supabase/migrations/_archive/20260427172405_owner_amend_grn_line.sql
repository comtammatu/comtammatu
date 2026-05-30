-- =============================================================
-- Owner direct-amend GRN line (post-confirm)
--
-- Decision (4-agent debate 2026-04-28):
--   Cho phép Owner sửa qty/unit_cost trên dòng GRN đã confirmed mà KHÔNG
--   cần dùng amendment-document. Side-effects được xử lý atomically:
--     • Compensating stock_movement (type='grn_amend', delta_qty)
--     • stock_levels.current_quantity += delta_qty
--     • grn_items.received_quantity / unit_cost / total_cost cập nhật
--     • PO status re-evaluate (received vs partially_received)
--     • Trigger 3-way matching cho mọi invoice link
--
-- WAC drift accepted in pilot: avg_unit_cost KHÔNG replay full history.
-- Hard-blocks (raise exception):
--   • GRN không phải status='confirmed'  → dùng upsertGrnLine cho draft
--   • stock_levels.current_quantity + delta_qty < 0  (negative stock)
--   • Có supplier_return active link tới line này
--   • Có supplier_invoice link tới GRN với payment_status != 'unpaid'
--   • Lý do (p_reason) < 5 ký tự (audit trail)
--
-- Permission: procurement:grn_amend (owner/super_manager only).
-- =============================================================

-- 1. Catalog: thêm permission key
INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('procurement:grn_amend', 'inventory_procurement',
   'Sửa trực tiếp dòng phiếu nhập đã chốt (Owner force-edit)', 'tenant')
ON CONFLICT (key) DO NOTHING;

-- 2. role_templates: cấp cho owner + super_manager (NOT cấp cho warehouse/production manager)
UPDATE public.role_templates
   SET permission_keys = ARRAY(SELECT DISTINCT UNNEST(permission_keys || ARRAY['procurement:grn_amend']))
 WHERE position_code IN ('owner', 'super_manager')
   AND NOT ('procurement:grn_amend' = ANY(permission_keys));

-- 3. Backfill staff_permissions từ template
SELECT public.sync_missing_permissions_from_template();

-- 4. Mở rộng stock_movements.type CHECK để chấp nhận 'grn_amend'
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (
    type IN (
      'adjustment',
      'count_adjustment',
      'consumption',
      'grn_receipt',
      'grn_amend',
      'transfer_out',
      'transfer_in',
      'production_consumption',
      'production_output',
      'supplier_return'
    )
  );

-- 5. RPC amend_grn_line — atomic owner force-edit cho dòng GRN đã chốt
CREATE OR REPLACE FUNCTION public.amend_grn_line(
  p_grn_id              BIGINT,
  p_line_id             BIGINT,
  p_received_quantity   NUMERIC,
  p_unit_cost           NUMERIC,
  p_reason              TEXT
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
  v_old_cost        NUMERIC(15,2);
  v_new_qty         NUMERIC(15,3) := p_received_quantity;
  v_new_cost        NUMERIC(15,2) := p_unit_cost;
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
  v_old_cost := v_line.unit_cost;

  -- Hard-block: linked supplier_return active for this line
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

  v_delta_qty := v_new_qty - v_old_qty;
  v_delta_value := (v_new_qty * v_new_cost) - (v_old_qty * v_old_cost);

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

  -- Default-receive location for the compensating movement (matches confirm_grn)
  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  -- Insert compensating stock_movement (delta only; can be negative)
  IF v_delta_qty <> 0 THEN
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_line.ingredient_id, 'grn_amend',
      v_delta_qty,
      'GRN ' || v_grn.grn_number || ' amend (line ' || p_line_id || '): '
        || v_old_qty || ' → ' || v_new_qty || ' @ ' || v_old_cost || ' → ' || v_new_cost
        || ' — ' || trim(p_reason),
      v_uid, p_grn_id, v_new_cost, v_location_id
    );
  END IF;

  -- Update stock_levels.current_quantity (WAC drift accepted in pilot)
  IF v_delta_qty <> 0 THEN
    UPDATE public.stock_levels
    SET current_quantity = current_quantity + v_delta_qty,
        updated_at = now()
    WHERE tenant_id = v_tenant
      AND branch_id = v_grn.branch_id
      AND ingredient_id = v_line.ingredient_id;

    -- If stock_levels row didn't exist (rare: zero stock), seed one.
    IF NOT FOUND THEN
      INSERT INTO public.stock_levels (
        tenant_id, branch_id, ingredient_id, current_quantity, avg_unit_cost
      ) VALUES (
        v_tenant, v_grn.branch_id, v_line.ingredient_id, v_delta_qty, v_new_cost
      );
    END IF;
  END IF;

  -- Update grn_items
  UPDATE public.grn_items
  SET received_quantity = v_new_qty,
      unit_cost = v_new_cost,
      total_cost = ROUND(v_new_qty * v_new_cost, 2)
  WHERE id = p_line_id AND tenant_id = v_tenant;

  -- Re-evaluate PO status if linked
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
      SELECT gi.ingredient_id, SUM(gi.received_quantity)::NUMERIC(15,3) AS qty
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
    'new_qty',     v_new_qty,
    'old_cost',    v_old_cost,
    'new_cost',    v_new_cost,
    'delta_qty',   v_delta_qty,
    'delta_value', v_delta_value,
    'po_id',       v_grn.po_id,
    'po_status',   v_po_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.amend_grn_line(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amend_grn_line(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION public.amend_grn_line(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT) IS
  'Owner-only post-confirm GRN line amendment. Inserts compensating stock_movement (grn_amend), updates stock_levels.current_quantity and grn_items, re-evaluates PO status, and triggers invoice rematching. Hard-blocks: linked supplier_return active, linked invoice not unpaid, negative stock, status != confirmed. WAC drift accepted in pilot — avg_unit_cost not replayed. Permission gate via has_permission(branch_id, ''procurement:grn_amend'').';
