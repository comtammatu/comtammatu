-- =========================================================================
-- POS: Fix edit_pending_order_item — recompute pricing server-side
--
-- Bug (reported 2026-05-02): user sửa "Sườn cốt lết" 35.000 + thêm topping
-- "Bì" → UI customizer hiện 42.000, nhưng sau Cập nhật giá lưu vẫn 35.000;
-- bill tạm tính + thanh toán đều hiển thị 35.000.
--
-- Root cause: 20260515000000_pos_edit_pending_order_item.sql tin tưởng
-- `p_unit_price` từ client làm full per-unit price → `v_new_subtotal :=
-- p_unit_price * p_quantity` BỎ QUA modifier/side prices. Nhưng client
-- (cart) gửi `unit_price` = base + variant ONLY (xem `calcItemSubtotal` ở
-- types.ts: `(unit_price + modifierTotal + sidesTotal) * quantity`).
--
-- DB convention được set bởi `create_order`/`append_order_items`:
--   `order_items.unit_price` = base_price + variant_adj + modifier_sum + sides_sum
--   `order_items.subtotal`   = unit_price * quantity
-- (xem 20260423200000_pos_order_sides_pricing.sql:248-249 và
-- 20260429000000_append_order_items_idempotency.sql:220-221).
--
-- Fix: mirror append_order_items — server fetch giá từ menu_items /
-- menu_item_variants / menu_item_modifiers, dùng pos_enrich_order_sides
-- cho sides. `p_unit_price` parameter bị BỎ QUA cho tính toán (giữ trong
-- signature để tránh breaking change cho server action; comment giải
-- thích). Validation `p_unit_price >= 0` vẫn còn để chặn payload xấu.
--
-- Side effect alignment:
--   - `order_items.modifiers` JSONB ghi RAW từ client (mirror create_order
--     line 261) — chỉ giá được tính từ menu, tên/id giữ nguyên client gửi.
--   - `order_items.sides` JSONB ghi ENRICHED từ pos_enrich_order_sides
--     (mirror append_order_items line 239) — server replace với canonical
--     name + price từ menu.
--   - Discount recompute via compute_discount_amount đã đúng — không đổi.
--   - kds_tickets.updated_at bump đã đúng — không đổi.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.edit_pending_order_item(
  p_order_item_id BIGINT,
  p_variant_id    BIGINT,
  p_variant_name  TEXT,
  p_unit_price    NUMERIC(15,2),
  p_modifiers     JSONB,
  p_sides         JSONB,
  p_note          TEXT,
  p_quantity      INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID;
  v_prof_tenant   BIGINT;
  v_prof_branch   BIGINT;
  v_prof_role     TEXT;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_menu_active   BOOLEAN;
  v_base_price    NUMERIC(15,2);
  v_variant_adj   NUMERIC(15,2) := 0;
  v_modifier_sum  NUMERIC(15,2) := 0;
  v_sides_sum     NUMERIC(15,2) := 0;
  v_enriched_sides JSONB := '[]'::JSONB;
  v_new_unit      NUMERIC(15,2);
  v_old_qty       INT;
  v_old_unit      NUMERIC(15,2);
  v_new_subtotal  NUMERIC(15,2);
  v_subtotal_sum  NUMERIC(15,2);
  v_disc_amount   NUMERIC(15,2);
  v_total_amount  NUMERIC(15,2);
  v_flag_enabled  TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  -- p_unit_price chỉ validate >= 0 để chặn payload xấu; KHÔNG dùng cho
  -- tính subtotal (server recompute từ menu data).
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'unit_price must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_edit_pending_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = '22023';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'item not editable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  -- Server-authoritative pricing: fetch base_price từ menu_items (mirror
  -- append_order_items line 181-186). Cũng kiểm tra is_active trong cùng
  -- query để tiết kiệm round-trip.
  SELECT base_price, is_active
  INTO v_base_price, v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;

  -- Variant validity + price_adjustment (mirror append_order_items 188-196).
  IF p_variant_id IS NOT NULL THEN
    SELECT price_adjustment INTO v_variant_adj
    FROM public.menu_item_variants
    WHERE id = p_variant_id
      AND menu_item_id = v_item.menu_item_id
      AND tenant_id = v_order.tenant_id
      AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'variant inactive' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_variant_adj := 0;
  END IF;

  -- Modifier sum từ menu (mirror append_order_items 198-210). JOIN tự
  -- skip modifier_id không tồn tại / inactive — nhất quán với create flow.
  IF p_modifiers IS NOT NULL
     AND jsonb_typeof(p_modifiers) = 'array'
     AND jsonb_array_length(p_modifiers) > 0
  THEN
    SELECT COALESCE(SUM(m.price), 0) INTO v_modifier_sum
    FROM jsonb_array_elements(p_modifiers) AS mod_el
    JOIN public.menu_item_modifiers m
      ON m.id = (mod_el ->> 'modifier_id')::BIGINT
     AND m.item_id = v_item.menu_item_id
     AND m.tenant_id = v_order.tenant_id
     AND m.is_active = true;
  END IF;

  -- Sides via shared helper (mirror append_order_items 212-218).
  SELECT sides_sum, enriched_sides
  INTO v_sides_sum, v_enriched_sides
  FROM public.pos_enrich_order_sides(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_sides, '[]'::JSONB)
  );

  v_new_unit := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);

  v_old_qty := v_item.quantity;
  v_old_unit := v_item.unit_price;
  v_new_subtotal := v_new_unit * p_quantity;

  UPDATE public.order_items
  SET variant_id   = p_variant_id,
      variant_name = NULLIF(p_variant_name, ''),
      unit_price   = v_new_unit,
      modifiers    = COALESCE(p_modifiers, '[]'::JSONB),
      sides        = COALESCE(v_enriched_sides, '[]'::JSONB),
      note         = NULLIF(trim(COALESCE(p_note, '')), ''),
      quantity     = p_quantity,
      subtotal     = v_new_subtotal,
      updated_at   = now()
  WHERE id = p_order_item_id;

  -- KDS realtime sync (mirror reduce_order_item_quantity, void_order_item).
  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  -- POS-DISCOUNT-RECOMPUTE-VIA-HELPER.
  v_disc_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal_sum
  );
  v_total_amount := v_subtotal_sum
    + COALESCE(v_order.service_charge, 0)
    - v_disc_amount;

  UPDATE public.orders
  SET subtotal        = v_subtotal_sum,
      discount_amount = v_disc_amount,
      total_amount    = v_total_amount,
      updated_at      = now()
  WHERE id = v_item.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
    'edit_item ' || p_order_item_id::text
      || ': qty ' || v_old_qty::text || '->' || p_quantity::text
      || ', unit ' || v_old_unit::text || '->' || v_new_unit::text
  );

  RETURN jsonb_build_object(
    'order_id',           v_item.order_id,
    'order_item_id',      p_order_item_id,
    'old_quantity',       v_old_qty,
    'new_quantity',       p_quantity,
    'subtotal',           v_subtotal_sum,
    'discount_amount',    v_disc_amount,
    'total_amount',       v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION public.edit_pending_order_item(BIGINT, BIGINT, TEXT, NUMERIC, JSONB, JSONB, TEXT, INT) IS
  'Sửa món đã gửi khi status=pending (chef chưa bắt đầu nấu). Server recompute '
  'unit_price/subtotal từ menu (base + variant_adj + modifier_sum + sides_sum) '
  '— BỎ QUA p_unit_price từ client (giữ trong signature cho compat). Mirror '
  'create_order/append_order_items convention. Sides JSONB được enrich qua '
  'pos_enrich_order_sides. Lock order + item, gate qua pos:void_order. '
  'Recompute discount qua compute_discount_amount, bump kds_tickets.updated_at. '
  'Block khi status<>pending, order completed/cancelled, payment_status=paid, '
  'menu_item inactive, variant inactive, feature flag pos_edit_pending_enabled=false.';
