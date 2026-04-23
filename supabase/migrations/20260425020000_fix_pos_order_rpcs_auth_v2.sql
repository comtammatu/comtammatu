-- =============================================================
-- Hotfix: Auth v2 dropped profiles.role (migration
-- 20260423030000_auth_v2_m5_drop_legacy) but 6 POS order RPCs
-- still read p.role::text, crashing with
--   ERROR 42703: column p.role does not exist
-- on every POS order create / append / void / cancel /
-- transfer / status update.
--
-- Fix: resolve legacy role via profiles.position_id → positions.legacy_role_code
-- (same pattern used by admin_update_profile and other post-M5 RPCs).
-- All other RPC logic is identical to prior migrations:
--   - create_order        from 20260423130000_order_number_tc_mv_format
--   - append_order_items  from 20260409100000_m2_pos_order_lifecycle
--   - void_order_item     from 20260413000000_fix_void_cancel_branch_scope
--   - cancel_order        from 20260413000000_fix_void_cancel_branch_scope
--   - transfer_order_table from 20260409100000_m2_pos_order_lifecycle
--   - update_pos_order_status from 20260409100000_m2_pos_order_lifecycle
-- =============================================================

-- ── 1. create_order ──
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
  v_subtotal         NUMERIC(15,2) := 0;
  v_seq              INT;
  v_table_number     INT;
  v_item             JSONB;
  v_base_price       NUMERIC(15,2);
  v_variant_adj      NUMERIC(15,2);
  v_modifier_sum     NUMERIC(15,2);
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
    tenant_id, branch_id, counter_date, order_type, last_seq
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    p_order_type,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date, order_type)
  DO UPDATE SET
    last_seq = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  IF p_order_type = 'dine_in' THEN
    IF v_table_number IS NOT NULL THEN
      v_order_number := 'TC-BAN' || v_table_number::TEXT || '-' || lpad(v_seq::TEXT, 3, '0');
    ELSE
      v_order_number := 'TC-' || lpad(v_seq::TEXT, 3, '0');
    END IF;
  ELSE
    v_order_number := 'MV-' || lpad(v_seq::TEXT, 3, '0');
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
    v_variant_id   := (v_item ->> 'variant_id')::BIGINT;
    v_quantity     := (v_item ->> 'quantity')::INT;

    SELECT base_price INTO v_base_price
    FROM public.menu_items
    WHERE id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := 0;
    IF v_item -> 'modifiers' IS NOT NULL
       AND jsonb_typeof(v_item -> 'modifiers') = 'array'
       AND jsonb_array_length(v_item -> 'modifiers') > 0
    THEN
      SELECT COALESCE(SUM(m.price), 0) INTO v_modifier_sum
      FROM jsonb_array_elements(v_item -> 'modifiers') AS mod_el
      JOIN public.menu_item_modifiers m
        ON m.id = (mod_el ->> 'modifier_id')::BIGINT
       AND m.item_id = v_menu_item_id
       AND m.tenant_id = p_tenant_id
       AND m.is_active = true;
    END IF;

    v_unit_price    := v_base_price + v_variant_adj + v_modifier_sum;
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
      COALESCE(v_item -> 'sides', '[]'::JSONB),
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


-- ── 2. append_order_items ──
CREATE OR REPLACE FUNCTION public.append_order_items(
  p_order_id BIGINT,
  p_items JSONB
)
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
  v_order RECORD;
  v_item JSONB;
  v_base_price NUMERIC(15,2);
  v_variant_adj NUMERIC(15,2);
  v_modifier_sum NUMERIC(15,2);
  v_unit_price NUMERIC(15,2);
  v_item_subtotal NUMERIC(15,2);
  v_menu_item_id BIGINT;
  v_variant_id BIGINT;
  v_quantity INT;
  v_subtotal NUMERIC(15,2);
  v_note_parts TEXT[] := ARRAY[]::TEXT[];
  v_item_name TEXT;
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

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.service_charge, o.discount_amount
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

  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready') THEN
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
    WHERE id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := 0;
    IF v_item -> 'modifiers' IS NOT NULL
       AND jsonb_typeof(v_item -> 'modifiers') = 'array'
       AND jsonb_array_length(v_item -> 'modifiers') > 0
    THEN
      SELECT COALESCE(SUM(m.price), 0) INTO v_modifier_sum
      FROM jsonb_array_elements(v_item -> 'modifiers') AS mod_el
      JOIN public.menu_item_modifiers m
        ON m.id = (mod_el ->> 'modifier_id')::BIGINT
       AND m.item_id = v_menu_item_id
       AND m.tenant_id = v_order.tenant_id
       AND m.is_active = true;
    END IF;

    v_unit_price := v_base_price + v_variant_adj + v_modifier_sum;
    v_item_subtotal := v_unit_price * v_quantity;

    v_item_name := v_item ->> 'item_name';
    IF v_item_name IS NOT NULL AND length(trim(v_item_name)) > 0 THEN
      v_note_parts := array_append(v_note_parts, v_item_name);
    END IF;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note, status
    )
    VALUES (
      v_order.tenant_id, p_order_id, v_menu_item_id, v_variant_id,
      COALESCE(v_item ->> 'item_name', 'Món'),
      v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_item -> 'sides', '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note', 'pending'
    );
  END LOOP;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id AND status <> 'cancelled';

  UPDATE public.orders o
  SET
    subtotal = v_subtotal,
    tax_amount = 0,
    total_amount = v_subtotal + COALESCE(o.service_charge, 0) - COALESCE(o.discount_amount, 0),
    updated_at = now()
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
    'order_id', p_order_id,
    'subtotal', v_subtotal,
    'tax_amount', 0,
    'total_amount', (SELECT total_amount FROM public.orders WHERE id = p_order_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_order_items(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_order_items(BIGINT, JSONB) TO authenticated;


-- ── 3. void_order_item ──
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
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_item RECORD;
  v_order RECORD;
  v_subtotal NUMERIC(15,2);
  v_all_cancelled BOOLEAN;
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

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'super_manager', 'branch_manager') THEN
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

  IF v_prof_branch IS NOT NULL AND v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not voidable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled', updated_at = now()
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
    UPDATE public.orders
    SET
      status = 'cancelled',
      subtotal = 0,
      total_amount = 0 + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
      updated_at = now()
    WHERE id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, 'cancelled', v_uid,
      'auto_cancel_all_items_voided: ' || p_reason
    );
  ELSE
    UPDATE public.orders o
    SET
      subtotal = v_subtotal,
      total_amount = v_subtotal + COALESCE(o.service_charge, 0) - COALESCE(o.discount_amount, 0),
      updated_at = now()
    WHERE o.id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
      'void_item ' || p_order_item_id::text || ': ' || p_reason
    );
  END IF;

  RETURN jsonb_build_object('order_id', v_item.order_id, 'auto_cancelled_order', v_all_cancelled);
END;
$$;

REVOKE ALL ON FUNCTION public.void_order_item(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_order_item(BIGINT, TEXT) TO authenticated;


-- ── 4. cancel_order ──
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
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
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

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'super_manager', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, table_id, order_type
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

  IF v_prof_branch IS NOT NULL AND v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND status <> 'cancelled';

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND tenant_id = v_order.tenant_id;

  UPDATE public.orders
  SET
    status = 'cancelled',
    subtotal = 0,
    total_amount = 0 + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', v_uid, p_reason
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order(BIGINT, TEXT) TO authenticated;


-- ── 5. transfer_order_table ──
CREATE OR REPLACE FUNCTION public.transfer_order_table(
  p_order_id BIGINT,
  p_new_table_id BIGINT
)
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
  v_order RECORD;
  v_new_table RECORD;
  v_old_table_id BIGINT;
  v_active_on_old INT;
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

  SELECT id, tenant_id, branch_id, table_id, order_type, status
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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_order.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'takeaway cannot transfer' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_new_table
  FROM public.tables
  WHERE id = p_new_table_id AND branch_id = v_order.branch_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_new_table_id = v_order.table_id THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
  END IF;

  IF v_new_table.status <> 'available' THEN
    RAISE EXCEPTION 'table not available' USING ERRCODE = '22023';
  END IF;

  v_old_table_id := v_order.table_id;

  UPDATE public.orders
  SET table_id = p_new_table_id, updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_table_id AND tenant_id = v_order.tenant_id;

  IF v_old_table_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_active_on_old
    FROM public.orders
    WHERE table_id = v_old_table_id
      AND tenant_id = v_order.tenant_id
      AND id <> p_order_id
      AND status NOT IN ('completed', 'cancelled', 'served');

    IF v_active_on_old = 0 THEN
      UPDATE public.tables
      SET status = 'available', updated_at = now()
      WHERE id = v_old_table_id AND tenant_id = v_order.tenant_id;
    END IF;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'transfer_table -> ' || p_new_table_id::text
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_order_table(BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_order_table(BIGINT, BIGINT) TO authenticated;


-- ── 6. update_pos_order_status ──
CREATE OR REPLACE FUNCTION public.update_pos_order_status(
  p_order_id BIGINT,
  p_new_status TEXT
)
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
  v_order RECORD;
  v_bad_items INT;
  v_from_status TEXT;
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

  IF p_new_status NOT IN ('served', 'completed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status
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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_order.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_from_status := v_order.status;

  IF p_new_status = 'served' THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready') THEN
      RAISE EXCEPTION 'invalid transition to served' USING ERRCODE = '22023';
    END IF;
    UPDATE public.orders
    SET status = 'served', updated_at = now()
    WHERE id = p_order_id;
  ELSIF p_new_status = 'completed' THEN
    IF v_order.status <> 'served' THEN
      RAISE EXCEPTION 'complete requires served' USING ERRCODE = '22023';
    END IF;
    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');
    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;
    UPDATE public.orders
    SET status = 'completed', updated_at = now()
    WHERE id = p_order_id;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_from_status, p_new_status, v_uid, 'pos update'
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.update_pos_order_status(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_pos_order_status(BIGINT, TEXT) TO authenticated;
