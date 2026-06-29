-- =========================================================================
-- Sellable-portion cap from recipe định mức + warehouse stock, fed into the
-- existing per-day "Giới hạn món" so POS shows "còn N phần" and counts down.
--
-- Owner model (differs from pos_ingredient_stock_block, which stays OFF):
--   sellable = floor(warehouse on_hand / (recipe.quantity / yield_factor))
--   * source = warehouse stock (location_kind='warehouse'), NOT kitchen.
--   * advisory only — NO order_items hard-gate, NO stock decrement on sale.
--   * recomputed when warehouse stock changes (trigger on stock_levels) or a
--     recipe changes (trigger on recipes).
-- The value lives in a new column on branch_menu_item_daily_limits, so the
-- mature daily-limit machinery reuses for free: sold_today counting (the
-- enforce trigger increments any existing row even when limit_quantity IS NULL
-- and never RAISEs on a NULL limit), giveback on cancel, and the POS realtime
-- channel (REPLICA IDENTITY FULL). limit_quantity (manual cap) is left
-- untouched; POS composes min(limit_quantity, stock_capacity) − sold_today.
-- =========================================================================

-- ─── 1. Stored stock-derived cap (separate from manual limit_quantity) ─────
-- Own column because limit_quantity CHECK forbids 0 (0 = hết nguyên liệu is a
-- valid computed state) and to avoid clobbering manager-set caps.
ALTER TABLE public.branch_menu_item_daily_limits
  ADD COLUMN stock_capacity integer;

ALTER TABLE public.branch_menu_item_daily_limits
  ADD CONSTRAINT branch_menu_item_daily_limits_stock_capacity_check
  CHECK (stock_capacity IS NULL OR stock_capacity >= 0);

COMMENT ON COLUMN public.branch_menu_item_daily_limits.stock_capacity IS
  'Recipe-derived sellable portions from warehouse stock: floor(min over recipe ingredients of warehouse on_hand/(quantity/yield_factor)). NULL = no recipe / no cap. Maintained by triggers on stock_levels + recipes. Advisory; composed with limit_quantity at POS, never a DB hard-gate.';

-- ─── 2. Per-item compute (warehouse stock; same explosion as the kitchen RPC) ──
-- recipes.quantity and stock_levels.current_quantity are both in
-- ingredients.purchase_unit, so on_hand/(quantity/yield_factor) is unit-safe.
-- LEFT JOIN + COALESCE(...,0): a recipe ingredient with no warehouse row caps
-- the dish at 0. No recipe rows → MIN over empty → NULL (no cap).
CREATE FUNCTION public.compute_menu_item_stock_capacity(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_menu_item_id bigint
) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT FLOOR(MIN(COALESCE(oh.on_hand, 0) / (r.quantity / r.yield_factor)))::int
  FROM public.recipes r
  LEFT JOIN LATERAL (
    SELECT SUM(sl.current_quantity) AS on_hand
    FROM public.stock_levels sl
    JOIN public.inventory_locations il ON il.id = sl.location_id
    WHERE sl.tenant_id = p_tenant_id
      AND sl.branch_id = p_branch_id
      AND sl.ingredient_id = r.ingredient_id
      AND il.location_kind = 'warehouse'
      AND il.is_active = TRUE
  ) oh ON TRUE
  WHERE r.tenant_id = p_tenant_id
    AND r.menu_item_id = p_menu_item_id;
$$;

COMMENT ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint) IS
  'Sellable portions of a menu item from warehouse stock: floor(MIN over recipe ingredients of warehouse on_hand/(quantity/yield_factor)). NULL when the item has no recipe.';

REVOKE ALL ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint) TO service_role;

-- ─── 3. Refresh: UPSERT today's stock_capacity, preserving manual fields ───
-- p_menu_item_id / p_ingredient_id narrow the recompute (recipe vs stock
-- trigger). ON CONFLICT updates only stock_capacity → limit_quantity,
-- is_disabled, sold_today are never touched.
CREATE FUNCTION public.refresh_branch_menu_stock_capacity(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_menu_item_id bigint DEFAULT NULL,
  p_ingredient_id bigint DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  -- Defense in depth: callers are triggers passing a row's own tenant/branch;
  -- reject any mismatch so this can never write across tenants even if invoked
  -- directly.
  PERFORM 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, stock_capacity)
  SELECT p_tenant_id, p_branch_id, mi.menu_item_id, v_today,
         public.compute_menu_item_stock_capacity(p_tenant_id, p_branch_id, mi.menu_item_id)
  FROM (
    SELECT DISTINCT r.menu_item_id
    FROM public.recipes r
    WHERE r.tenant_id = p_tenant_id
      AND (p_menu_item_id IS NULL OR r.menu_item_id = p_menu_item_id)
      AND (p_ingredient_id IS NULL OR r.ingredient_id = p_ingredient_id)
  ) mi
  ON CONFLICT (branch_id, menu_item_id, limit_date)
  DO UPDATE SET stock_capacity = EXCLUDED.stock_capacity, updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.refresh_branch_menu_stock_capacity(bigint, bigint, bigint, bigint) IS
  'Recompute + UPSERT today''s stock_capacity for menu items with a recipe (optionally narrowed by menu item or ingredient), preserving limit_quantity/is_disabled/sold_today.';

REVOKE ALL ON FUNCTION public.refresh_branch_menu_stock_capacity(bigint, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_branch_menu_stock_capacity(bigint, bigint, bigint, bigint) TO service_role;

-- ─── 4. Trigger: warehouse stock change → recompute affected dishes ────────
-- Fires only for warehouse-location rows (kitchen consume path is irrelevant
-- to this cap). Row-level fan-out per ingredient is bounded by recipes that
-- reference it; if bulk GRN posts get chatty, move to a statement trigger.
CREATE FUNCTION public.trg_refresh_menu_stock_capacity_on_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id   bigint;
  v_branch_id   bigint;
  v_ingredient  bigint;
  v_location_id bigint;
  v_kind        text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id; v_branch_id := OLD.branch_id;
    v_ingredient := OLD.ingredient_id; v_location_id := OLD.location_id;
  ELSE
    v_tenant_id := NEW.tenant_id; v_branch_id := NEW.branch_id;
    v_ingredient := NEW.ingredient_id; v_location_id := NEW.location_id;
  END IF;

  SELECT il.location_kind INTO v_kind
  FROM public.inventory_locations il
  WHERE il.id = v_location_id;

  IF v_kind IS DISTINCT FROM 'warehouse' THEN
    RETURN NULL;
  END IF;

  PERFORM public.refresh_branch_menu_stock_capacity(
    v_tenant_id, v_branch_id, NULL, v_ingredient
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_refresh_menu_stock_capacity_on_stock() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refresh_menu_stock_capacity_on_stock
  AFTER INSERT OR DELETE OR UPDATE OF current_quantity ON public.stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_menu_stock_capacity_on_stock();

-- ─── 5. Trigger: recipe change → recompute that dish across selling branches ──
-- recipes are tenant-wide; capacity is per branch. On any recipe change recompute
-- the dish across selling branches; if the dish lost all its recipe lines, clear
-- today's now-stale stock_capacity (refresh only UPSERTs items that still have a
-- recipe, so it would otherwise leave the old value behind).
CREATE FUNCTION public.trg_refresh_menu_stock_capacity_on_recipe() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id bigint;
  v_menu_item bigint;
  v_branch_id bigint;
  v_today     date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id; v_menu_item := OLD.menu_item_id;
  ELSE
    v_tenant_id := NEW.tenant_id; v_menu_item := NEW.menu_item_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.tenant_id = v_tenant_id AND r.menu_item_id = v_menu_item
  ) THEN
    UPDATE public.branch_menu_item_daily_limits
    SET stock_capacity = NULL, updated_at = now()
    WHERE tenant_id = v_tenant_id
      AND menu_item_id = v_menu_item
      AND limit_date = v_today;
    RETURN NULL;
  END IF;

  FOR v_branch_id IN
    SELECT b.id FROM public.branches b
    WHERE b.tenant_id = v_tenant_id
      AND b.branch_kind = 'branch'
      AND b.is_active
  LOOP
    PERFORM public.refresh_branch_menu_stock_capacity(
      v_tenant_id, v_branch_id, v_menu_item, NULL
    );
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_refresh_menu_stock_capacity_on_recipe() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refresh_menu_stock_capacity_on_recipe
  AFTER INSERT OR DELETE OR UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_menu_stock_capacity_on_recipe();

-- ─── 6. POS read RPC gains stock_capacity (return signature change → drop+recreate) ──
DROP FUNCTION public.get_branch_menu_daily_limits_for_pos(bigint);

CREATE FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint)
RETURNS TABLE(menu_item_id bigint, limit_quantity integer, is_disabled boolean, sold_today integer, stock_capacity integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    bl.menu_item_id,
    bl.limit_quantity,
    bl.is_disabled,
    bl.sold_today,
    bl.stock_capacity
  FROM public.branch_menu_item_daily_limits bl
  WHERE bl.tenant_id = public.auth_tenant_id()
    AND bl.branch_id = p_branch_id
    AND bl.limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND (
      public.auth_role() IN ('owner')
      OR public.auth_branch_id() = p_branch_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_branch_menu_daily_limits_for_pos(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_menu_daily_limits_for_pos(bigint) TO authenticated, service_role;

-- ─── 7. Admin read RPC: live sellable count per dish at a branch ───────────
CREATE FUNCTION public.get_branch_menu_stock_capacity(p_branch_id bigint)
RETURNS TABLE(menu_item_id bigint, stock_capacity integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH ctx AS (
    SELECT b.tenant_id, b.id AS branch_id
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = public.auth_tenant_id()
      AND (public.auth_role() IN ('owner') OR public.auth_branch_id() = p_branch_id)
  )
  SELECT r.menu_item_id,
         public.compute_menu_item_stock_capacity(c.tenant_id, c.branch_id, r.menu_item_id)
  FROM ctx c
  JOIN (SELECT DISTINCT menu_item_id, tenant_id FROM public.recipes) r
    ON r.tenant_id = c.tenant_id;
$$;

COMMENT ON FUNCTION public.get_branch_menu_stock_capacity(bigint) IS
  'Per menu item with a recipe: live sellable portions from warehouse stock at p_branch_id (owner or own-branch). Admin display for Định mức món bán.';

REVOKE ALL ON FUNCTION public.get_branch_menu_stock_capacity(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_menu_stock_capacity(bigint) TO authenticated, service_role;

-- ─── 8. Backfill today's rows for all selling branches ────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.branches
           WHERE branch_kind = 'branch' AND is_active
  LOOP
    PERFORM public.refresh_branch_menu_stock_capacity(r.tenant_id, r.id);
  END LOOP;
END $$;
