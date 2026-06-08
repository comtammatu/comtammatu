-- =============================================================
-- M3-B4: Code Review Fixes
-- C1: Serialize concurrent check_order_ready via FOR UPDATE
-- H3: Atomic save_station_categories RPC
-- M3: Branch-scope kds_stations SELECT
-- =============================================================

-- ─── C1: check_order_ready — lock order row to prevent duplicate history ───

CREATE OR REPLACE FUNCTION public.check_order_ready(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_pending_count INT;
  v_current_status TEXT;
BEGIN
  -- Lock the order row first to serialize concurrent bump calls
  SELECT status INTO v_current_status
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Already in terminal state — nothing to do
  IF v_current_status IN ('ready', 'served', 'completed', 'cancelled') THEN
    RETURN;
  END IF;

  -- Count non-ready tickets (tenant-scoped)
  SELECT COUNT(*) INTO v_pending_count
  FROM public.kds_tickets
  WHERE order_id = p_order_id
    AND tenant_id = public.auth_tenant_id()
    AND status NOT IN ('ready', 'served');

  -- All tickets ready → transition order
  IF v_pending_count = 0 THEN
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
END;
$$;


-- ─── H3: Atomic save_station_categories RPC ─��─

CREATE OR REPLACE FUNCTION public.save_station_categories(
  p_station_id BIGINT,
  p_category_ids BIGINT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_station RECORD;
  v_cat_id BIGINT;
BEGIN
  -- Verify station ownership
  SELECT id, tenant_id, branch_id INTO v_station
  FROM public.kds_stations
  WHERE id = p_station_id
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found' USING ERRCODE = 'P0002';
  END IF;

  -- Delete existing assignments
  DELETE FROM public.kds_station_categories
  WHERE station_id = p_station_id
    AND tenant_id = v_station.tenant_id;

  -- Insert new assignments
  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO public.kds_station_categories (tenant_id, station_id, category_id)
    SELECT v_station.tenant_id, p_station_id, unnest(p_category_ids)
    ON CONFLICT (station_id, category_id, tenant_id) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_station_categories(BIGINT, BIGINT[]) TO authenticated;


-- ─── M3: Branch-scope kds_stations SELECT ───

DROP POLICY IF EXISTS "tenant_select" ON public.kds_stations;
CREATE POLICY "tenant_select" ON public.kds_stations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );

-- Same for kds_station_categories (join to station for branch check)
DROP POLICY IF EXISTS "tenant_select" ON public.kds_station_categories;
CREATE POLICY "tenant_select" ON public.kds_station_categories
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR station_id IN (
        SELECT id FROM public.kds_stations
        WHERE branch_id = public.auth_branch_id()
          AND tenant_id = public.auth_tenant_id()
      )
    )
  );
