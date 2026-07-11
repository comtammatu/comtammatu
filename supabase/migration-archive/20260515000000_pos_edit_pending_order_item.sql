-- =========================================================================
-- POS: Sửa món đã gửi (edit_pending_order_item)
--
-- Owner decision (2026-05-01): cashier sai variant/topping/ghi-chú ngay sau
-- "Gửi đơn", chef chưa bắt đầu nấu. Hiện UI chỉ có "Hủy món" + "Thêm món" —
-- buộc cashier xoá 1 dòng + thêm dòng mới, sai audit (looks like 2 events
-- thay vì 1 sửa) và sai phiếu bếp (1 huỷ + 1 mới thay vì 1 cập nhật). Thêm
-- primitive thứ 4 (sau mark-served / reduce / void): sửa món tại chỗ khi
-- status='pending', recompute totals, bump kds_tickets.updated_at để KDS
-- card refetch payload mới.
--
-- Scope (giữ NHỎ — out của scope sẽ block):
--   - CHỈ sửa khi `order_item.status = 'pending'`. Khi chef đã chuyển sang
--     'preparing'/'ready' → chef đã quyết định nguyên liệu/quy trình; đổi
--     variant/topping = phí thực phẩm. Cashier vẫn dùng "Hủy món + Thêm món".
--   - KHÔNG đổi `menu_item_id`. Đổi món hoàn toàn = huỷ + thêm món khác (audit
--     khác hẳn). Variant/modifiers/sides/note/quantity/unit_price là tất cả
--     những gì user mong đổi qua "Sửa".
--   - KHÔNG re-fetch giá từ menu — `unit_price` do client compute (mirror
--     create_order/append_order_items để giá đã thoả thuận khách lock-in).
--     Server vẫn validate `unit_price >= 0` và menu_item is_active.
--   - KHÔNG enqueue phiếu in "thay đổi" — sent_to_kitchen_at có thể đã NOT
--     NULL (auto-print chạy ngay sau create_order). KDS screen là source of
--     truth; chef đọc KDS card mới qua kds_tickets bump. Phiếu giấy đã in =
--     stale paper, future enhancement có thể auto-cancel + reprint.
--
-- Constraints theo `tasks/regressions.md`:
--   - POS-DISCOUNT-RECOMPUTE-VIA-HELPER: BẮT BUỘC gọi compute_discount_amount
--     khi subtotal đổi (đặc biệt vnd-discount auto-clamp về subtotal mới).
--   - REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL: order_items KHÔNG nằm trong
--     supabase_realtime publication — KDS bridge qua kds_tickets. Phải bump
--     kds_tickets.updated_at để KDS card refetch payload mới.
-- =========================================================================

-- ─── 1. Feature flag (per-tenant kill switch) ────────────────────────────

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, 'pos_edit_pending_enabled', 'true',
       'Feature flag: cho phép sửa món đã gửi khi status=pending (POS). Set ''false'' để kill switch.'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE tenant_id = t.id AND key = 'pos_edit_pending_enabled'
);

-- ─── 2. edit_pending_order_item RPC ──────────────────────────────────────

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

  -- Reuse pos:void_order permission (same risk profile: chỉnh dòng đã in
  -- bếp). Adding pos:edit_order_item key sẽ rebump role-permission seed
  -- chỉ để có 1 permission khác biệt — không đáng. Voiders đã được trust.
  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Feature flag — kill switch riêng.
  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_edit_pending_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = '22023';
  END IF;

  -- Status guard: chỉ sửa khi pending. preparing/ready/served/cancelled =
  -- chef đã quyết định nguyên liệu hoặc khách đã ăn — đổi = phí thực phẩm.
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'item not editable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  -- Anti-edit-after-disable: menu_item phải còn active. Cho phép giữ
  -- menu_item_id cũ (không cho swap) — nên check chỉ là bool.
  SELECT is_active INTO v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;

  -- Variant validity: nếu p_variant_id IS NOT NULL, phải thuộc menu_item
  -- và còn active. NULL = no-variant order (món không có biến thể).
  IF p_variant_id IS NOT NULL THEN
    PERFORM 1
    FROM public.menu_item_variants
    WHERE id = p_variant_id
      AND menu_item_id = v_item.menu_item_id
      AND tenant_id = v_order.tenant_id
      AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'variant inactive' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_old_qty := v_item.quantity;
  v_old_unit := v_item.unit_price;
  v_new_subtotal := p_unit_price * p_quantity;

  UPDATE public.order_items
  SET variant_id   = p_variant_id,
      variant_name = NULLIF(p_variant_name, ''),
      unit_price   = p_unit_price,
      modifiers    = COALESCE(p_modifiers, '[]'::JSONB),
      sides        = COALESCE(p_sides, '[]'::JSONB),
      note         = NULLIF(trim(COALESCE(p_note, '')), ''),
      quantity     = p_quantity,
      subtotal     = v_new_subtotal,
      updated_at   = now()
  WHERE id = p_order_item_id;

  -- KDS realtime sync: chef đọc kds_tickets qua join với order_items, nên
  -- bump updated_at để client refetch. Nếu kitchen ticket chưa enqueue
  -- (sent_to_kitchen_at IS NULL) thì kds_tickets có thể chưa tồn tại — UPDATE
  -- 0 rows là bình thường, auto-print sau sẽ tạo ticket với payload mới.
  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  -- Recompute order totals — only non-cancelled items contribute.
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
      || ', unit ' || v_old_unit::text || '->' || p_unit_price::text
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

REVOKE ALL ON FUNCTION public.edit_pending_order_item(BIGINT, BIGINT, TEXT, NUMERIC, JSONB, JSONB, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_pending_order_item(BIGINT, BIGINT, TEXT, NUMERIC, JSONB, JSONB, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.edit_pending_order_item(BIGINT, BIGINT, TEXT, NUMERIC, JSONB, JSONB, TEXT, INT) IS
  'Sửa món đã gửi khi status=pending (chef chưa bắt đầu nấu). Update variant/modifiers/sides/note/quantity/unit_price '
  'tại chỗ; menu_item_id KHÔNG đổi (dùng huỷ+thêm cho đổi món hoàn toàn). Lock order + item, permission pos:void_order. '
  'Recompute subtotal/discount/total qua compute_discount_amount, bump kds_tickets.updated_at để KDS realtime sync. '
  'Block khi status<>pending, order completed/cancelled, payment_status=paid, menu_item inactive, variant inactive, '
  'feature flag pos_edit_pending_enabled=false. Phiếu bếp giấy đã in có thể stale — KDS card là source of truth.';
