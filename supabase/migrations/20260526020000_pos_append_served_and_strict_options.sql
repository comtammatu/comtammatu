-- POS mobile flow rules:
-- 1) served orders are still active and appendable until payment closes them.
-- 2) stale modifiers/sides reject the whole order mutation instead of being
--    silently dropped during server-side price recompute.

CREATE OR REPLACE FUNCTION public.pos_order_modifier_sum(
  p_tenant_id BIGINT,
  p_main_item_id BIGINT,
  p_modifiers JSONB
)
RETURNS NUMERIC(15,2)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_raw_count   INT := 0;
  v_valid_count INT := 0;
  v_live_count  INT := 0;
  v_sum         NUMERIC(15,2) := 0;
BEGIN
  IF p_modifiers IS NULL THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(p_modifiers) <> 'array' THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  v_raw_count := jsonb_array_length(p_modifiers);
  IF v_raw_count = 0 THEN
    RETURN 0;
  END IF;

  WITH modifier_input AS (
    SELECT (mod_el ->> 'modifier_id')::BIGINT AS modifier_id
    FROM jsonb_array_elements(p_modifiers) AS mod_el
    WHERE mod_el ? 'modifier_id'
      AND (mod_el ->> 'modifier_id') ~ '^[0-9]+$'
  )
  SELECT COUNT(*)::INT INTO v_valid_count
  FROM modifier_input;

  IF v_valid_count <> v_raw_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  WITH modifier_input AS (
    SELECT (mod_el ->> 'modifier_id')::BIGINT AS modifier_id
    FROM jsonb_array_elements(p_modifiers) AS mod_el
    WHERE mod_el ? 'modifier_id'
      AND (mod_el ->> 'modifier_id') ~ '^[0-9]+$'
  ),
  live_modifiers AS (
    SELECT m.price
    FROM modifier_input mi
    JOIN public.menu_item_modifiers m
      ON m.id = mi.modifier_id
     AND m.item_id = p_main_item_id
     AND m.tenant_id = p_tenant_id
     AND m.is_active = TRUE
  )
  SELECT COUNT(*)::INT, COALESCE(SUM(price), 0)::NUMERIC(15,2)
  INTO v_live_count, v_sum
  FROM live_modifiers;

  IF v_live_count <> v_valid_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  RETURN v_sum;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_order_modifier_sum(BIGINT, BIGINT, JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pos_enrich_order_sides(
  p_tenant_id BIGINT,
  p_main_item_id BIGINT,
  p_sides JSONB
)
RETURNS TABLE (
  sides_sum NUMERIC(15,2),
  enriched_sides JSONB
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_raw_count   INT := 0;
  v_valid_count INT := 0;
  v_live_count  INT := 0;
BEGIN
  IF p_sides IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC(15,2), '[]'::JSONB;
    RETURN;
  END IF;

  IF jsonb_typeof(p_sides) <> 'array' THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  v_raw_count := jsonb_array_length(p_sides);
  IF v_raw_count = 0 THEN
    RETURN QUERY SELECT 0::NUMERIC(15,2), '[]'::JSONB;
    RETURN;
  END IF;

  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  )
  SELECT COUNT(*)::INT INTO v_valid_count
  FROM side_input;

  IF v_valid_count <> v_raw_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  live_sides AS (
    SELECT 1
    FROM side_input si
    JOIN public.menu_item_available_sides mas
      ON mas.tenant_id = p_tenant_id
     AND mas.main_item_id = p_main_item_id
     AND mas.side_item_id = si.side_item_id
    JOIN public.menu_items mi
      ON mi.id = si.side_item_id
     AND mi.tenant_id = p_tenant_id
     AND mi.is_active = TRUE
  )
  SELECT COUNT(*)::INT INTO v_live_count
  FROM live_sides;

  IF v_live_count <> v_valid_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  live_sides AS (
    SELECT
      mi.id,
      mi.name,
      mi.base_price,
      mas.is_default,
      si.quantity
    FROM side_input si
    JOIN public.menu_item_available_sides mas
      ON mas.tenant_id = p_tenant_id
     AND mas.main_item_id = p_main_item_id
     AND mas.side_item_id = si.side_item_id
    JOIN public.menu_items mi
      ON mi.id = si.side_item_id
     AND mi.tenant_id = p_tenant_id
     AND mi.is_active = TRUE
  )
  SELECT
    COALESCE(SUM(base_price * quantity), 0)::NUMERIC(15,2),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'side_item_id', id,
          'name', name,
          'price', base_price,
          'quantity', quantity,
          'is_default', is_default
        )
        ORDER BY name
      ),
      '[]'::JSONB
    )
  FROM live_sides;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_enrich_order_sides(BIGINT, BIGINT, JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id         BIGINT,
  p_branch_id         BIGINT,
  p_created_by        UUID,
  p_items             JSONB,
  p_order_type        TEXT    DEFAULT 'dine_in',
  p_table_id          BIGINT  DEFAULT NULL,
  p_pos_session_id    BIGINT  DEFAULT NULL,
  p_customer_count    INT     DEFAULT 1,
  p_note              TEXT    DEFAULT NULL,
  p_idempotency_key   UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    PERFORM 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF p_branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
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
    last_seq = public.order_daily_counters.last_seq + 1,
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
$$;

REVOKE ALL ON FUNCTION public.create_order(
  BIGINT, BIGINT, UUID, JSONB, TEXT, BIGINT, BIGINT, INTEGER, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(
  BIGINT, BIGINT, UUID, JSONB, TEXT, BIGINT, BIGINT, INTEGER, TEXT, UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.append_order_items(
  p_order_id        BIGINT,
  p_items           JSONB,
  p_idempotency_key UUID DEFAULT NULL
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
  v_order           RECORD;
  v_item            JSONB;
  v_base_price      NUMERIC(15,2);
  v_variant_adj     NUMERIC(15,2);
  v_modifier_sum    NUMERIC(15,2);
  v_sides_sum       NUMERIC(15,2);
  v_enriched_sides  JSONB;
  v_unit_price      NUMERIC(15,2);
  v_item_subtotal   NUMERIC(15,2);
  v_menu_item_id    BIGINT;
  v_variant_id      BIGINT;
  v_quantity        INT;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_total_amount    NUMERIC(15,2);
  v_note_parts      TEXT[] := ARRAY[]::TEXT[];
  v_item_name       TEXT;
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

  PERFORM pg_advisory_xact_lock(p_order_id);

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id
        AND request_key = p_idempotency_key
      LIMIT 1
    ) THEN
      SELECT o.subtotal, o.total_amount
      INTO v_subtotal, v_total_amount
      FROM public.orders o
      WHERE o.id = p_order_id;

      RETURN jsonb_build_object(
        'success',      TRUE,
        'order_id',     p_order_id,
        'added_count',  0,
        'subtotal',     COALESCE(v_subtotal, 0),
        'total_amount', COALESCE(v_total_amount, 0),
        'idempotent',   TRUE
      );
    END IF;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.service_charge,
         o.discount_type, o.discount_value
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'order not appendable' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order not appendable' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT base_price INTO v_base_price
    FROM public.menu_items
    WHERE id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
    INTO v_sides_sum, v_enriched_sides
    FROM public.pos_enrich_order_sides(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'sides', '[]'::JSONB)
    );

    v_unit_price := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
    v_item_subtotal := v_unit_price * v_quantity;

    v_item_name := v_item ->> 'item_name';
    IF v_item_name IS NOT NULL AND length(trim(v_item_name)) > 0 THEN
      v_note_parts := array_append(v_note_parts, v_item_name);
    END IF;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note, status, request_key
    )
    VALUES (
      v_order.tenant_id, p_order_id, v_menu_item_id, v_variant_id,
      COALESCE(v_item ->> 'item_name', 'Mon'),
      v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_enriched_sides, '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note', 'pending',
      p_idempotency_key
    );
  END LOOP;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id AND status <> 'cancelled';

  v_discount_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal
  );

  v_total_amount := v_subtotal
                  + COALESCE(v_order.service_charge, 0)
                  - v_discount_amount;

  UPDATE public.orders o
  SET
    subtotal        = v_subtotal,
    tax_amount      = 0,
    discount_amount = v_discount_amount,
    total_amount    = v_total_amount,
    updated_at      = now()
  WHERE o.id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    'items_added: ' || COALESCE(array_to_string(v_note_parts, ', '), 'items')
  );

  PERFORM public.route_order_to_kds(p_order_id);

  RETURN jsonb_build_object(
    'success',      TRUE,
    'order_id',     p_order_id,
    'added_count',  jsonb_array_length(p_items),
    'subtotal',     v_subtotal,
    'total_amount', v_total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_order_items(BIGINT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_order_items(BIGINT, JSONB, UUID) TO authenticated;

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
  v_uid            UUID;
  v_prof_tenant    BIGINT;
  v_prof_branch    BIGINT;
  v_prof_role      TEXT;
  v_item           public.order_items%ROWTYPE;
  v_order          public.orders%ROWTYPE;
  v_menu_active    BOOLEAN;
  v_base_price     NUMERIC(15,2);
  v_variant_adj    NUMERIC(15,2) := 0;
  v_modifier_sum   NUMERIC(15,2) := 0;
  v_sides_sum      NUMERIC(15,2) := 0;
  v_enriched_sides JSONB := '[]'::JSONB;
  v_new_unit       NUMERIC(15,2);
  v_old_qty        INT;
  v_old_unit       NUMERIC(15,2);
  v_new_subtotal   NUMERIC(15,2);
  v_subtotal_sum   NUMERIC(15,2);
  v_disc_amount    NUMERIC(15,2);
  v_total_amount   NUMERIC(15,2);
  v_flag_enabled   TEXT;
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

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_edit_pending_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = '22023';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'item not editable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT base_price, is_active
  INTO v_base_price, v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT price_adjustment INTO v_variant_adj
    FROM public.menu_item_variants
    WHERE id = p_variant_id
      AND item_id = v_item.menu_item_id
      AND tenant_id = v_order.tenant_id
      AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'variant inactive' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_variant_adj := 0;
  END IF;

  v_modifier_sum := public.pos_order_modifier_sum(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_modifiers, '[]'::JSONB)
  );

  SELECT sides_sum, enriched_sides
  INTO v_sides_sum, v_enriched_sides
  FROM public.pos_enrich_order_sides(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_sides, '[]'::JSONB)
  );

  v_new_unit := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);

  v_old_qty := v_item.quantity;
  v_old_unit := v_item.unit_price;
  v_new_subtotal := v_new_unit * p_quantity;

  UPDATE public.order_items
  SET variant_id   = p_variant_id,
      variant_name = NULLIF(p_variant_name, ''),
      unit_price   = v_new_unit,
      modifiers    = COALESCE(p_modifiers, '[]'::JSONB),
      sides        = COALESCE(v_enriched_sides, '[]'::JSONB),
      note         = NULLIF(trim(COALESCE(p_note, '')), ''),
      quantity     = p_quantity,
      subtotal     = v_new_subtotal,
      updated_at   = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

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
    'edit_item ' || p_order_item_id::TEXT
      || ': qty ' || v_old_qty::TEXT || '->' || p_quantity::TEXT
      || ', unit ' || v_old_unit::TEXT || '->' || v_new_unit::TEXT
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
