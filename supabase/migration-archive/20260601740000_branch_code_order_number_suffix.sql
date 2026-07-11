-- 20260601740000_branch_code_order_number_suffix
--
-- Append `-{branch_code}` to new order_numbers so cross-branch reports
-- distinguish "MV-260513-013-DD" (Đất Đỏ) from "MV-260513-013-PH"
-- (Phước Hải). Counter resets per (branch, date), so the seq portion
-- alone is not unique across branches.
--
-- Old orders keep their original order_number (no backfill) — receipts
-- already printed and HĐĐT already submitted reference the legacy form.
--
-- Affected RPCs: create_order, split_order (both emit new order_number).
-- merge_orders reuses the target's existing order_number → no change.
-- get_orders_for_day adds branch_name so the drill-down page can show
-- a branch column even for legacy orders without the suffix.

-- ─── 1) branches.code column ─────────────────────────────────────

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS code TEXT;

-- Backfill known operational branches by name (idempotent — re-runs are no-ops).
UPDATE public.branches
   SET code = 'DD'
 WHERE tenant_id = 1
   AND name = 'Chi nhánh Đất Đỏ'
   AND code IS NULL;

UPDATE public.branches
   SET code = 'PH'
 WHERE tenant_id = 1
   AND name = 'Chi nhánh Phước Hải'
   AND code IS NULL;

-- Hard guard: every operational branch MUST have a code before the CHECK
-- constraint lands. Loud failure beats a silent NULL slipping through.
DO $$
DECLARE
  v_missing_count INT;
  v_missing_names TEXT;
BEGIN
  SELECT COUNT(*), string_agg(name, ', ')
    INTO v_missing_count, v_missing_names
    FROM public.branches
   WHERE branch_kind = 'branch' AND code IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % operational branch(es) missing code — fill manually first: %',
      v_missing_count, v_missing_names;
  END IF;
END $$;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_code_format_chk
  CHECK (
    branch_kind <> 'branch'
    OR (code IS NOT NULL AND code ~ '^[A-Z]{2,4}$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_code_unique
  ON public.branches (tenant_id, code)
  WHERE code IS NOT NULL;

-- ─── 2) create_order — append branch suffix ──────────────────────

CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_created_by UUID,
  p_items JSONB,
  p_order_type TEXT DEFAULT 'dine_in',
  p_table_id BIGINT DEFAULT NULL,
  p_pos_session_id BIGINT DEFAULT NULL,
  p_customer_count INT DEFAULT 1,
  p_note TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_created_by       UUID;
  v_order_id         BIGINT;
  v_order_number     TEXT;
  v_date_part        TEXT;
  v_subtotal         NUMERIC(15,2) := 0;
  v_seq              INT;
  v_table_number     INT;
  v_item             JSONB;
  v_base_price       NUMERIC(15,2);
  v_variant_adj      NUMERIC(15,2);
  v_modifier_sum     NUMERIC(15,2);
  v_sides_sum        NUMERIC(15,2);
  v_enriched_sides   JSONB;
  v_unit_price       NUMERIC(15,2);
  v_item_subtotal    NUMERIC(15,2);
  v_menu_item_id     BIGINT;
  v_variant_id       BIGINT;
  v_quantity         INT;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_branch_code      TEXT;
BEGIN
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_created_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF p_branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT t.number INTO v_table_number
      FROM public.tables t
     WHERE t.id = p_table_id AND t.branch_id = p_branch_id AND t.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_pos_session_id IS NOT NULL THEN
    PERFORM 1 FROM public.pos_sessions
     WHERE id = p_pos_session_id
       AND branch_id = p_branch_id
       AND tenant_id = p_tenant_id
       AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POS session does not belong to this branch or is not open' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_order_id, v_order_number
      FROM public.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
    END IF;
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYMMDD'
  );

  IF p_order_type = 'dine_in' THEN
    v_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_order_number := v_order_number || '-' || v_branch_code;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      tenant_id, branch_id, table_id, order_number, order_type,
      subtotal, total_amount, customer_count, note, created_by,
      pos_session_id, idempotency_key
    )
    VALUES (
      p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
      0, 0, p_customer_count, p_note, v_created_by,
      p_pos_session_id, p_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT o.id, o.order_number INTO v_order_id, v_order_number
          FROM public.orders o
         WHERE o.tenant_id = p_tenant_id
           AND o.idempotency_key = p_idempotency_key;
        IF FOUND THEN
          RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
        END IF;
      END IF;
      RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id   := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity     := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT base_price INTO v_base_price
      FROM public.menu_items
     WHERE id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
        FROM public.menu_item_variants
       WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      p_tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
      INTO v_sides_sum, v_enriched_sides
      FROM public.pos_enrich_order_sides(
        p_tenant_id,
        v_menu_item_id,
        COALESCE(v_item -> 'sides', '[]'::JSONB)
      );

    v_unit_price    := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal      := v_subtotal + v_item_subtotal;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note
    )
    VALUES (
      p_tenant_id, v_order_id, v_menu_item_id, v_variant_id,
      v_item ->> 'item_name', v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_enriched_sides, '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note'
    );
  END LOOP;

  UPDATE public.orders
     SET subtotal = v_subtotal, total_amount = v_subtotal
   WHERE id = v_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', v_created_by);

  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
       SET status = 'occupied'
     WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.route_order_to_kds(v_order_id);

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$function$;

-- ─── 3) split_order — append branch suffix to new order ──────────

CREATE OR REPLACE FUNCTION public.split_order(
  p_source_order_id BIGINT,
  p_item_partials JSONB,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_branch_code          TEXT;
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
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  ELSE
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
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

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    v_source.tenant_id,
    v_source.branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
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

  IF v_branch_code IS NOT NULL THEN
    v_new_order_number := v_new_order_number || '-' || v_branch_code;
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

  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := (v_partial ->> 'item_id')::BIGINT;
    v_partial_qty := (v_partial ->> 'quantity')::INT;

    SELECT * INTO v_src_row
      FROM public.order_items
     WHERE id = v_partial_item_id;

    IF v_partial_qty = v_src_row.quantity THEN
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
$function$;

-- ─── 4) get_orders_for_day — add branch_name column ──────────────

DROP FUNCTION IF EXISTS public.get_orders_for_day(BIGINT, DATE);

CREATE OR REPLACE FUNCTION public.get_orders_for_day(
  p_branch_id BIGINT,
  p_date      DATE
) RETURNS TABLE(
  order_id        BIGINT,
  order_number    TEXT,
  branch_id       BIGINT,
  branch_name     TEXT,
  paid_at         TIMESTAMPTZ,
  paid_hour       INT,
  order_type      TEXT,
  customer_count  INT,
  subtotal        NUMERIC,
  discount_amount NUMERIC,
  tax_amount      NUMERIC,
  total_amount    NUMERIC,
  payment_method  TEXT,
  item_count      BIGINT,
  invoice_status  TEXT,
  invoice_number  TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required for drill-down'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
    FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      o.id AS order_id,
      o.order_number,
      o.branch_id,
      b.name AS branch_name,
      p.paid_at,
      EXTRACT(HOUR FROM (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT
        AS paid_hour,
      o.order_type,
      o.customer_count,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.total_amount,
      o.payment_method,
      (SELECT COUNT(*) FROM public.order_items oi
        WHERE oi.order_id = o.id AND oi.status <> 'cancelled')::BIGINT
        AS item_count,
      ti.status         AS invoice_status,
      ti.invoice_number
    FROM public.orders o
    JOIN public.branches b
      ON b.id = o.branch_id
     AND b.tenant_id = o.tenant_id
    JOIN public.payments p
      ON p.order_id  = o.id
     AND p.tenant_id = o.tenant_id
     AND p.status    = 'completed'
     AND p.paid_at IS NOT NULL
    LEFT JOIN public.tax_invoices ti
      ON ti.order_id  = o.id
     AND ti.tenant_id = o.tenant_id
     AND ti.status NOT IN ('cancelled', 'replaced')
    WHERE o.tenant_id = v_tenant
      AND o.branch_id = p_branch_id
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_date
    ORDER BY p.paid_at;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_orders_for_day(BIGINT, DATE) TO authenticated;
