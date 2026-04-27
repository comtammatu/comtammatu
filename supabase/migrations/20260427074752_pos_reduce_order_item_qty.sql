-- =========================================================================
-- POS: Giảm số lượng món đã gửi (reduce_order_item_quantity)
--
-- Owner decision (2026-04-27): khách order N phần rồi đổi ý còn M (M<N, M≥1).
-- Hiện UI chỉ có "Hủy món" (xoá cả dòng) — buộc cashier xoá rồi thêm lại,
-- sai audit trail và sai phiếu bếp. Thêm primitive thứ 3 vào sheet thao
-- tác món: giảm số lượng giữ nguyên dòng, recompute totals, in phiếu báo
-- bếp giảm SL nếu món đã gửi bếp.
--
-- Out-of-scope:
--   - Tăng SL: dùng "Thêm món" để tách kitchen ticket riêng (đúng audit).
--   - Giảm về 0: dùng "Hủy món" để KDS card flip cancelled.
--   - Waste cost cho phần đã nấu: order_status_history audit là đủ v1;
--     nhà hàng tự gánh, không tính khách (sẽ tách report sau nếu cần).
--
-- Constraints theo `tasks/regressions.md`:
--   - POS-DISCOUNT-RECOMPUTE-VIA-HELPER: BẮT BUỘC gọi compute_discount_amount
--     khi subtotal đổi (đặc biệt vnd-discount auto-clamp về subtotal mới).
--   - REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL: order_items KHÔNG nằm trong
--     supabase_realtime publication (theo thiết kế 20260428000000) — KDS
--     bridge qua kds_tickets. Phải bump kds_tickets.updated_at để KDS card
--     refetch SL mới (otherwise chef thấy stale qty).
-- =========================================================================

-- ─── 1. Feature flag (per-tenant kill switch) ────────────────────────────

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, 'pos_reduce_qty_enabled', 'true',
       'Feature flag: cho phép giảm số lượng món đã gửi (POS). Set ''false'' để kill switch.'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE tenant_id = t.id AND key = 'pos_reduce_qty_enabled'
);

-- ─── 2. reduce_order_item_quantity RPC ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.reduce_order_item_quantity(
  p_order_item_id BIGINT,
  p_new_quantity  INT,
  p_reason        TEXT
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
  v_old_qty       INT;
  v_new_subtotal  NUMERIC(15,2);
  v_subtotal_sum  NUMERIC(15,2);
  v_disc_amount   NUMERIC(15,2);
  v_total_amount  NUMERIC(15,2);
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

  -- reason min 5 ký tự (mirror voidItemSchema để consistency UX)
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity < 1 THEN
    RAISE EXCEPTION 'new quantity must be >= 1' USING ERRCODE = '22023';
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

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not reducible' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  v_old_qty := v_item.quantity;

  IF p_new_quantity >= v_old_qty THEN
    RAISE EXCEPTION 'no reduction needed' USING ERRCODE = '22023';
  END IF;

  -- subtotal = unit_price * new_qty. unit_price đã include modifier price
  -- tại order time (xem create_order/append_order_items) — không re-fetch
  -- menu để lock-in giá đã thoả thuận với khách.
  v_new_subtotal := v_item.unit_price * p_new_quantity;

  UPDATE public.order_items
  SET quantity   = p_new_quantity,
      subtotal   = v_new_subtotal,
      updated_at = now()
  WHERE id = p_order_item_id;

  -- KDS realtime sync: order_items KHÔNG trong publication; KDS card render
  -- qty trực tiếp từ order_items qua join, nên cần bump kds_tickets.updated_at
  -- để client refetch (rule REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL +
  -- design note 20260428000000_pos_realtime_publication.sql).
  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  -- Recompute order subtotal — only non-cancelled items contribute.
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  -- POS-DISCOUNT-RECOMPUTE-VIA-HELPER: pct re-applies trên subtotal mới,
  -- vnd auto-clamp về subtotal nên total_amount không bao giờ âm.
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
    'reduce_item ' || p_order_item_id::text
      || ': ' || v_old_qty::text || '->' || p_new_quantity::text
      || ': ' || p_reason
  );

  RETURN jsonb_build_object(
    'order_id',           v_item.order_id,
    'order_item_id',      p_order_item_id,
    'old_quantity',       v_old_qty,
    'new_quantity',       p_new_quantity,
    'qty_reduced',        v_old_qty - p_new_quantity,
    'subtotal',           v_subtotal_sum,
    'discount_amount',    v_disc_amount,
    'total_amount',       v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reduce_order_item_quantity(BIGINT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reduce_order_item_quantity(BIGINT, INT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reduce_order_item_quantity(BIGINT, INT, TEXT) IS
  'Giảm SL món đã gửi (qty: từ N xuống M, M<N, M>=1). Lock order + item, '
  'permission pos:void_order, recompute subtotal/discount/total qua compute_discount_amount, '
  'bump kds_tickets.updated_at để KDS realtime sync. Reason >=5 ký tự, ghi order_status_history. '
  'Block khi item served/cancelled, order completed/cancelled, hoặc payment_status=paid.';

-- ─── 3. enqueue_partial_cancel_ticket_print ──────────────────────────────
-- Phiếu báo bếp "Giảm SL" — payload kind='partial_cancel' để chef phân
-- biệt với phiếu huỷ-hết. Idempotency key gắn old_qty + new_qty để cho
-- phép reduce nhiều lần (5→3 rồi 3→1) mà vẫn dedup double-submit cùng delta.
-- Skip silently khi feature flag off, item chưa gửi bếp, không có slot/printer.

CREATE OR REPLACE FUNCTION public.enqueue_partial_cancel_ticket_print(
  p_order_item_id BIGINT,
  p_old_quantity  INT,
  p_new_quantity  INT,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_table_no      INT;
  v_slot          SMALLINT;
  v_printer_id    BIGINT;
  v_voided_by     TEXT;
  v_flag_enabled  TEXT;
  v_items_payload JSONB;
  v_payload       JSONB;
  v_idempotency   TEXT;
  v_job_id        BIGINT;
  v_now           TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  -- Feature flag — kill switch riêng (không reuse pos_cancel_ticket_enabled
  -- để admin có thể tắt riêng flow này nếu chef phản đối).
  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_reduce_qty_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  IF p_new_quantity >= p_old_quantity THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_reduction');
  END IF;

  SELECT mc.kitchen_printer INTO v_slot
  FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id = mi.category_id
  WHERE mi.id = v_item.menu_item_id;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT id INTO v_printer_id
  FROM public.printers
  WHERE branch_id = v_order.branch_id
    AND tenant_id = v_order.tenant_id
    AND role = 'kitchen_' || v_slot::TEXT
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  -- items[].quantity = số phần BỊ GIẢM (delta) để chef đọc nhanh "huỷ X
  -- phần". from_quantity / to_quantity giữ context đầy đủ trên payload cho
  -- printer template phiên bản kế tiếp.
  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',     v_item.item_name,
    'variant_name',  v_item.variant_name,
    'quantity',      p_old_quantity - p_new_quantity,
    'from_quantity', p_old_quantity,
    'to_quantity',   p_new_quantity,
    'modifiers',     v_item.modifiers,
    'sides',         v_item.sides
  ));

  v_payload := jsonb_build_object(
    'kind',          'partial_cancel',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        COALESCE(NULLIF(trim(p_reason), ''), ''),
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':reduce:' || p_order_item_id::TEXT
    || ':' || p_old_quantity::TEXT || '->' || p_new_quantity::TEXT;

  -- job_type='cancel_ticket' để print agent xử lý chung pipeline; chef
  -- phân biệt qua payload.kind='partial_cancel'. Nếu sau này muốn template
  -- khác hẳn, đổi job_type='partial_cancel_ticket' + thêm CHECK constraint.
  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'cancel_ticket',
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_partial_cancel_ticket_print(BIGINT, INT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_partial_cancel_ticket_print(BIGINT, INT, INT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.enqueue_partial_cancel_ticket_print(BIGINT, INT, INT, TEXT) IS
  'Enqueue PHIẾU BÁO GIẢM SL — payload.kind=partial_cancel, items[].quantity=delta, '
  'from_quantity/to_quantity giữ context đầy đủ. Skip silently khi feature flag off, '
  'item chưa gửi bếp, không có slot/printer. Idempotency key bao gồm old_qty+new_qty '
  'cho phép reduce nhiều lần (5→3→2) mà vẫn dedup double-submit cùng delta. '
  'Gọi bởi reduceOrderItemQuantity Server Action sau khi reduce_order_item_quantity commit.';
