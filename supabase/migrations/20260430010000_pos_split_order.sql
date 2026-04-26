-- =========================================================================
-- POS tách hoá đơn — split-by-items (PR-2 / 3)
--
-- Cashier picks 1+ items off an OPEN order; we move them onto a fresh order
-- on the SAME table. Both orders end the operation unpaid + active. Sản phẩm
-- vật lý không di chuyển (món đã ở bếp/bàn) — chỉ refactor "ai trả cho
-- cái gì". Phổ biến nhất: nhóm khách trả riêng từng người.
--
-- Design decisions (4-agent debate, owner-approved 2026-04-26):
--   - Q2 BLOCK split khi đơn gốc chỉ còn 1 món (would empty source). Owner
--     chốt "block" thay vì "auto-cancel" — tách-rồi-cancel không phải mục
--     đích của Tách; cashier nên dùng "Hủy đơn" hoặc "Chuyển bàn".
--   - Items move via UPDATE order_items.order_id IN PLACE (item.id giữ
--     nguyên). Tránh delete+insert: kích hoạt cancel-ticket print + tạo
--     phiếu bếp mới = chef confused, double cooking.
--   - kds_tickets di chuyển theo items để KDS card xuất hiện đúng đơn mới
--     (chef bump → trigger sync_order_item_status_from_kds vẫn link đúng).
--   - Discount KHÔNG cascade sang đơn mới — đơn mới luôn bắt đầu zero
--     discount. Đơn gốc giữ discount của nó (vẫn áp trên subtotal mới);
--     re-derive qua compute_discount_amount giúp pct tự co còn vnd tự clamp.
--   - pos_session_id của đơn mới = pos_session_id của đơn gốc. Đơn nguồn
--     ca chiều mở chưa thanh toán, ca tối tách → đơn mới vẫn thuộc ca
--     chiều (matches "doanh thu thuộc ca mở đơn"). Owner có thể move sau
--     bằng tool report nếu cần.
--   - Idempotency key (UUID): cashier double-tap "Tách" trên mạng yếu →
--     replay returns same new_order_id thay vì tạo 2 đơn duplicate.
--
-- Files in this migration:
--   - orders: ADD COLUMN split_from_order_id (lineage cho receipt + reports)
--   - NEW   split_order(source, item_ids[], idempotency_key) -> JSONB
--   - NEW   feature flag pos_split_merge_enabled (default true cho dev,
--           owner sẽ flip sang false trên prod theo nhu cầu pilot)
-- =========================================================================

-- ─── 1. Schema ──────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS split_from_order_id BIGINT
    REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_split_from
  ON public.orders(split_from_order_id)
  WHERE split_from_order_id IS NOT NULL;

COMMENT ON COLUMN public.orders.split_from_order_id IS
  'Đơn nguồn nếu đơn này được tách ra qua split_order. NULL nếu tạo trực tiếp.';


-- ─── 2. Feature flag ────────────────────────────────────────────────────

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, 'pos_split_merge_enabled', 'true',
       'Feature flag: bật tách/gộp hoá đơn trong POS. Set ''false'' để kill switch.'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE tenant_id = t.id AND key = 'pos_split_merge_enabled'
);


-- ─── 3. RPC split_order ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.split_order(
  p_source_order_id BIGINT,
  p_item_ids        BIGINT[],
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_active_total         INT;
  v_movable_count        INT;
  v_remaining_count      INT;
  v_new_order_id         BIGINT;
  v_new_order_number     TEXT;
  v_seq                  INT;
  v_date_part            TEXT;
  v_flag_enabled         TEXT;
  v_existing_id          BIGINT;
  v_existing_number      TEXT;
  v_source_subtotal      NUMERIC(15,2);
  v_source_discount      NUMERIC(15,2);
  v_source_total         NUMERIC(15,2);
  v_new_subtotal         NUMERIC(15,2);
  v_new_total            NUMERIC(15,2);
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

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'split_no_items' USING ERRCODE = '22023';
  END IF;

  -- Idempotency short-circuit. Done BEFORE lock so a replay with the same
  -- key on the same source returns the previously-minted new order without
  -- contending for the advisory lock again.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_existing_id, v_existing_number
    FROM public.orders o
    WHERE o.split_from_order_id = p_source_order_id
      AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'new_order_id',     v_existing_id,
        'new_order_number', v_existing_number,
        'idempotent',       true
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(p_source_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
         o.payment_status, o.pos_session_id, o.service_charge,
         o.discount_type, o.discount_value
  INTO v_source
  FROM public.orders o
  WHERE o.id = p_source_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- Branch scope (SECURITY DEFINER bypasses RLS — manual check).
  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  -- Feature flag check (after auth so disabled UI still says "no permission"
  -- rather than expose flag).
  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  -- State guard. Source must be active + unpaid + not the result of a merge
  -- still in flight.
  IF v_source.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'split_source_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'split_source_paid' USING ERRCODE = '22023';
  END IF;

  -- Active payments row (pending VietQR/cash) → block. Cashier must cancel
  -- the QR first to avoid double-charge.
  PERFORM 1 FROM public.payments
  WHERE order_id = p_source_order_id AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'split_payment_pending' USING ERRCODE = '22023';
  END IF;

  -- Validate every item_id belongs to the source AND is not cancelled.
  -- The count check covers both "item not in this order" and "item is
  -- cancelled" with one query — failing count means at least one was
  -- ineligible (no need to enumerate which one for UX; the picker should
  -- never even surface those items).
  SELECT COUNT(*) INTO v_movable_count
  FROM public.order_items
  WHERE id = ANY(p_item_ids)
    AND order_id = p_source_order_id
    AND status <> 'cancelled';

  IF v_movable_count <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
  END IF;

  -- Block "split_would_empty_source": after the move, source must keep
  -- >= 1 active item. Owner chose this over auto-cancel (Q2).
  SELECT COUNT(*) INTO v_active_total
  FROM public.order_items
  WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_remaining_count := v_active_total - v_movable_count;
  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'split_would_empty_source' USING ERRCODE = '22023';
  END IF;

  -- Mint new order_number — same counter the cashier-facing create_order
  -- uses (TC-YYMMDD-### / MV-YYMMDD-###). Pattern: lock-on-conflict bump.
  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, order_type, last_seq
  )
  VALUES (
    v_source.tenant_id,
    v_source.branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    v_source.order_type,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date, order_type)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD'
  );

  IF v_source.order_type = 'dine_in' THEN
    v_new_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_new_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  -- Insert new order. Discount fields all NULL — owner chose not to
  -- cascade discount to split bills (ngữ cảnh giảm thuộc về đơn nguồn).
  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    status, subtotal, total_amount, customer_count, note, created_by,
    pos_session_id, idempotency_key, split_from_order_id
  )
  VALUES (
    v_source.tenant_id, v_source.branch_id, v_source.table_id,
    v_new_order_number, v_source.order_type,
    v_source.status,  -- inherit status (món đã ở bếp/bàn — đừng reset về 'new')
    0, 0, 1, NULL, v_uid,
    v_source.pos_session_id, p_idempotency_key, p_source_order_id
  )
  RETURNING id INTO v_new_order_id;

  -- Move items in-place. Status preserved (món đang `preparing` vẫn `preparing`
  -- trên đơn mới). KDS sees the order_id flip via REPLICA IDENTITY FULL +
  -- realtime publication on order_items.
  UPDATE public.order_items
     SET order_id   = v_new_order_id,
         updated_at = now()
   WHERE id = ANY(p_item_ids)
     AND order_id = p_source_order_id;

  -- Re-point KDS tickets so the chef-side card aggregates under the new
  -- order. sent_to_kitchen_at + sent_at metadata stays — chef has been
  -- cooking these for X minutes, that timer should not reset.
  UPDATE public.kds_tickets
     SET order_id   = v_new_order_id,
         updated_at = now()
   WHERE order_item_id = ANY(p_item_ids)
     AND order_id = p_source_order_id;

  -- Recompute SOURCE: subtotal from remaining active items + discount via
  -- helper (pct keeps rate, vnd auto-clamps to new subtotal).
  SELECT COALESCE(SUM(subtotal), 0) INTO v_source_subtotal
  FROM public.order_items
  WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_source_discount := public.compute_discount_amount(
    v_source.discount_type, v_source.discount_value, v_source_subtotal
  );

  v_source_total := v_source_subtotal
                  + COALESCE(v_source.service_charge, 0)
                  - v_source_discount;

  UPDATE public.orders
     SET subtotal        = v_source_subtotal,
         discount_amount = v_source_discount,
         total_amount    = v_source_total,
         updated_at      = now()
   WHERE id = p_source_order_id;

  -- Recompute NEW: subtotal = sum moved items, no discount, no service
  -- charge (đơn mới khởi điểm sạch).
  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
  FROM public.order_items
  WHERE order_id = v_new_order_id AND status <> 'cancelled';

  v_new_total := v_new_subtotal;  -- service_charge=0, discount=0

  UPDATE public.orders
     SET subtotal     = v_new_subtotal,
         total_amount = v_new_total,
         updated_at   = now()
   WHERE id = v_new_order_id;

  -- Audit trail: 2 history rows (one per order). Re-stamp current status
  -- with a descriptive note — not a state transition.
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, v_source.status, v_uid,
     'split_to: ' || v_new_order_number || ' (moved ' || v_movable_count::TEXT || ' items)'),
    (v_source.tenant_id, v_new_order_id, NULL, v_source.status, v_uid,
     'split_from: order#' || p_source_order_id::TEXT);

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'new_order_id',     v_new_order_id,
    'new_order_number', v_new_order_number,
    'moved_count',      v_movable_count,
    'source_subtotal',  v_source_subtotal,
    'source_total',     v_source_total,
    'new_subtotal',     v_new_subtotal,
    'new_total',        v_new_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_order(BIGINT, BIGINT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.split_order(BIGINT, BIGINT[], UUID) TO authenticated;

COMMENT ON FUNCTION public.split_order(BIGINT, BIGINT[], UUID) IS
  'Tách hoá đơn — kéo 1+ items từ đơn nguồn sang đơn mới CÙNG bàn. '
  'In-place UPDATE order_items.order_id (no delete+insert) + re-point '
  'kds_tickets. Source phải giữ >=1 món sau move (block split_would_empty_source). '
  'Đơn mới: discount=0, service_charge=0, status inherit từ source. '
  'Recompute totals via compute_discount_amount helper. Idempotent qua p_idempotency_key.';
