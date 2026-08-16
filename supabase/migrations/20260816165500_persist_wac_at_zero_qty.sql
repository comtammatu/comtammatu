-- Keep last recorded WAC when the valuation pool is empty or negative.
-- POS cost ladder: last-known movement before booking zero.
-- One-shot repair: Sườn cọng POS rows booked at 0 after a consumption slip.

DO $keep_last_wac$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_stock_movement_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  v_updated := regexp_replace(
    v_def,
    'SET avg_unit_cost = CASE\s+WHEN account\.quantity > 0\s+THEN pg_catalog\.round\(\s*account\.book_value / account\.quantity,\s*8\s*\)\s+ELSE 0\s+END',
    $new$SET avg_unit_cost = CASE
          WHEN account.quantity > 0
            THEN pg_catalog.round(
              account.book_value / account.quantity,
              8
            )
          WHEN stock.avg_unit_cost IS NOT NULL AND stock.avg_unit_cost > 0
            THEN stock.avg_unit_cost
          ELSE 0
        END$new$
  );

  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation WAC persist pattern missing';
  END IF;

  EXECUTE v_updated;

  IF pg_get_functiondef(
    'private.post_stock_movement_valuation()'::regprocedure
  ) !~ 'WHEN stock\.avg_unit_cost IS NOT NULL AND stock\.avg_unit_cost > 0' THEN
    RAISE EXCEPTION 'post_stock_movement_valuation did not keep last WAC';
  END IF;
END
$keep_last_wac$;

COMMENT ON FUNCTION private.post_stock_movement_valuation() IS
  'Posts one idempotent valuation event per stock movement after cutover. Empty or negative pool keeps the last positive stock_levels.avg_unit_cost; inbound qty > 0 recomputes WAC as book_value / quantity.';

DO $pos_last_known$
DECLARE
  v_def text;
  v_updated text;
  v_new text := $new$    IF v_cost_rung IS NULL THEN
      SELECT sm.unit_cost
      INTO v_unit_cost
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_order.tenant_id
        AND sm.ingredient_id = v_need.ingredient_id
        AND sm.unit_cost IS NOT NULL
        AND sm.unit_cost > 0
      ORDER BY
        CASE
          WHEN sm.type = 'production_output' THEN 0
          WHEN sm.type IN ('transfer_in', 'grn_receipt') THEN 1
          ELSE 2
        END,
        sm.created_at DESC
      LIMIT 1;
      IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
        v_cost_rung := 'last_known_movement';
        v_cost_fallback := array_append(v_cost_fallback, v_need.ingredient_id);
        v_followup_needed := true;
      END IF;
    END IF;

    IF v_cost_rung IS NULL THEN
      v_unit_cost := 0;
      v_cost_rung := 'zero';$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'post_pos_sale_consumption_if_ready';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready missing';
  END IF;

  IF v_def ~ 'last_known_movement' THEN
    RETURN;
  END IF;

  v_updated := regexp_replace(
    v_def,
    'IF v_cost_rung IS NULL THEN\s+v_unit_cost := 0;\s+v_cost_rung := ''zero'';',
    v_new
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready zero-rung pattern missing';
  END IF;

  EXECUTE v_updated;

  IF pg_get_functiondef(
    'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::regprocedure
  ) !~ 'last_known_movement' THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready missing last_known_movement rung';
  END IF;
END
$pos_last_known$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid) IS
  'ADR 0026: posts per-ingredient sale consumption for paid completed orders; cost ladder is location WAC, tenant WAC, latest purchase, last-known movement, then zero.';

-- Restore Sườn cọng last production WAC and append food_cost for POS 0-cost rows.
-- Valuation events/allocations are append-only; do not UPDATE them.
-- No-op when the ingredient or production snapshot is absent (tests / empty DBs).
DO $repair_suon_cong$
DECLARE
  v_ingredient_id bigint;
  v_unit_cost numeric(24, 8);
BEGIN
  SELECT i.id
  INTO v_ingredient_id
  FROM public.ingredients i
  WHERE i.name = 'Sườn cọng'
  ORDER BY i.id
  LIMIT 1;

  IF v_ingredient_id IS NULL THEN
    RETURN;
  END IF;

  SELECT sm.unit_cost
  INTO v_unit_cost
  FROM public.stock_movements sm
  WHERE sm.ingredient_id = v_ingredient_id
    AND sm.type = 'production_output'
    AND sm.unit_cost > 0
  ORDER BY sm.created_at DESC
  LIMIT 1;

  IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.stock_levels sl
  SET
    avg_unit_cost = v_unit_cost,
    updated_at = pg_catalog.now()
  WHERE sl.ingredient_id = v_ingredient_id
    AND COALESCE(sl.avg_unit_cost, 0) = 0;

  INSERT INTO public.inventory_valuation_events (
    tenant_id,
    ingredient_id,
    event_type,
    stock_movement_id,
    quantity_delta,
    value_delta,
    effective_at,
    posting_year,
    posting_month,
    idempotency_key,
    metadata
  )
  SELECT
    sm.tenant_id,
    sm.ingredient_id,
    'invoice_reprice',
    sm.id,
    0,
    pg_catalog.round(pg_catalog.abs(sm.quantity_change) * v_unit_cost, 2),
    sm.created_at,
    extract(YEAR FROM sm.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    extract(MONTH FROM sm.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    pg_catalog.md5('suon-cong-wac-repair:' || sm.id::text)::uuid,
    pg_catalog.jsonb_build_object(
      'repair', 'suon_cong_zero_pos',
      'unit_cost', v_unit_cost
    )
  FROM public.stock_movements sm
  JOIN public.branches b ON b.id = sm.branch_id
  WHERE sm.ingredient_id = v_ingredient_id
    AND b.branch_kind = 'branch'
    AND sm.type = 'consumption'
    AND sm.movement_subtype = 'sale_consumption'
    AND sm.order_id IS NOT NULL
    AND COALESCE(sm.unit_cost, 0) = 0
    AND EXISTS (
      SELECT 1
      FROM public.inventory_valuation_events ev
      JOIN public.inventory_value_allocations alloc
        ON alloc.valuation_event_id = ev.id
      WHERE ev.stock_movement_id = sm.id
        AND ev.terminal_bucket = 'food_cost'
        AND alloc.allocation_bucket = 'food_cost'
        AND alloc.source_origin_id IS NOT NULL
    )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

  INSERT INTO public.inventory_value_allocations (
    tenant_id,
    valuation_event_id,
    source_origin_id,
    allocation_bucket,
    allocated_quantity,
    allocated_value
  )
  SELECT
    ev.tenant_id,
    ev.id,
    orig.source_origin_id,
    'food_cost',
    0,
    ev.value_delta
  FROM public.inventory_valuation_events ev
  JOIN public.stock_movements sm ON sm.id = ev.stock_movement_id
  JOIN LATERAL (
    SELECT alloc.source_origin_id
    FROM public.inventory_valuation_events issue
    JOIN public.inventory_value_allocations alloc
      ON alloc.valuation_event_id = issue.id
    WHERE issue.stock_movement_id = sm.id
      AND issue.terminal_bucket = 'food_cost'
      AND alloc.allocation_bucket = 'food_cost'
      AND alloc.source_origin_id IS NOT NULL
    ORDER BY issue.id
    LIMIT 1
  ) orig ON true
  WHERE ev.idempotency_key = pg_catalog.md5(
    'suon-cong-wac-repair:' || sm.id::text
  )::uuid
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_value_allocations alloc
      WHERE alloc.valuation_event_id = ev.id
    );

  UPDATE public.stock_movements sm
  SET unit_cost = v_unit_cost
  FROM public.branches b
  WHERE sm.ingredient_id = v_ingredient_id
    AND sm.branch_id = b.id
    AND b.branch_kind = 'branch'
    AND sm.type = 'consumption'
    AND sm.movement_subtype = 'sale_consumption'
    AND sm.order_id IS NOT NULL
    AND COALESCE(sm.unit_cost, 0) = 0;
END
$repair_suon_cong$;
