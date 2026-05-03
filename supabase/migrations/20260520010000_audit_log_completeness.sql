-- =============================================================
-- Audit log completeness + realtime publication cho lịch sử thao tác
--
-- Mục đích: cho luồng "quản lý nắm rõ ai làm gì với đơn", một số thao tác
-- POS hiện chưa ghi vào order_status_history nên timeline trên admin order
-- detail bị thiếu. Thay vì patch RPC từng cái, ta điểm danh và bổ sung
-- chính xác cái đang thiếu.
--
-- Soát từ migrations 20260405-20260518:
--   ✓ create_order, cancel_order, void_order_item, append_order_items,
--     apply_order_discount, clear_order_discount, split_order, merge_orders,
--     transfer_order_table, edit_pending_order_item, update_pos_order_status
--     ĐÃ ghi history.
--   ✗ mark_order_item_served (waiter đánh dấu một món đã phục vụ) — CHƯA ghi.
--     Đây là phần "ai phục vụ món nào" mà quản lý hỏi tới khi khách phản
--     ánh phục vụ tệ.
--
-- Note convention: 'mark_item_served <item_id>' — parser bên web sẽ map
-- thành "Phục vụ món". from_status = to_status = order.status (không
-- chuyển trạng thái đơn — chỉ là audit hành động item-level).
--
-- Realtime: để admin order detail cập nhật timeline ngay khi cashier ở
-- terminal khác hủy/sửa/phục vụ → ALTER PUBLICATION add order_status_history.
-- INSERT-only table → REPLICA IDENTITY DEFAULT đủ (không cần FULL).
-- =============================================================

-- ─── 1. Patch mark_order_item_served — thêm INSERT order_status_history ──

CREATE OR REPLACE FUNCTION public.mark_order_item_served(p_item_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_item RECORD;
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

  SELECT
    oi.id,
    oi.order_id,
    oi.tenant_id,
    oi.status        AS item_status,
    o.branch_id,
    o.status         AS order_status
  INTO v_item
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_item.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_item.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF v_item.item_status NOT IN ('pending', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'invalid item transition to served' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'served',
      updated_at = now()
  WHERE id = p_item_id;

  UPDATE public.kds_tickets
  SET status = 'served',
      bumped_at = COALESCE(bumped_at, now()),
      bumped_by = COALESCE(bumped_by, v_uid),
      updated_at = now()
  WHERE order_item_id = p_item_id
    AND tenant_id = v_item.tenant_id
    AND status <> 'cancelled';

  -- NEW: audit row. from_status = to_status = order.status (item-level
  -- action, không phải order-level state transition). Parser web map
  -- 'mark_item_served <id>' thành "Phục vụ món".
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_item.order_status, v_item.order_status,
    v_uid, 'mark_item_served ' || p_item_id::text
  );

  RETURN jsonb_build_object(
    'item_id',   p_item_id,
    'order_id',  v_item.order_id,
    'status',    'served'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_item_served(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_item_served(BIGINT) TO authenticated;


-- ─── 2. Realtime publication — order_status_history ────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_status_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
  END IF;
END $$;

COMMENT ON TABLE public.order_status_history IS
  'Audit trail cho mọi thao tác trên đơn (cancel, void item, discount, split, merge, transfer, edit, served). Append-only. Trong realtime publication để admin order detail cập nhật timeline live.';
