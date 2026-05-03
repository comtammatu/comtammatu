-- =========================================================================
-- B6 — Phiếu HỦY MÓN include `order_items.note`
--
-- Bối cảnh: khi waiter/cashier huỷ 1 món đã gửi bếp, hệ thống in PHIẾU HỦY
-- MÓN xuống kitchen_1 hoặc kitchen_2 báo bếp dừng nấu. Hiện tại payload có
-- item_name/variant/quantity/modifiers/sides/reason — KHÔNG có
-- `order_items.note` (ghi chú per-item như "ít muối", "không hành").
--
-- Vấn đề thực tế: bếp đã chuẩn bị món với note đặc biệt; khi huỷ, bếp xem
-- phiếu huỷ chỉ thấy "BÀN 5: Cơm tấm sườn" — không khớp với phiếu bếp gốc
-- "Cơm tấm sườn — ít muối". Bếp confused: huỷ phần nào nếu có 2 món cùng
-- tên với note khác nhau?
--
-- Đặc biệt nghiêm trọng cho dị ứng (regressions.md NO-CLAMP-ON-KITCHEN-NOTES,
-- 2026-04-27): note có thể chứa "không đậu phộng" — bếp PHẢI biết món nào để
-- dừng đúng + không tái sử dụng nguyên liệu sai.
--
-- Strategy: CREATE OR REPLACE cả 2 RPC (full cancel + partial cancel/giảm
-- SL), thêm 1 dòng `'note', v_item.note` vào jsonb_build_object items.
-- KHÔNG drop function, KHÔNG cần re-state GRANT/REVOKE/COMMENT (giữ nguyên).
-- KHÔNG backfill — jobs cũ đã in xong (terminal) hoặc pending (renderer
-- check `if (it.note)` undefined-safe).
--
-- Xem thêm: B6 4-agent debate findings.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enqueue_cancel_ticket_print(
  p_order_item_id BIGINT,
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
  v_category_id   BIGINT;
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

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_cancel_ticket_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT p.id, CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = 'cancel_ticket'
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  -- B6: Thêm `note` vào payload để bếp disambiguate khi có 2 món cùng tên
  -- với note khác nhau. Đặc biệt critical cho allergy notes — xem
  -- regressions.md NO-CLAMP-ON-KITCHEN-NOTES.
  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',    v_item.item_name,
    'variant_name', v_item.variant_name,
    'quantity',     v_item.quantity,
    'modifiers',    v_item.modifiers,
    'sides',        v_item.sides,
    'note',         v_item.note
  ));

  v_payload := jsonb_build_object(
    'kind',          'cancel_ticket',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        COALESCE(NULLIF(trim(p_reason), ''), v_item.cancel_reason, ''),
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':cancel:' || p_order_item_id::TEXT;

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
  v_category_id     BIGINT;
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

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT p.id, CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = 'cancel_ticket'
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  -- B6: parity với enqueue_cancel_ticket_print — note đính kèm để bếp biết
  -- bỏ phần nào khi có nhiều món cùng tên.
  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',     v_item.item_name,
    'variant_name',  v_item.variant_name,
    'quantity',      p_old_quantity - p_new_quantity,
    'modifiers',     v_item.modifiers,
    'sides',         v_item.sides,
    'note',          v_item.note
  ));

  v_reason_prefixed := 'GIAM SL ' || p_old_quantity::TEXT
    || ' -> ' || p_new_quantity::TEXT
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
