-- =========================================================================
-- POS gộp hoá đơn — merge (PR-3 / 3)
--
-- 2 đơn cùng bàn, cả 2 chưa thanh toán → move tất cả items từ source A sang
-- target B; source A becomes 'cancelled' với lineage merged_into=B.
-- Phổ biến: 2 nhóm khách quen ngồi 2 lượt rồi gộp tính chung; hoặc cashier
-- mở nhầm 2 đơn cho cùng bàn.
--
-- Design decisions (4-agent debate, owner-approved 2026-04-26):
--   - Q4 DISCOUNT: nếu CẢ HAI đơn có chiết khấu THEO % → BLOCK (cashier
--     phải xoá 1 trong 2 trước khi gộp). Nếu cả hai đơn VND → CỘNG DỒN
--     vào target. Nếu chỉ source có discount (VND) → copy sang target. Nếu
--     chỉ target → keep. Owner reasoning: "discount của A vẫn là của A
--     dù gộp; nhưng % không cộng dồn meaningful (10% trên A + 15% trên B
--     ≠ 25% trên gộp)".
--   - Same-table strict (cùng table_id) + order_type='dine_in'. Cross-bàn
--     và takeaway không hỗ trợ — out of scope per owner.
--   - Lock LEAST/GREATEST để tránh deadlock 2 cashier merge ngược chiều.
--   - kds_tickets re-point sang target để chef thấy 1 phiếu duy nhất.
--   - Source order_number giữ nguyên (counter monotonic, không decrement).
--   - merge_request_key sidecar UUID trên target — replay idempotent.
--
-- Files in this migration:
--   - orders: ADD COLUMN merged_into_order_id, merge_request_key
--   - CHECK constraint orders_no_self_merge
--   - NEW   merge_orders(source, target, idempotency_key) -> JSONB
-- =========================================================================

-- ─── 1. Schema ──────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merged_into_order_id BIGINT
    REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_request_key UUID;

CREATE INDEX IF NOT EXISTS idx_orders_merged_into
  ON public.orders(merged_into_order_id)
  WHERE merged_into_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_merge_request_key
  ON public.orders(id, merge_request_key)
  WHERE merge_request_key IS NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_no_self_merge;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_no_self_merge
    CHECK (merged_into_order_id IS DISTINCT FROM id);

COMMENT ON COLUMN public.orders.merged_into_order_id IS
  'Đơn target nếu đơn này đã bị gộp vào đơn khác (status sẽ là cancelled). NULL nếu chưa.';
COMMENT ON COLUMN public.orders.merge_request_key IS
  'Idempotency key (UUID) stamp on target khi merge xong. Replay với cùng key trả về kết quả cũ.';


-- ─── 2. RPC merge_orders ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.merge_orders(
  p_source_order_id BIGINT,
  p_target_order_id BIGINT,
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
  v_target               RECORD;
  v_lock_lo              BIGINT;
  v_lock_hi              BIGINT;
  v_flag_enabled         TEXT;
  v_moved_count          INT;
  v_target_subtotal      NUMERIC(15,2);
  v_target_discount_type   TEXT;
  v_target_discount_value  NUMERIC(15,2);
  v_target_discount_note   TEXT;
  v_target_discount_amount NUMERIC(15,2);
  v_target_total           NUMERIC(15,2);
  v_source_discount_amount NUMERIC(15,2);
  v_source_total           NUMERIC(15,2);
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

  IF p_source_order_id = p_target_order_id THEN
    RAISE EXCEPTION 'merge_self' USING ERRCODE = '22023';
  END IF;

  -- Idempotency short-circuit BEFORE acquiring locks. If the previous call
  -- already stamped target.merge_request_key with this UUID, we already
  -- merged this pair. Return the prior result.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id INTO v_lock_lo  -- v_lock_lo reused as scratch here
    FROM public.orders t
    WHERE t.id = p_target_order_id
      AND t.merge_request_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      SELECT subtotal, total_amount INTO v_target_subtotal, v_target_total
      FROM public.orders WHERE id = p_target_order_id;
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'target_order_id',  p_target_order_id,
        'target_subtotal',  COALESCE(v_target_subtotal, 0),
        'target_total',     COALESCE(v_target_total, 0),
        'idempotent',       true
      );
    END IF;
  END IF;

  -- Deadlock-safe lock ordering: always lower id first, then higher.
  -- Two cashiers double-tapping cross-merges (A→B and B→A) would deadlock
  -- without this; with it, one transaction wins, the other gets a lock-
  -- wait-then-state-mismatch and raises cleanly.
  v_lock_lo := LEAST(p_source_order_id, p_target_order_id);
  v_lock_hi := GREATEST(p_source_order_id, p_target_order_id);
  PERFORM pg_advisory_xact_lock(v_lock_lo);
  PERFORM pg_advisory_xact_lock(v_lock_hi);

  -- Lock + read both rows. SELECT FOR UPDATE in lower-id order to avoid a
  -- second deadlock surface (FK + advisory lock are independent).
  IF v_lock_lo = p_source_order_id THEN
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;
  ELSE
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;
  END IF;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'source order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'target order not found' USING ERRCODE = 'P0002';
  END IF;

  -- Tenant + branch scope. SECURITY DEFINER bypasses RLS; manually compare.
  IF v_source.tenant_id <> v_prof_tenant OR v_target.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_source.branch_id <> v_target.branch_id THEN
    RAISE EXCEPTION 'merge_different_branch' USING ERRCODE = '22023';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  -- Feature flag.
  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  -- Same-table + dine_in strict.
  IF v_source.order_type <> 'dine_in' OR v_target.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'merge_dine_in_only' USING ERRCODE = '22023';
  END IF;

  IF v_source.table_id IS NULL OR v_target.table_id IS NULL
     OR v_source.table_id <> v_target.table_id
  THEN
    RAISE EXCEPTION 'merge_different_tables' USING ERRCODE = '22023';
  END IF;

  -- State guards.
  IF v_source.status IN ('completed', 'cancelled')
     OR v_target.status IN ('completed', 'cancelled')
  THEN
    RAISE EXCEPTION 'merge_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid'
     OR COALESCE(v_target.payment_status, 'unpaid') = 'paid'
  THEN
    RAISE EXCEPTION 'merge_paid' USING ERRCODE = '22023';
  END IF;

  IF v_source.merged_into_order_id IS NOT NULL OR v_target.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'merge_already_merged' USING ERRCODE = '22023';
  END IF;

  -- Active payments row on either side → block (race vs VietQR / cash).
  PERFORM 1 FROM public.payments
  WHERE order_id IN (p_source_order_id, p_target_order_id)
    AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'merge_payment_pending' USING ERRCODE = '22023';
  END IF;

  -- Q4: pct on either side → block. Owner reasoning: "10% trên đơn 100k +
  -- 15% trên đơn 200k" không cộng dồn được meaningful — cashier phải gỡ
  -- 1 trong 2 trước khi gộp.
  IF (v_source.discount_type = 'pct' AND COALESCE(v_source.discount_amount, 0) > 0)
     OR (v_target.discount_type = 'pct' AND COALESCE(v_target.discount_amount, 0) > 0)
  THEN
    RAISE EXCEPTION 'merge_pct_discount_blocked' USING ERRCODE = '22023';
  END IF;

  -- Discount cascade — VND only past this point.
  --   Both VND → sum into target, concat notes.
  --   Source-only VND → copy to target.
  --   Target-only VND → keep target.
  --   Neither → target stays clean.
  IF v_source.discount_type = 'vnd' AND v_target.discount_type = 'vnd' THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := COALESCE(v_source.discount_value, 0)
                             + COALESCE(v_target.discount_value, 0);
    v_target_discount_note  := COALESCE(v_target.discount_note, '')
      || ' + ' || COALESCE(v_source.discount_note, '');
  ELSIF v_source.discount_type = 'vnd' AND v_target.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_source.discount_value;
    v_target_discount_note  := v_source.discount_note;
  ELSIF v_target.discount_type = 'vnd' AND v_source.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_target.discount_value;
    v_target_discount_note  := v_target.discount_note;
  ELSE
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

  -- Move active items source -> target. cancelled rows stay with source for
  -- audit (they keep their original cancel_reason on the cancelled order).
  UPDATE public.order_items
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  -- KDS tickets follow.
  UPDATE public.kds_tickets
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id;

  -- Recompute target. Subtotal first, then discount via helper (handles
  -- the `value > new_subtotal` clamp for the summed-VND case).
  SELECT COALESCE(SUM(subtotal), 0) INTO v_target_subtotal
  FROM public.order_items
  WHERE order_id = p_target_order_id AND status <> 'cancelled';

  v_target_discount_amount := public.compute_discount_amount(
    v_target_discount_type, v_target_discount_value, v_target_subtotal
  );

  v_target_total := v_target_subtotal
                  + COALESCE(v_target.service_charge, 0)
                  - v_target_discount_amount;

  UPDATE public.orders
     SET subtotal             = v_target_subtotal,
         discount_type        = v_target_discount_type,
         discount_value       = v_target_discount_value,
         discount_note        = v_target_discount_note,
         discount_amount      = v_target_discount_amount,
         total_amount         = v_target_total,
         customer_count       = GREATEST(v_target.customer_count, v_source.customer_count),
         note                 = CASE
                                  WHEN v_source.note IS NOT NULL AND length(trim(v_source.note)) > 0
                                  THEN COALESCE(v_target.note || E'\n', '')
                                       || '[Gộp từ ' || v_source.order_number || ']: ' || v_source.note
                                  ELSE v_target.note
                                END,
         merge_request_key    = p_idempotency_key,
         updated_at           = now()
   WHERE id = p_target_order_id;

  -- Cancel source — items already moved out, subtotal goes to 0. Discount
  -- of source collapses (helper returns 0 when subtotal=0). NEVER call
  -- cancel_order RPC here: it would fanout cancel-tickets to kitchen for
  -- items that physically exist (just on the new order now).
  v_source_discount_amount := public.compute_discount_amount(
    v_source.discount_type, v_source.discount_value, 0
  );
  v_source_total := 0
                  + COALESCE(v_source.service_charge, 0)
                  - v_source_discount_amount;

  UPDATE public.orders
     SET status               = 'cancelled',
         subtotal             = 0,
         discount_amount      = v_source_discount_amount,
         total_amount         = v_source_total,
         merged_into_order_id = p_target_order_id,
         updated_at           = now()
   WHERE id = p_source_order_id;

  -- Audit trail.
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, 'cancelled', v_uid,
     'merged_into: ' || v_target.order_number || ' (#' || p_target_order_id::TEXT
       || '), moved ' || v_moved_count::TEXT || ' items'),
    (v_target.tenant_id, p_target_order_id, v_target.status, v_target.status, v_uid,
     'merged_from: ' || v_source.order_number || ' (#' || p_source_order_id::TEXT
       || '), received ' || v_moved_count::TEXT || ' items');

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'target_order_id',  p_target_order_id,
    'moved_count',      v_moved_count,
    'target_subtotal',  v_target_subtotal,
    'target_total',     v_target_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_orders(BIGINT, BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_orders(BIGINT, BIGINT, UUID) TO authenticated;

COMMENT ON FUNCTION public.merge_orders(BIGINT, BIGINT, UUID) IS
  'Gộp source vào target (cùng table + branch + dine_in, cả 2 chưa paid). '
  'Source bị cancel với merged_into_order_id pointer. Items + KDS tickets '
  're-point sang target. Discount: pct ở bên nào → BLOCK; VND cộng dồn. '
  'Lock LEAST/GREATEST(a,b) tránh deadlock cross-merge. Idempotent qua '
  'p_idempotency_key (stamp lên target.merge_request_key).';
