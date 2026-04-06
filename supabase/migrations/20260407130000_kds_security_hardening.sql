-- =============================================================
-- M3-B4: KDS Security Hardening (post-CSO review)
-- Fixes: cross-tenant RPCs, cross-branch RLS, phantom ticket insertion
-- =============================================================

-- ─── FIX 1: kds_tickets RLS — add branch scoping to SELECT ───

DROP POLICY IF EXISTS "tenant_select" ON public.kds_tickets;
CREATE POLICY "tenant_select" ON public.kds_tickets
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL  -- tenant-wide roles
      OR branch_id = public.auth_branch_id()  -- branch-scoped roles
    )
  );

-- ─── FIX 2: kds_tickets RLS — add role restriction to INSERT ───

DROP POLICY IF EXISTS "rpc_insert" ON public.kds_tickets;
CREATE POLICY "rpc_insert" ON public.kds_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('cashier', 'waiter', 'branch_manager', 'owner', 'super_manager', 'area_manager')
  );

-- ─── FIX 3: kds_tickets RLS — add branch scoping to UPDATE ───

DROP POLICY IF EXISTS "kds_update" ON public.kds_tickets;
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

-- ─── FIX 4: route_order_to_kds — add tenant ownership check ───

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
    RETURN;
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
    SELECT sc.station_id INTO v_station_id
    FROM public.kds_station_categories sc
    JOIN public.kds_stations s ON s.id = sc.station_id
    WHERE sc.category_id = v_item.category_id
      AND s.branch_id = v_order.branch_id
      AND s.tenant_id = v_order.tenant_id
      AND s.is_active = true
    LIMIT 1;

    IF v_station_id IS NULL THEN
      v_station_id := v_fallback_station_id;
    END IF;

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

-- ─── FIX 5: check_order_ready — tenant-scoped + no public GRANT ───

CREATE OR REPLACE FUNCTION public.check_order_ready(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_pending_count INT;
  v_current_status TEXT;
BEGIN
  -- Count non-ready tickets (tenant-scoped)
  SELECT COUNT(*) INTO v_pending_count
  FROM public.kds_tickets
  WHERE order_id = p_order_id
    AND tenant_id = public.auth_tenant_id()
    AND status NOT IN ('ready', 'served');

  IF v_pending_count = 0 THEN
    SELECT status INTO v_current_status
    FROM public.orders
    WHERE id = p_order_id
      AND tenant_id = public.auth_tenant_id();

    IF NOT FOUND THEN
      RETURN;
    END IF;

    IF v_current_status NOT IN ('ready', 'served', 'completed', 'cancelled') THEN
      UPDATE public.orders
      SET status = 'ready'
      WHERE id = p_order_id
        AND tenant_id = public.auth_tenant_id();

      INSERT INTO public.order_status_history (
        tenant_id, order_id, from_status, to_status, changed_by
      )
      SELECT tenant_id, id, v_current_status, 'ready', auth.uid()
      FROM public.orders
      WHERE id = p_order_id
        AND tenant_id = public.auth_tenant_id();
    END IF;
  END IF;
END;
$$;

-- Revoke direct access — internal only (called from bump_kds_ticket)
REVOKE EXECUTE ON FUNCTION public.check_order_ready(BIGINT) FROM authenticated;
