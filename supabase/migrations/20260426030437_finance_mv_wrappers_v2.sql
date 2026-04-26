-- =============================================================
-- Finance MV wrappers v2 — fix two issues from Codex follow-up:
--   1. quantity_sold underlying type is BIGINT (SUM(integer)); the
--      wrappers declared NUMERIC, causing `supabase db lint` red.
--      Fix: cast m.quantity_sold::NUMERIC inside SELECT — keeps the
--      public RETURNS shape stable for callers.
--   2. Both UI consumers (finance/food-cost, inventory/reports) call
--      these without a specific branch — the wrappers required one.
--      Fix: make p_branch_id nullable (= "all branches caller has
--      access to"), use has_permission_any when NULL, otherwise
--      has_permission(branch, key).
-- =============================================================

-- DROP first because we are changing the parameter signature.
DROP FUNCTION IF EXISTS public.get_top_items(BIGINT, DATE, INT);
DROP FUNCTION IF EXISTS public.get_food_cost(BIGINT, DATE, DATE);


-- ─── Top items wrapper ───
CREATE OR REPLACE FUNCTION public.get_top_items(
  p_branch_id    BIGINT DEFAULT NULL,
  p_period_start DATE   DEFAULT NULL,
  p_limit        INT    DEFAULT 20
)
RETURNS TABLE (
  period_start  DATE,
  period_end    DATE,
  branch_id     BIGINT,
  tenant_id     BIGINT,
  menu_item_id  BIGINT,
  item_name     TEXT,
  quantity_sold NUMERIC,
  revenue       NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID;
  v_tenant          BIGINT;
  v_effective_limit INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant FROM public.profiles pr WHERE pr.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL THEN
    IF NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required' USING ERRCODE = '42501';
    END IF;
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
      m.quantity_sold::NUMERIC,
      m.revenue
    FROM public.mv_top_items m
    WHERE m.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
      AND (p_period_start IS NULL OR m.period_start = p_period_start)
    ORDER BY m.quantity_sold DESC
    LIMIT v_effective_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_items(BIGINT, DATE, INT) TO authenticated;


-- ─── Food cost wrapper ───
CREATE OR REPLACE FUNCTION public.get_food_cost(
  p_branch_id  BIGINT DEFAULT NULL,
  p_start_date DATE   DEFAULT NULL,
  p_end_date   DATE   DEFAULT NULL
)
RETURNS TABLE (
  period_start    DATE,
  period_end      DATE,
  branch_id       BIGINT,
  tenant_id       BIGINT,
  menu_item_id    BIGINT,
  item_name       TEXT,
  quantity_sold   NUMERIC,
  revenue         NUMERIC,
  ingredient_cost NUMERIC,
  food_cost_pct   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant FROM public.profiles pr WHERE pr.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL THEN
    IF NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      m.period_start,
      m.period_end,
      m.branch_id,
      m.tenant_id,
      m.menu_item_id,
      m.item_name,
      m.quantity_sold::NUMERIC,
      m.revenue,
      m.ingredient_cost,
      m.food_cost_pct
    FROM public.mv_food_cost m
    WHERE m.tenant_id = v_tenant
      AND (p_branch_id  IS NULL OR m.branch_id    = p_branch_id)
      AND (p_start_date IS NULL OR m.period_start >= p_start_date)
      AND (p_end_date   IS NULL OR m.period_start <= p_end_date)
    ORDER BY m.food_cost_pct DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_food_cost(BIGINT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_food_cost(BIGINT, DATE, DATE) TO authenticated;
