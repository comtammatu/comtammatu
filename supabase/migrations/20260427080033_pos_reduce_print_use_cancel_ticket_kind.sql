-- =========================================================================
-- HOTFIX: enqueue_partial_cancel_ticket_print payload kind
--
-- Bug: bản đầu (migration 20260427074752_pos_reduce_order_item_qty.sql) set
-- payload.kind='partial_cancel' nhưng print-agent (apps/print-agent/src/
-- escpos.ts:898-910) chỉ switch 5 kind đã biết:
--   kitchen_ticket | provisional_bill | receipt | cancel_ticket | shift_close_report
-- 'partial_cancel' không match → renderPayload trả undefined → agent crash.
-- Phiếu giảm SL không in ra được trong production.
--
-- Fix: reuse kind='cancel_ticket' (template HUỶ MÓN có sẵn ở print-agent),
-- prefix reason "GIẢM SL N → M: <reason>" để chef phân biệt với phiếu
-- huỷ-toàn-phần (huỷ-toàn-phần render quantity=qty đầy đủ + reason không
-- có prefix). Item quantity vẫn = số phần BỊ GIẢM (delta) nên chef đọc
-- nhanh "huỷ X phần" + dòng LÝ DO to+đậm giải thích "GIẢM SL từ N xuống M".
--
-- Render preview (template `renderCancelTicket` ở print-agent escpos.ts:673):
--   ┌─────────────────────────┐
--   │  ===================   │
--   │      HUỶ MÓN            │ ← banner inverse-video, chef thấy ngay
--   │  ===================   │
--   │  BÀN 5 · 1-260427-012   │
--   │  ===================   │
--   │  Bếp: 1   Giờ: 18:30    │
--   │  Người huỷ: Nga         │
--   │  ─────────────────       │
--   │   SL | MÓN              │
--   │  ─────────────────       │
--   │    1 | Cơm sườn cốt lết │ ← SL=1 = số phần BỊ GIẢM (delta)
--   │  ─────────────────       │
--   │  ===================   │
--   │       LÝ DO              │ ← to + đậm
--   │  GIẢM SL 2 → 1: khách    │ ← prefix giúp chef phân biệt
--   │  đổi ý                   │
--   │  ===================   │
--   └─────────────────────────┘
--
-- Out-of-scope: thêm kind='partial_cancel' vào print-agent + rebuild +
-- redeploy agent ở các chi nhánh. Khi nào print-agent hỗ trợ kind mới
-- (banner "GIẢM SỐ LƯỢNG" thay vì "HUỶ MÓN", thêm dòng "Còn lại: M phần"),
-- tách lại payload.kind.
-- =========================================================================

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
  v_uid             UUID;
  v_item            public.order_items%ROWTYPE;
  v_order           public.orders%ROWTYPE;
  v_table_no        INT;
  v_slot            SMALLINT;
  v_printer_id      BIGINT;
  v_voided_by       TEXT;
  v_flag_enabled    TEXT;
  v_items_payload   JSONB;
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
  v_reason_prefixed TEXT;
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

  -- items[].quantity = số phần BỊ GIẢM (delta). Bỏ from_quantity/to_quantity
  -- ra khỏi payload — template HUỶ MÓN không render mấy field đó, giữ payload
  -- gọn để khớp schema CancelTicketPayload ở print-agent.
  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',     v_item.item_name,
    'variant_name',  v_item.variant_name,
    'quantity',      p_old_quantity - p_new_quantity,
    'modifiers',     v_item.modifiers,
    'sides',         v_item.sides
  ));

  -- Reason prefix giúp chef phân biệt với phiếu huỷ-hết. Dòng LÝ DO render
  -- to+đậm trong template HUỶ MÓN (escpos.ts:748-758) → prefix sẽ rất nổi bật.
  v_reason_prefixed := 'GIẢM SL ' || p_old_quantity::TEXT
    || ' → ' || p_new_quantity::TEXT
    || ': ' || COALESCE(NULLIF(trim(p_reason), ''), '');

  v_payload := jsonb_build_object(
    'kind',          'cancel_ticket',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        v_reason_prefixed,
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':reduce:' || p_order_item_id::TEXT
    || ':' || p_old_quantity::TEXT || '->' || p_new_quantity::TEXT;

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
  'Enqueue PHIẾU GIẢM SL — payload.kind=cancel_ticket (reuse template HUỶ MÓN ở print-agent), '
  'items[].quantity=delta (số phần bị giảm), reason prefix "GIẢM SL N → M:" để chef phân biệt '
  'với phiếu huỷ-toàn-phần. Skip silently khi feature flag off, item chưa gửi bếp, không có '
  'slot/printer. Idempotency key bao gồm old_qty+new_qty cho phép giảm nhiều lần (5→3 rồi 3→1) '
  'mà vẫn dedup double-submit cùng delta.';
