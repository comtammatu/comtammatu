-- =============================================================
-- M3-S2: KDS Tickets + Routing RPC + Realtime
-- =============================================================

-- ─── kds_tickets ───

CREATE TABLE public.kds_tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  station_id BIGINT NOT NULL REFERENCES public.kds_stations(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id BIGINT NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'ready', 'served')),
  bumped_at TIMESTAMPTZ,
  bumped_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_item_id, station_id, tenant_id)
);

CREATE INDEX idx_kds_tickets_branch ON public.kds_tickets(branch_id);
CREATE INDEX idx_kds_tickets_station ON public.kds_tickets(station_id);
CREATE INDEX idx_kds_tickets_order ON public.kds_tickets(order_id);
CREATE INDEX idx_kds_tickets_status ON public.kds_tickets(branch_id, station_id, status);

CREATE TRIGGER trg_kds_tickets_updated_at
  BEFORE UPDATE ON public.kds_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.kds_tickets ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant-scoped, branch-scoped for branch-level roles
CREATE POLICY "tenant_select" ON public.kds_tickets
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL  -- tenant-wide roles (owner, super_manager, area_manager)
      OR branch_id = public.auth_branch_id()  -- branch-scoped roles (chef, branch_manager)
    )
  );

-- INSERT: only roles that create orders (via create_order → route_order_to_kds)
CREATE POLICY "rpc_insert" ON public.kds_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('cashier', 'waiter', 'branch_manager', 'owner', 'super_manager', 'area_manager')
  );

-- UPDATE: chef + management roles, branch-scoped
CREATE POLICY "kds_update" ON public.kds_tickets
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('chef', 'branch_manager', 'owner', 'super_manager', 'area_manager')
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('chef', 'branch_manager', 'owner', 'super_manager', 'area_manager')
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kds_tickets TO authenticated;

-- ─── Enable Supabase Realtime ───

ALTER PUBLICATION supabase_realtime ADD TABLE public.kds_tickets;


-- ─── route_order_to_kds RPC ───
-- Routes order items to KDS stations based on category mapping.
-- Items whose category has no station mapping go to a "fallback" station
-- (a station with zero category assignments). If no fallback exists, item is skipped.

CREATE OR REPLACE FUNCTION public.route_order_to_kds(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_station_id BIGINT;
  v_fallback_station_id BIGINT;
BEGIN
  -- Fetch order metadata — scoped to caller's tenant
  SELECT tenant_id, branch_id INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RETURN; -- silently skip if order doesn't exist or wrong tenant
  END IF;

  -- Find fallback station (a station with zero category assignments)
  SELECT s.id INTO v_fallback_station_id
  FROM public.kds_stations s
  LEFT JOIN public.kds_station_categories sc ON sc.station_id = s.id
  WHERE s.branch_id = v_order.branch_id
    AND s.tenant_id = v_order.tenant_id
    AND s.is_active = true
    AND sc.id IS NULL
  ORDER BY s.position
  LIMIT 1;

  -- Route each order item to the appropriate station
  FOR v_item IN
    SELECT oi.id AS order_item_id, mi.category_id
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = p_order_id
  LOOP
    -- Find station for this item's category
    SELECT sc.station_id INTO v_station_id
    FROM public.kds_station_categories sc
    JOIN public.kds_stations s ON s.id = sc.station_id
    WHERE sc.category_id = v_item.category_id
      AND s.branch_id = v_order.branch_id
      AND s.tenant_id = v_order.tenant_id
      AND s.is_active = true
    LIMIT 1;

    -- Use fallback if no specific station found
    IF v_station_id IS NULL THEN
      v_station_id := v_fallback_station_id;
    END IF;

    -- Insert ticket if a station was found
    IF v_station_id IS NOT NULL THEN
      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_station_id,
        p_order_id, v_item.order_item_id
      )
      ON CONFLICT (order_item_id, station_id, tenant_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.route_order_to_kds(BIGINT) TO authenticated;


-- ─── Modify create_order to auto-route to KDS ───

-- We add a call to route_order_to_kds at the end of create_order.
-- Re-create the full function with the routing call added before RETURN.

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

  -- Insert order (subtotal updated after items)
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

  -- Server-side price verification: re-fetch prices from canonical menu data
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id := (v_item ->> 'variant_id')::BIGINT;
    v_quantity := (v_item ->> 'quantity')::INT;

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

    v_unit_price := v_base_price + v_variant_adj + v_modifier_sum;
    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;

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

  -- Update order totals
  UPDATE public.orders
  SET subtotal = v_subtotal, total_amount = v_subtotal
  WHERE id = v_order_id;

  -- Insert initial status history
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', p_created_by);

  -- Mark table as occupied for dine-in orders
  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
    SET status = 'occupied'
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Route order items to KDS stations
  PERFORM public.route_order_to_kds(v_order_id);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(BIGINT, BIGINT, UUID, JSONB, TEXT, BIGINT, BIGINT, INT, TEXT) TO authenticated;
