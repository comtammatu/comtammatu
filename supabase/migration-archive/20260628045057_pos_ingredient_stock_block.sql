-- =========================================================================
-- POS sell-limit by recipe định mức (Task 2)
--
-- When a branch enables the feature flag `pos_ingredient_stock_block`, POS
-- hard-blocks an order whose recipe demand would drive a kitchen ingredient's
-- stock negative, and shows "còn N phần". Approach (B): availability is read
-- directly from live order_items (no holds table) — cancel/void/reduce free
-- demand automatically. The block is an ADDITIVE trigger (gated, droppable) so
-- it never touches the core create_order/append_order_items bodies.
--
-- Explosion is copied verbatim from consume_stock_for_order (the function that
-- actually decrements at completion): SUM(qty * recipe.quantity / yield_factor),
-- oi.status <> 'cancelled', kitchen location is_default_consumption. Main
-- menu_item_id only — consume ignores side recipes today, so the gate must too
-- (else it is stricter than reality). Default OFF (no flag row) → zero change.
-- =========================================================================

-- ─── 1. Shared availability helper (single source for the demand formula) ──
-- on_hand and pending_demand per kitchen ingredient for a branch. pending_demand
-- = recipe demand of every not-yet-consumed order (status NOT IN completed/
-- cancelled). SECURITY DEFINER + not granted to browser roles: only the trigger
-- and the display RPC (both SECURITY DEFINER) call it; callers pass a trusted
-- tenant resolved from the order / auth claims.
CREATE FUNCTION public.branch_kitchen_ingredient_availability(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS TABLE (ingredient_id bigint, on_hand numeric, pending_demand numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH loc AS (
    SELECT il.id
    FROM public.inventory_locations il
    WHERE il.branch_id = p_branch_id
      AND il.tenant_id = p_tenant_id
      AND il.location_kind = 'kitchen'
      AND il.is_active = TRUE
    ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
    LIMIT 1
  ),
  pending AS (
    SELECT r.ingredient_id,
           SUM(oi.quantity::numeric * r.quantity / r.yield_factor) AS demand
    FROM public.orders o
    JOIN public.order_items oi
      ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
    WHERE o.tenant_id = p_tenant_id
      AND o.branch_id = p_branch_id
      AND o.status NOT IN ('completed', 'cancelled')
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  )
  SELECT sl.ingredient_id,
         sl.current_quantity AS on_hand,
         COALESCE(p.demand, 0) AS pending_demand
  FROM public.stock_levels sl
  LEFT JOIN pending p ON p.ingredient_id = sl.ingredient_id
  WHERE sl.tenant_id = p_tenant_id
    AND sl.branch_id = p_branch_id
    AND sl.location_id = (SELECT id FROM loc);
$$;

COMMENT ON FUNCTION public.branch_kitchen_ingredient_availability(bigint, bigint) IS
  'Per kitchen ingredient: on_hand and pending_demand (recipe demand of not-yet-consumed orders), using consume_stock_for_order''s exact explosion. Internal helper for the ingredient-stock gate + the POS cap RPC.';

REVOKE ALL ON FUNCTION public.branch_kitchen_ingredient_availability(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_kitchen_ingredient_availability(bigint, bigint) TO service_role;

-- ─── 2. Write-time gate: AFTER INSERT trigger on order_items ───────────────
-- Named to sort AFTER trg_enforce_branch_menu_daily_limit so both AFTER INSERT
-- triggers acquire locks in one global order (daily-limit rows, then stock
-- rows) → no ABBA deadlock. Per-row, but re-aggregating the whole order each
-- row means it rejects at the line that tips an ingredient negative.
CREATE FUNCTION public.enforce_branch_ingredient_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id   bigint;
  v_branch_id   bigint;
  v_location_id bigint;
  v_short       bigint;
BEGIN
  -- Shared skip-hatch (split_order sets it for net-zero re-inserts).
  IF COALESCE(current_setting('comtammatu.skip_quota_enforcement', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT o.tenant_id, o.branch_id
  INTO v_tenant_id, v_branch_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_feature_enabled(v_branch_id, 'pos_ingredient_stock_block') THEN
    RETURN NEW;
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_branch_id
    AND il.tenant_id = v_tenant_id
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  -- No kitchen location → cannot enforce; do NOT hard-block the register.
  IF v_location_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lock this order's demanded ingredient stock rows (deterministic order) so
  -- two concurrent carts sharing an ingredient serialize on the stock row.
  PERFORM 1
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id
    AND sl.location_id = v_location_id
    AND sl.ingredient_id IN (
      SELECT DISTINCT r.ingredient_id
      FROM public.order_items oi
      JOIN public.recipes r
        ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
      WHERE oi.order_id = NEW.order_id
        AND oi.tenant_id = v_tenant_id
        AND oi.status <> 'cancelled'
    )
  ORDER BY sl.ingredient_id
  FOR UPDATE;

  SELECT a.ingredient_id INTO v_short
  FROM public.branch_kitchen_ingredient_availability(v_tenant_id, v_branch_id) a
  WHERE a.on_hand - a.pending_demand < 0
    AND a.ingredient_id IN (
      SELECT DISTINCT r.ingredient_id
      FROM public.order_items oi
      JOIN public.recipes r
        ON r.menu_item_id = oi.menu_item_id AND r.tenant_id = oi.tenant_id
      WHERE oi.order_id = NEW.order_id
        AND oi.tenant_id = v_tenant_id
        AND oi.status <> 'cancelled'
    )
  ORDER BY a.ingredient_id
  LIMIT 1;

  IF v_short IS NOT NULL THEN
    RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_short
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'reason', 'insufficient_stock_ingredient',
              'ingredient_id', v_short
            )::text;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_branch_ingredient_stock() IS
  'AFTER INSERT on order_items: when branch flag pos_ingredient_stock_block is on, hard-block (P0001 insufficient_stock_ingredient:<id>) if the order''s recipe demand would drive a kitchen ingredient stock negative (available = on_hand − pending demand of not-yet-consumed orders). Skip-hatch comtammatu.skip_quota_enforcement. Fires after trg_enforce_branch_menu_daily_limit.';

REVOKE ALL ON FUNCTION public.enforce_branch_ingredient_stock() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enforce_ingredient_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_ingredient_stock();

-- ─── 3. Display RPC: per-item max_sellable when the flag is on ─────────────
-- Snapshot upper bound (shared ingredients couple dishes); the trigger is the
-- authoritative gate. Returns empty when the flag is off → POS merge is a no-op.
CREATE FUNCTION public.get_branch_menu_ingredient_caps_for_pos(p_branch_id bigint)
RETURNS TABLE (menu_item_id bigint, max_sellable integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH ctx AS (
    SELECT b.tenant_id, b.id AS branch_id
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = public.auth_tenant_id()
      AND public.is_feature_enabled(b.id, 'pos_ingredient_stock_block')
  ),
  avail AS (
    SELECT a.ingredient_id,
           GREATEST(a.on_hand - a.pending_demand, 0) AS free
    FROM ctx
    JOIN LATERAL public.branch_kitchen_ingredient_availability(ctx.tenant_id, ctx.branch_id) a ON TRUE
  )
  SELECT r.menu_item_id,
         FLOOR(MIN(av.free / (r.quantity / r.yield_factor)))::int AS max_sellable
  FROM ctx
  JOIN public.recipes r ON r.tenant_id = ctx.tenant_id
  JOIN avail av ON av.ingredient_id = r.ingredient_id
  GROUP BY r.menu_item_id;
$$;

COMMENT ON FUNCTION public.get_branch_menu_ingredient_caps_for_pos(bigint) IS
  'Per menu item with a recipe: snapshot max_sellable = floor(MIN over recipe ingredients of available/(quantity/yield_factor)) when branch flag pos_ingredient_stock_block is on; empty otherwise. Advisory display only — the order_items trigger is the hard gate.';

REVOKE ALL ON FUNCTION public.get_branch_menu_ingredient_caps_for_pos(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_menu_ingredient_caps_for_pos(bigint) TO authenticated, service_role;
