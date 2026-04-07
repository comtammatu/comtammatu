-- =============================================================
-- S2 Hotfix: POS order submission can hang due to advisory lock
-- Use pg_try_advisory_xact_lock to fail fast instead of blocking.
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id      BIGINT,
  p_branch_id      BIGINT,
  p_created_by     UUID,           -- IGNORED — overridden with auth.uid()
  p_items          JSONB,
  p_order_type     TEXT    DEFAULT 'dine_in',
  p_table_id       BIGINT  DEFAULT NULL,
  p_pos_session_id BIGINT  DEFAULT NULL,
  p_customer_count INT     DEFAULT 1,
  p_note           TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_created_by    UUID;
  v_order_id      BIGINT;
  v_order_number  TEXT;
  v_subtotal      NUMERIC(15,2) := 0;
  v_seq           INT;
  v_item          JSONB;
  v_base_price    NUMERIC(15,2);
  v_variant_adj   NUMERIC(15,2);
  v_modifier_sum  NUMERIC(15,2);
  v_unit_price    NUMERIC(15,2);
  v_item_subtotal NUMERIC(15,2);
  v_menu_item_id  BIGINT;
  v_variant_id    BIGINT;
  v_quantity      INT;
BEGIN
  -- ── Override caller-supplied identity ────────────────────
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- ── Validate inputs ──────────────────────────────────────
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  -- ── Validate table belongs to branch ────────────────────
  IF p_table_id IS NOT NULL THEN
    PERFORM 1 FROM public.tables
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ── Validate session belongs to branch and is open ───────
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

  -- ── Advisory lock — prevent order_number race condition ──
  -- IMPORTANT: do not block indefinitely. If another order is being created,
  -- fail fast so the POS UI can retry instead of hanging.
  IF NOT pg_try_advisory_xact_lock(p_branch_id) THEN
    RAISE EXCEPTION 'order_number_lock_busy' USING ERRCODE = '55P03';
  END IF;

  -- ── Generate order_number: {branch_id}-{YYMMDD}-{NNN} ───
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.orders
  WHERE branch_id = p_branch_id
    AND tenant_id = p_tenant_id
    AND created_at::date = CURRENT_DATE;

  v_order_number := p_branch_id::TEXT
    || '-' || to_char(CURRENT_DATE, 'YYMMDD')
    || '-' || lpad(v_seq::TEXT, 3, '0');

  -- ── Insert order header ──────────────────────────────────
  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    subtotal, total_amount, customer_count, note, created_by,
    pos_session_id
  )
  VALUES (
    p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
    0, 0, p_customer_count, p_note, v_created_by,
    p_pos_session_id
  )
  RETURNING id INTO v_order_id;

  -- ── Server-side price verification ───────────────────────
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

  -- ── Update order totals ──────────────────────────────────
  UPDATE public.orders
  SET subtotal = v_subtotal, total_amount = v_subtotal
  WHERE id = v_order_id;

  -- ── Insert initial status history ────────────────────────
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', v_created_by);

  -- ── Mark table occupied for dine-in ─────────────────────
  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
    SET status = 'occupied'
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ── Route to KDS ─────────────────────────────────────────
  PERFORM public.route_order_to_kds(v_order_id);

  RETURN jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number
  );
END;
$$;

-- Re-grant (signature unchanged)
GRANT EXECUTE ON FUNCTION public.create_order(BIGINT, BIGINT, UUID, JSONB, TEXT, BIGINT, BIGINT, INT, TEXT) TO authenticated;

