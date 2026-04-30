-- =============================================================
-- KDS routing — last-resort fallback to any active station
-- =============================================================
-- Bug: route_order_to_kds (added in 20260407110000_kds_tickets.sql,
-- hardened in 20260407130000_kds_security_hardening.sql) silently
-- skips an order_item when:
--   1. The item's menu_items.category_id is NOT mapped to any active
--      kds_stations via kds_station_categories, AND
--   2. The branch has NO "fallback" station (a station with zero
--      kds_station_categories rows).
--
-- Production symptom (2026-04-30): POS creates orders successfully
-- but kds_tickets stays empty for the branch — chefs see an empty
-- KDS board while orders accumulate on POS. create_order /
-- append_order_items return success because the silent skip happens
-- inside route_order_to_kds where `IF v_station_id IS NOT NULL` gates
-- the INSERT. No error raised, no audit row written.
--
-- Fix: add a third-tier fallback. When neither category-match nor
-- zero-mapped fallback station exists, route to ANY active station
-- of the branch (lowest position). Kitchen-facing principle: surface
-- the ticket somewhere so chef sees the work, even if station setup
-- is incomplete. Wrong-station mis-routing is recoverable; silent
-- drop is not.
--
-- Plus: a one-shot RPC to backfill missing tickets for orders that
-- are still active so production can recover the in-flight queue
-- without forcing cashiers to re-enter every open order.
-- =============================================================

CREATE OR REPLACE FUNCTION public.route_order_to_kds(p_order_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order                  RECORD;
  v_item                   RECORD;
  v_station_id             BIGINT;
  v_fallback_station_id    BIGINT;
  v_last_resort_station_id BIGINT;
BEGIN
  -- Tenant-scope the order lookup (same as 20260407130000).
  SELECT tenant_id, branch_id INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Tier 2: a station with zero category mappings.
  SELECT s.id INTO v_fallback_station_id
  FROM public.kds_stations s
  LEFT JOIN public.kds_station_categories sc ON sc.station_id = s.id
  WHERE s.branch_id = v_order.branch_id
    AND s.tenant_id = v_order.tenant_id
    AND s.is_active = true
    AND sc.id IS NULL
  ORDER BY s.position
  LIMIT 1;

  -- Tier 3: any active station for the branch (lowest position).
  SELECT s.id INTO v_last_resort_station_id
  FROM public.kds_stations s
  WHERE s.branch_id = v_order.branch_id
    AND s.tenant_id = v_order.tenant_id
    AND s.is_active = true
  ORDER BY s.position
  LIMIT 1;

  FOR v_item IN
    SELECT oi.id AS order_item_id, mi.category_id
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = p_order_id
  LOOP
    -- Tier 1: station mapped to the item's category.
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

    IF v_station_id IS NULL THEN
      v_station_id := v_last_resort_station_id;
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

COMMENT ON FUNCTION public.route_order_to_kds(BIGINT) IS
  'Routes order_items to KDS stations. Three-tier fallback: '
  '1) station mapped to item category, '
  '2) zero-mapped "fallback" station, '
  '3) any active station for the branch. '
  'Final tier prevents silent drops when station setup is incomplete '
  '(see regression rule KDS-ROUTE-NEVER-SILENT-DROP).';


-- ─── Backfill RPC ─────────────────────────────────────────────────
-- One-shot recovery: re-route active orders missing kds_tickets after
-- a station-misconfiguration outage. Idempotent (route_order_to_kds
-- uses ON CONFLICT DO NOTHING). branch_manager+ only.
--
-- Usage (psql / Supabase SQL editor):
--   SELECT public.backfill_missing_kds_tickets(<branch_id>);
-- Returns {orders_repaired, tickets_before, tickets_after, tickets_added}.

CREATE OR REPLACE FUNCTION public.backfill_missing_kds_tickets(
  p_branch_id BIGINT
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
  v_order_id        BIGINT;
  v_orders_repaired INT := 0;
  v_tickets_before  INT;
  v_tickets_after   INT;
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

  IF v_prof_role NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role = 'branch_manager'
     AND v_prof_branch IS DISTINCT FROM p_branch_id
  THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches b
  WHERE b.id = p_branch_id AND b.tenant_id = v_prof_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_tickets_before
  FROM public.kds_tickets
  WHERE branch_id = p_branch_id AND tenant_id = v_prof_tenant;

  FOR v_order_id IN
    SELECT DISTINCT o.id
    FROM public.orders o
    WHERE o.branch_id = p_branch_id
      AND o.tenant_id = v_prof_tenant
      AND o.status NOT IN ('completed', 'cancelled')
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi
        WHERE oi.order_id = o.id
          AND oi.status <> 'cancelled'
          AND NOT EXISTS (
            SELECT 1 FROM public.kds_tickets kt
            WHERE kt.order_item_id = oi.id
          )
      )
  LOOP
    PERFORM public.route_order_to_kds(v_order_id);
    v_orders_repaired := v_orders_repaired + 1;
  END LOOP;

  SELECT COUNT(*) INTO v_tickets_after
  FROM public.kds_tickets
  WHERE branch_id = p_branch_id AND tenant_id = v_prof_tenant;

  RETURN jsonb_build_object(
    'orders_repaired', v_orders_repaired,
    'tickets_before',  v_tickets_before,
    'tickets_after',   v_tickets_after,
    'tickets_added',   v_tickets_after - v_tickets_before
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_missing_kds_tickets(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_missing_kds_tickets(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.backfill_missing_kds_tickets(BIGINT) IS
  'One-shot recovery: re-route active orders missing kds_tickets after '
  'a station-misconfiguration outage. Idempotent. branch_manager+ only. '
  'Run after fixing kds_stations setup (or after deploying the three-tier '
  'fallback in 20260511000000) to clear the in-flight backlog.';
