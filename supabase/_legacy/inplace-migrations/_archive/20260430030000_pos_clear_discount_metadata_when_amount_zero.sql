-- =========================================================================
-- POS — fix orders_discount_metadata_paired CHECK violations on 4 RPCs
--
-- Bug:
--   CHECK constraint orders_discount_metadata_paired (added in
--   20260430000000_pos_discount.sql) requires the 4 discount columns
--   (discount_amount/type/value/note) to move together — either ALL NULL/0
--   or ALL populated. clear_order_discount honors that (lines 372-379 of
--   the original migration). The other 4 RPCs that drive discount_amount
--   to 0 do NOT clear type/value/note → CHECK fails, RPC raises 23514,
--   cashier sees "Dữ liệu chiết khấu không nhất quán" and the action
--   never lands.
--
-- Affected RPCs:
--   1. merge_orders         — source loses all items, subtotal=0,
--                             compute_discount_amount(...,0)=0; type/value
--                             /note retained → CHECK fail every merge of
--                             a vnd-discounted source.
--   2. split_order          — pct rate × tiny remaining subtotal can hit
--                             FLOOR(...)=0; rare in real menus but real
--                             (e.g. pct=1, remaining=99 → FLOOR(0.99)=0).
--   3. cancel_order         — sets subtotal=0 + discount_amount=0; same
--                             pattern. Bites every cancel of a
--                             discounted order.
--   4. void_order_item      — auto-cancel branch when last item voided
--                             on a discounted order.
--
-- Fix:
--   Wherever an UPDATE sets discount_amount to 0 (or could, after the
--   compute_discount_amount call), also set discount_type/value/note to
--   NULL. Mirrors the clear_order_discount UPDATE shape exactly. Audit
--   trail for the prior discount lives in order_status_history rows
--   (discount_applied / discount_cleared / split_to / merged_into),
--   not in the orders columns — so clearing them on collapse loses no
--   business info.
--
-- Forward-only: CREATE OR REPLACE on each function. No DDL on tables.
-- Constraint stays intact (it was correct; the RPCs were violating it).
-- =========================================================================


-- ─── 1. merge_orders ────────────────────────────────────────────────────
--
-- Body identical to 20260430020000_pos_merge_orders.sql except the SOURCE
-- UPDATE at the bottom now clears discount_type/value/note alongside
-- discount_amount (both set to 0/NULL because subtotal goes to 0). Target
-- UPDATE unchanged — target's discount_amount can never be 0 with type
-- set (cascade ELSE branch guarantees type=NULL if amount=0).

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

  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id INTO v_lock_lo
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

  v_lock_lo := LEAST(p_source_order_id, p_target_order_id);
  v_lock_hi := GREATEST(p_source_order_id, p_target_order_id);
  PERFORM pg_advisory_xact_lock(v_lock_lo);
  PERFORM pg_advisory_xact_lock(v_lock_hi);

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

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.order_type <> 'dine_in' OR v_target.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'merge_dine_in_only' USING ERRCODE = '22023';
  END IF;

  IF v_source.table_id IS NULL OR v_target.table_id IS NULL
     OR v_source.table_id <> v_target.table_id
  THEN
    RAISE EXCEPTION 'merge_different_tables' USING ERRCODE = '22023';
  END IF;

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

  PERFORM 1 FROM public.payments
  WHERE order_id IN (p_source_order_id, p_target_order_id)
    AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'merge_payment_pending' USING ERRCODE = '22023';
  END IF;

  IF (v_source.discount_type = 'pct' AND COALESCE(v_source.discount_amount, 0) > 0)
     OR (v_target.discount_type = 'pct' AND COALESCE(v_target.discount_amount, 0) > 0)
  THEN
    RAISE EXCEPTION 'merge_pct_discount_blocked' USING ERRCODE = '22023';
  END IF;

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

  UPDATE public.order_items
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  UPDATE public.kds_tickets
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_target_subtotal
  FROM public.order_items
  WHERE order_id = p_target_order_id AND status <> 'cancelled';

  v_target_discount_amount := public.compute_discount_amount(
    v_target_discount_type, v_target_discount_value, v_target_subtotal
  );

  v_target_total := v_target_subtotal
                  + COALESCE(v_target.service_charge, 0)
                  - v_target_discount_amount;

  -- Target: keep the cascade contract. If amount collapsed to 0 (e.g.
  -- summed-VND was clamped down by tiny merged subtotal), null out the
  -- metadata to satisfy the paired CHECK. In practice this rarely fires
  -- because both vnd values come from non-zero discounts and the merged
  -- subtotal is the SUM of both sides' items.
  IF v_target_discount_amount = 0 THEN
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

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

  -- SOURCE: subtotal goes to 0 → discount collapses. MUST clear
  -- discount_type/value/note alongside discount_amount=0 so the paired
  -- CHECK constraint holds. Audit row below preserves the discount trail.
  v_source_total := 0 + COALESCE(v_source.service_charge, 0);

  UPDATE public.orders
     SET status               = 'cancelled',
         subtotal             = 0,
         discount_type        = NULL,
         discount_value       = NULL,
         discount_note        = NULL,
         discount_amount      = 0,
         total_amount         = v_source_total,
         merged_into_order_id = p_target_order_id,
         updated_at           = now()
   WHERE id = p_source_order_id;

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


-- ─── 2. split_order ─────────────────────────────────────────────────────
--
-- Same body as 20260430010000_pos_split_order.sql except the SOURCE UPDATE
-- nulls discount metadata when v_source_discount collapses to 0 (only
-- fires for pct + tiny remaining subtotal — vnd auto-clamps to subtotal
-- which the would_empty_source guard keeps > 0).

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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'split_source_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'split_source_paid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
  WHERE order_id = p_source_order_id AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'split_payment_pending' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_movable_count
  FROM public.order_items
  WHERE id = ANY(p_item_ids)
    AND order_id = p_source_order_id
    AND status <> 'cancelled';

  IF v_movable_count <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_active_total
  FROM public.order_items
  WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_remaining_count := v_active_total - v_movable_count;
  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'split_would_empty_source' USING ERRCODE = '22023';
  END IF;

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

  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    status, subtotal, total_amount, customer_count, note, created_by,
    pos_session_id, idempotency_key, split_from_order_id
  )
  VALUES (
    v_source.tenant_id, v_source.branch_id, v_source.table_id,
    v_new_order_number, v_source.order_type,
    v_source.status,
    0, 0, 1, NULL, v_uid,
    v_source.pos_session_id, p_idempotency_key, p_source_order_id
  )
  RETURNING id INTO v_new_order_id;

  UPDATE public.order_items
     SET order_id   = v_new_order_id,
         updated_at = now()
   WHERE id = ANY(p_item_ids)
     AND order_id = p_source_order_id;

  UPDATE public.kds_tickets
     SET order_id   = v_new_order_id,
         updated_at = now()
   WHERE order_item_id = ANY(p_item_ids)
     AND order_id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_source_subtotal
  FROM public.order_items
  WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_source_discount := public.compute_discount_amount(
    v_source.discount_type, v_source.discount_value, v_source_subtotal
  );

  v_source_total := v_source_subtotal
                  + COALESCE(v_source.service_charge, 0)
                  - v_source_discount;

  -- Edge: pct rate × tiny remaining subtotal can FLOOR to 0 (e.g. pct=1
  -- with remaining=99đ → 0.99 → 0). When that happens, null the metadata
  -- so the paired CHECK holds. The CASE form keeps the existing path
  -- (discount > 0) one UPDATE.
  UPDATE public.orders
     SET subtotal        = v_source_subtotal,
         discount_type   = CASE WHEN v_source_discount = 0 THEN NULL ELSE discount_type END,
         discount_value  = CASE WHEN v_source_discount = 0 THEN NULL ELSE discount_value END,
         discount_note   = CASE WHEN v_source_discount = 0 THEN NULL ELSE discount_note END,
         discount_amount = v_source_discount,
         total_amount    = v_source_total,
         updated_at      = now()
   WHERE id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
  FROM public.order_items
  WHERE order_id = v_new_order_id AND status <> 'cancelled';

  v_new_total := v_new_subtotal;

  UPDATE public.orders
     SET subtotal     = v_new_subtotal,
         total_amount = v_new_total,
         updated_at   = now()
   WHERE id = v_new_order_id;

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


-- ─── 3. cancel_order ────────────────────────────────────────────────────
--
-- Same body as 20260430000000_pos_discount.sql section 8 except the order
-- UPDATE clears discount_type/value/note. Subtotal=0 path → discount=0
-- always.

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id BIGINT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              UUID;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_order            RECORD;
  v_item_id          BIGINT;
  v_print_res        JSONB;
  v_tickets_enqueued INT := 0;
  v_tickets_skipped  INT := 0;
  v_skip_reasons     TEXT[] := ARRAY[]::TEXT[];
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

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, table_id, order_type,
         service_charge, discount_type, discount_value
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

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

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE order_id = p_order_id AND status <> 'cancelled';

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND tenant_id = v_order.tenant_id;

  -- Subtotal goes to 0 → discount must collapse to 0 AND metadata must be
  -- nulled to satisfy orders_discount_metadata_paired. Audit trail is
  -- already in order_status_history (the discount_applied row stays).
  UPDATE public.orders
  SET
    status          = 'cancelled',
    subtotal        = 0,
    discount_type   = NULL,
    discount_value  = NULL,
    discount_note   = NULL,
    discount_amount = 0,
    total_amount    = 0 + COALESCE(service_charge, 0),
    updated_at      = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', v_uid, p_reason
  );

  FOR v_item_id IN
    SELECT id FROM public.order_items
    WHERE order_id = p_order_id
      AND sent_to_kitchen_at IS NOT NULL
    ORDER BY id
  LOOP
    BEGIN
      v_print_res := public.enqueue_cancel_ticket_print(v_item_id, p_reason);
      IF (v_print_res ? 'skipped') AND (v_print_res->>'skipped')::boolean THEN
        v_tickets_skipped := v_tickets_skipped + 1;
        v_skip_reasons := v_skip_reasons || COALESCE(v_print_res->>'reason', 'unknown');
      ELSE
        v_tickets_enqueued := v_tickets_enqueued + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_tickets_skipped := v_tickets_skipped + 1;
      v_skip_reasons := v_skip_reasons || ('error:' || SQLERRM);
      RAISE NOTICE '[cancel_order] cancel-ticket enqueue raised for item %: %',
        v_item_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id',         p_order_id,
    'status',           'cancelled',
    'cancel_tickets',   v_tickets_enqueued,
    'cancel_skipped',   v_tickets_skipped,
    'skip_reasons',     to_jsonb(v_skip_reasons)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order(BIGINT, TEXT) TO authenticated;


-- ─── 4. void_order_item ─────────────────────────────────────────────────
--
-- Same body as 20260430000000_pos_discount.sql section 7 except both
-- branches null discount metadata when discount_amount collapses to 0
-- (auto-cancel branch always; partial-void branch only at the pct edge).

CREATE OR REPLACE FUNCTION public.void_order_item(
  p_order_item_id BIGINT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_item            RECORD;
  v_order           RECORD;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_all_cancelled   BOOLEAN;
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

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'item not voidable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_item_id = p_order_item_id AND tenant_id = v_item.tenant_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = v_item.order_id AND status <> 'cancelled'
  ) INTO v_all_cancelled;

  IF v_all_cancelled THEN
    -- Auto-cancel branch: subtotal=0 always → discount collapses to 0.
    -- Clear metadata to satisfy paired CHECK.
    UPDATE public.orders
    SET
      status          = 'cancelled',
      subtotal        = 0,
      discount_type   = NULL,
      discount_value  = NULL,
      discount_note   = NULL,
      discount_amount = 0,
      total_amount    = 0 + COALESCE(service_charge, 0),
      updated_at      = now()
    WHERE id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, 'cancelled', v_uid,
      'auto_cancel_all_items_voided: ' || p_reason
    );
  ELSE
    -- Partial void: subtotal > 0. Pct rate × tiny remaining can FLOOR to
    -- 0 (rare); CASE form clears metadata only in that edge.
    v_discount_amount := public.compute_discount_amount(
      v_order.discount_type, v_order.discount_value, v_subtotal
    );

    UPDATE public.orders o
    SET
      subtotal        = v_subtotal,
      discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_type END,
      discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_value END,
      discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_note END,
      discount_amount = v_discount_amount,
      total_amount    = v_subtotal + COALESCE(o.service_charge, 0) - v_discount_amount,
      updated_at      = now()
    WHERE o.id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
      'void_item ' || p_order_item_id::text || ': ' || p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_item.order_id,
    'auto_cancelled_order', v_all_cancelled,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_order_item(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_order_item(BIGINT, TEXT) TO authenticated;


COMMENT ON FUNCTION public.merge_orders(BIGINT, BIGINT, UUID) IS
  'Gộp source vào target (cùng table + branch + dine_in, cả 2 chưa paid). '
  'Source bị cancel với merged_into_order_id pointer. Items + KDS tickets '
  're-point sang target. Discount: pct ở bên nào → BLOCK; VND cộng dồn. '
  'Source-side clears discount_type/value/note when subtotal collapses to 0 '
  '(satisfies orders_discount_metadata_paired). Lock LEAST/GREATEST(a,b) '
  'tránh deadlock cross-merge. Idempotent qua p_idempotency_key.';

COMMENT ON FUNCTION public.split_order(BIGINT, BIGINT[], UUID) IS
  'Tách hoá đơn — kéo 1+ items từ đơn nguồn sang đơn mới CÙNG bàn. '
  'In-place UPDATE order_items.order_id (no delete+insert) + re-point '
  'kds_tickets. Source phải giữ >=1 món sau move. Đơn mới: discount=0, '
  'service_charge=0. Source clears discount metadata if pct FLOOR collapses '
  'to 0. Idempotent qua p_idempotency_key.';
