-- =============================================================
-- A1: P0 Security Fixes
-- 1. create_order: server-side price re-fetch (price integrity)
-- 2. set_tenant: role check (owner/super_manager only)
-- 3. close_pos_session: branch ownership filter
-- =============================================================

-- ─── FIX 1: create_order — server-side price verification ───

CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_created_by UUID,
  p_items JSONB,
  p_order_type TEXT DEFAULT 'dine_in',
  p_table_id BIGINT DEFAULT NULL,
  p_pos_session_id BIGINT DEFAULT NULL,
  p_customer_count INT DEFAULT 1,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order_id BIGINT;
  v_order_number TEXT;
  v_subtotal NUMERIC(15,2) := 0;
  v_seq INT;
  v_item JSONB;
  v_base_price NUMERIC(15,2);
  v_variant_adj NUMERIC(15,2);
  v_modifier_sum NUMERIC(15,2);
  v_unit_price NUMERIC(15,2);
  v_item_subtotal NUMERIC(15,2);
  v_menu_item_id BIGINT;
  v_variant_id BIGINT;
  v_quantity INT;
BEGIN
  -- Validate inputs
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  -- Validate table belongs to branch
  IF p_table_id IS NOT NULL THEN
    PERFORM 1 FROM public.tables
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Validate session belongs to branch and is open
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

  -- Advisory lock to prevent order_number race condition
  PERFORM pg_advisory_xact_lock(p_branch_id);

  -- Generate order_number: {branch_id}-{YYMMDD}-{NNN}
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.orders
  WHERE branch_id = p_branch_id
    AND tenant_id = p_tenant_id
    AND created_at::date = CURRENT_DATE;

  v_order_number := p_branch_id::TEXT
    || '-' || to_char(CURRENT_DATE, 'YYMMDD')
    || '-' || lpad(v_seq::TEXT, 3, '0');

  -- Insert order (subtotal updated after items are inserted)
  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    subtotal, total_amount, customer_count, note, created_by,
    pos_session_id
  )
  VALUES (
    p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
    0, 0, p_customer_count, p_note, p_created_by,
    p_pos_session_id
  )
  RETURNING id INTO v_order_id;

  -- ── SERVER-SIDE PRICE VERIFICATION ──
  -- Insert each item with prices re-fetched from canonical menu data.
  -- Client-provided unit_price and subtotal are IGNORED.

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id := (v_item ->> 'variant_id')::BIGINT;
    v_quantity := (v_item ->> 'quantity')::INT;

    -- Fetch base price from menu_items
    SELECT base_price INTO v_base_price
    FROM public.menu_items
    WHERE id = v_menu_item_id
      AND tenant_id = p_tenant_id
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Fetch variant price adjustment
    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id
        AND item_id = v_menu_item_id
        AND tenant_id = p_tenant_id
        AND is_active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id
          USING ERRCODE = 'P0002';
      END IF;
    END IF;

    -- Sum modifier prices from canonical DB data
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

    -- Compute verified price
    v_unit_price := v_base_price + v_variant_adj + v_modifier_sum;
    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;

    -- Insert order item with server-verified prices
    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note
    )
    VALUES (
      p_tenant_id,
      v_order_id,
      v_menu_item_id,
      v_variant_id,
      v_item ->> 'item_name',
      v_item ->> 'variant_name',
      v_quantity,
      v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_item -> 'sides', '[]'::JSONB),
      v_item_subtotal,
      v_item ->> 'note'
    );
  END LOOP;

  -- Update order totals with server-computed subtotal
  UPDATE public.orders
  SET subtotal = v_subtotal,
      total_amount = v_subtotal
  WHERE id = v_order_id;

  -- Insert initial status history
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (
    p_tenant_id, v_order_id, NULL, 'new', p_created_by
  );

  -- Mark table as occupied for dine-in orders
  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
    SET status = 'occupied'
    WHERE id = p_table_id
      AND branch_id = p_branch_id
      AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

-- Re-grant (signature unchanged)
GRANT EXECUTE ON FUNCTION public.create_order(BIGINT, BIGINT, UUID, JSONB, TEXT, BIGINT, BIGINT, INT, TEXT) TO authenticated;


-- ─── FIX 2: set_tenant — add role check ───

CREATE OR REPLACE FUNCTION public.set_tenant(p_branch_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Only owner and super_manager can change tenant
  IF public.auth_role() NOT IN ('owner', 'super_manager') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0003';
  END IF;

  -- Unset current tenant and set new one in a single transaction
  UPDATE public.branches
    SET is_tenant = (id = p_branch_id)
    WHERE tenant_id = public.auth_tenant_id()
      AND (is_tenant = true OR id = p_branch_id);
END;
$$;


-- ─── FIX 3: close_pos_session — add branch + tenant ownership filter ───

CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id BIGINT,
  p_closing_cash NUMERIC(15,2),
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_session RECORD;
  v_expected_cash NUMERIC(15,2);
  v_cash_difference NUMERIC(15,2);
  v_order_count INT;
  v_closed_by UUID;
BEGIN
  -- Validate closing_cash
  IF p_closing_cash IS NULL OR p_closing_cash < 0 THEN
    RAISE EXCEPTION 'closing_cash must be non-negative' USING ERRCODE = '22023';
  END IF;

  -- Use auth.uid() for closed_by
  v_closed_by := auth.uid();

  -- Lock and fetch the session — SCOPED TO CALLER'S BRANCH + TENANT
  SELECT id, tenant_id, branch_id, opening_cash, opened_at, status
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id
    AND branch_id = public.auth_branch_id()
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session is already closed' USING ERRCODE = 'P0001';
  END IF;

  -- Calculate expected cash: opening_cash + total revenue from non-cancelled orders
  SELECT
    COUNT(*),
    COALESCE(SUM(total_amount), 0)
  INTO v_order_count, v_expected_cash
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND status NOT IN ('cancelled');

  v_expected_cash := v_session.opening_cash + v_expected_cash;
  v_cash_difference := p_closing_cash - v_expected_cash;

  -- Close the session
  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_closed_by,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    note = p_note
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'opening_cash', v_session.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', v_expected_cash,
    'cash_difference', v_cash_difference,
    'order_count', v_order_count,
    'opened_at', v_session.opened_at,
    'closed_at', now()
  );
END;
$$;
