-- =============================================================
-- POS split_order — skip daily-quota enforcement on partial-clone
--
-- Migration 20260514000000 extended the daily-limit enforce trigger
-- to read NEW.sides JSONB. That fix is correct for fresh INSERTs but
-- WRONG for the partial-move clone INSERT inside split_order:
--
--   - Original row charged quota for the full quantity at first INSERT.
--   - Split-partial REDUCEs source row's quantity (UPDATE — no trigger
--     fires) and INSERTs a clone with the partial qty.
--   - Net qty across {source-after, clone} = original qty (unchanged).
--   - But the clone's INSERT would now fire the enforce trigger and
--     re-charge the quota → over-count.
--
-- Fix: set GUC comtammatu.skip_quota_enforcement = 'true' (transaction-
-- local) right before the clone INSERT, reset it right after. The
-- enforce trigger reads this GUC at the top of its body and short-
-- circuits when set. Same hatch is reused by any future RPC that
-- needs to move existing quota-counted rows around without re-charging.
--
-- Body is identical to migration 20260428021437 except for two added
-- PERFORM set_config() lines around the clone INSERT.
-- =============================================================

CREATE OR REPLACE FUNCTION public.split_order(
  p_source_order_id BIGINT,
  p_item_partials   JSONB,
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
  v_active_total_rows    INT;
  v_full_move_count      INT := 0;
  v_total_units_moved    INT := 0;
  v_remaining_rows       INT;
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
  v_partial              JSONB;
  v_partial_item_id      BIGINT;
  v_partial_qty          INT;
  v_src_row              public.order_items%ROWTYPE;
  v_new_item_id          BIGINT;
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

  IF p_item_partials IS NULL
     OR jsonb_typeof(p_item_partials) <> 'array'
     OR jsonb_array_length(p_item_partials) = 0
  THEN
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

  -- ─── Validate partials + lock source rows + count full-moves ─────────
  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := NULLIF(v_partial ->> 'item_id', '')::BIGINT;
    v_partial_qty := NULLIF(v_partial ->> 'quantity', '')::INT;

    IF v_partial_item_id IS NULL OR v_partial_qty IS NULL OR v_partial_qty < 1 THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_src_row
    FROM public.order_items
    WHERE id = v_partial_item_id
      AND order_id = p_source_order_id
      AND status <> 'cancelled'
    FOR UPDATE;

    IF NOT FOUND OR v_partial_qty > v_src_row.quantity THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_partial_qty = v_src_row.quantity THEN
      v_full_move_count := v_full_move_count + 1;
    END IF;

    v_total_units_moved := v_total_units_moved + v_partial_qty;
  END LOOP;

  SELECT COUNT(*) INTO v_active_total_rows
  FROM public.order_items
  WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_remaining_rows := v_active_total_rows - v_full_move_count;
  IF v_remaining_rows < 1 THEN
    RAISE EXCEPTION 'split_would_empty_source' USING ERRCODE = '22023';
  END IF;

  -- ─── Mint new order_number (same TC/MV counter as create_order) ─────
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

  -- ─── Apply each partial ──────────────────────────────────────────────
  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := (v_partial ->> 'item_id')::BIGINT;
    v_partial_qty := (v_partial ->> 'quantity')::INT;

    SELECT * INTO v_src_row
    FROM public.order_items
    WHERE id = v_partial_item_id;

    IF v_partial_qty = v_src_row.quantity THEN
      -- Full move: in-place flip order_id. No trigger fires (UPDATE,
      -- not INSERT). Quota unchanged by design.
      UPDATE public.order_items
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE id = v_partial_item_id
         AND order_id = p_source_order_id;

      UPDATE public.kds_tickets
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE order_item_id = v_partial_item_id
         AND order_id = p_source_order_id;
    ELSE
      -- Partial move: clone row sang đơn mới với phần qty, giảm source row.
      -- The clone INSERT would normally fire enforce_branch_menu_daily_limit
      -- and re-charge quota for the clone's main + sides. But net qty
      -- across {source-after, clone} = source-before, so quota must NOT
      -- change. Set transaction-local GUC to make the trigger short-
      -- circuit, restore immediately after the INSERT so any subsequent
      -- INSERTs in this RPC (none today; defensive) are normally enforced.
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
      INSERT INTO public.order_items (
        tenant_id, order_id, menu_item_id, variant_id,
        item_name, variant_name, quantity, unit_price,
        modifiers, sides, subtotal, note, status,
        sent_to_kitchen_at
      )
      VALUES (
        v_src_row.tenant_id, v_new_order_id,
        v_src_row.menu_item_id, v_src_row.variant_id,
        v_src_row.item_name, v_src_row.variant_name,
        v_partial_qty, v_src_row.unit_price,
        v_src_row.modifiers, v_src_row.sides,
        v_src_row.unit_price * v_partial_qty,
        v_src_row.note, v_src_row.status,
        v_src_row.sent_to_kitchen_at
      )
      RETURNING id INTO v_new_item_id;
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'false', true);

      UPDATE public.order_items
         SET quantity   = v_src_row.quantity - v_partial_qty,
             subtotal   = v_src_row.unit_price * (v_src_row.quantity - v_partial_qty),
             updated_at = now()
       WHERE id = v_partial_item_id;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        status, bumped_at, bumped_by, created_at
      )
      SELECT
        kt.tenant_id, kt.branch_id, kt.station_id,
        v_new_order_id, v_new_item_id,
        kt.status, kt.bumped_at, kt.bumped_by, kt.created_at
      FROM public.kds_tickets kt
      WHERE kt.order_item_id = v_partial_item_id
        AND kt.order_id = p_source_order_id;
    END IF;
  END LOOP;

  -- ─── Recompute SOURCE totals ────────────────────────────────────────
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

  -- ─── Recompute NEW totals (no discount, no service charge) ──────────
  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
  FROM public.order_items
  WHERE order_id = v_new_order_id AND status <> 'cancelled';

  v_new_total := v_new_subtotal;

  UPDATE public.orders
     SET subtotal     = v_new_subtotal,
         total_amount = v_new_total,
         updated_at   = now()
   WHERE id = v_new_order_id;

  -- ─── Audit trail ─────────────────────────────────────────────────────
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, v_source.status, v_uid,
     'split_to: ' || v_new_order_number
       || ' (moved ' || v_total_units_moved::TEXT || ' units across '
       || jsonb_array_length(p_item_partials)::TEXT || ' lines)'),
    (v_source.tenant_id, v_new_order_id, NULL, v_source.status, v_uid,
     'split_from: order#' || p_source_order_id::TEXT);

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'new_order_id',     v_new_order_id,
    'new_order_number', v_new_order_number,
    'moved_count',      v_total_units_moved,
    'source_subtotal',  v_source_subtotal,
    'source_total',     v_source_total,
    'new_subtotal',     v_new_subtotal,
    'new_total',        v_new_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_order(BIGINT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.split_order(BIGINT, JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION public.split_order(BIGINT, JSONB, UUID) IS
  'Tách hoá đơn — partials [{item_id, quantity}]. quantity == row.quantity '
  '→ in-place UPDATE order_id; quantity < row.quantity → INSERT clone trên '
  'đơn mới + giảm qty source + mirror kds_tickets per station. Source phải '
  'giữ ≥1 active ROW sau move (block split_would_empty_source). Đơn mới: '
  'discount=0, service_charge=0, status inherit từ source. Idempotent qua '
  'p_idempotency_key. Clone INSERT bypass enforce_branch_menu_daily_limit '
  'qua GUC comtammatu.skip_quota_enforcement (net qty unchanged).';
