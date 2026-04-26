-- =============================================================
-- Security: lock down mv_top_items + mv_food_cost
-- =============================================================
-- Postgres RLS does NOT apply to materialized views (see regression
-- rule RLS-NOT-APPLIED-ON-MV). The earlier fix migration
-- 20260425030256_fix_mv_top_items_food_cost_dedup.sql restored a
-- direct `GRANT SELECT TO authenticated` on both MVs, which lets any
-- logged-in client cross-tenant / cross-branch read revenue and
-- food-cost rows via PostgREST `/rest/v1/mv_*?select=*`.
--
-- Fix:
--   1. REVOKE all SELECT from anon / authenticated.
--   2. Expose access via SECURITY DEFINER wrappers that re-check
--      tenant_id (from JWT-backed profile), branch_id, and the
--      `finance:view` permission via has_permission().
--   3. Server actions switch from `.from("mv_*")` to `.rpc("get_*")`.
--
-- Owner bypass is automatic via has_permission() — owners always pass.

REVOKE SELECT ON public.mv_top_items FROM anon;
REVOKE SELECT ON public.mv_top_items FROM authenticated;
REVOKE SELECT ON public.mv_top_items FROM PUBLIC;

REVOKE SELECT ON public.mv_food_cost FROM anon;
REVOKE SELECT ON public.mv_food_cost FROM authenticated;
REVOKE SELECT ON public.mv_food_cost FROM PUBLIC;


-- ─── Top items wrapper ───
-- Mirrors fetchTopItems(branchId, periodStart) shape.
CREATE OR REPLACE FUNCTION public.get_top_items(
  p_branch_id BIGINT,
  p_period_start DATE,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  branch_id BIGINT,
  tenant_id BIGINT,
  menu_item_id BIGINT,
  item_name TEXT,
  quantity_sold NUMERIC,
  revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_effective_limit INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  v_effective_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));

  RETURN QUERY
    SELECT
      m.period_start,
      m.period_end,
      m.branch_id,
      m.tenant_id,
      m.menu_item_id,
      m.item_name,
      m.quantity_sold,
      m.revenue
    FROM public.mv_top_items m
    WHERE m.tenant_id = v_tenant
      AND m.branch_id = p_branch_id
      AND m.period_start = p_period_start
    ORDER BY m.quantity_sold DESC
    LIMIT v_effective_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) TO authenticated;


-- ─── Food cost wrapper ───
-- Mirrors fetchFoodCost(branchId, startDate, endDate) shape.
CREATE OR REPLACE FUNCTION public.get_food_cost(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  branch_id BIGINT,
  tenant_id BIGINT,
  menu_item_id BIGINT,
  item_name TEXT,
  quantity_sold NUMERIC,
  revenue NUMERIC,
  ingredient_cost NUMERIC,
  food_cost_pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      m.period_start,
      m.period_end,
      m.branch_id,
      m.tenant_id,
      m.menu_item_id,
      m.item_name,
      m.quantity_sold,
      m.revenue,
      m.ingredient_cost,
      m.food_cost_pct
    FROM public.mv_food_cost m
    WHERE m.tenant_id = v_tenant
      AND m.branch_id = p_branch_id
      AND m.period_start >= p_start_date
      AND m.period_start <= p_end_date
    ORDER BY m.food_cost_pct DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_food_cost(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_food_cost(BIGINT, DATE, DATE) TO authenticated;
