-- Lock catalog unit ladders once stock ledger rows exist.
-- Historical stock_movements store base quantities plus entry_unit_id; changing
-- the base unit or used conversion factor would reinterpret old receipts/issues.

CREATE OR REPLACE FUNCTION public.upsert_ingredient_catalog(p_ingredient_id bigint, p_name text, p_sku text, p_category_id bigint, p_unit_cost numeric, p_item_kind text, p_storage_type text, p_min_stock_level numeric, p_max_stock_level numeric, p_reorder_point numeric, p_shelf_life_days integer, p_units jsonb) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant       bigint := public.auth_tenant_id();
  v_id           bigint := p_ingredient_id;
  v_base         jsonb;
  v_base_unit_id bigint;
  v_secondary    jsonb;
  v_purchase_unit text;
  v_measure_unit  text;
  v_factor     numeric;
  v_cat_name   text;
BEGIN
  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_units IS NULL OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'at least one unit required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) e
    WHERE NOT coalesce((e->>'is_base')::boolean, false)
      AND nullif(e->>'anchor_unit_id', '') IS NULL
      AND coalesce((e->>'to_base_factor')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'unit factor must be positive' USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(p_units) e WHERE (e->>'is_base')::boolean) <> 1 THEN
    RAISE EXCEPTION 'exactly one base unit required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) e
    LEFT JOIN public.units u
      ON u.id = (e->>'unit_id')::bigint
     AND u.tenant_id = v_tenant
     AND u.is_active
    WHERE u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'unit not found' USING ERRCODE = '23503';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT name INTO v_cat_name
    FROM public.ingredient_categories
    WHERE id = p_category_id
      AND tenant_id = v_tenant
      AND is_active;

    IF v_cat_name IS NULL THEN
      RAISE EXCEPTION 'category not found' USING ERRCODE = '23503';
    END IF;
  END IF;

  v_base := (SELECT e FROM jsonb_array_elements(p_units) e WHERE (e->>'is_base')::boolean LIMIT 1);
  v_base_unit_id := (v_base->>'unit_id')::bigint;
  v_secondary := (
    SELECT e FROM jsonb_array_elements(p_units) e
    WHERE NOT (e->>'is_base')::boolean
    ORDER BY coalesce((e->>'sort_order')::int, 0), (e->>'unit_id')::bigint
    LIMIT 1
  );

  SELECT code INTO v_purchase_unit
  FROM public.units
  WHERE id = v_base_unit_id
    AND tenant_id = v_tenant
    AND is_active;

  IF v_secondary IS NOT NULL THEN
    SELECT code INTO v_measure_unit
    FROM public.units
    WHERE id = (v_secondary->>'unit_id')::bigint
      AND tenant_id = v_tenant
      AND is_active;
    v_factor := 1.0 / public.inv_catalog_unit_to_base(v_base_unit_id, v_secondary, p_units);
  ELSE
    v_measure_unit := v_purchase_unit;
    v_factor := 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category, unit,
      purchase_unit, measure_unit, purchase_to_measure_factor,
      unit_cost, item_kind, storage_type,
      min_stock_level, max_stock_level, reorder_point, shelf_life_days
    ) VALUES (
      v_tenant, p_name, p_sku, p_category_id, v_cat_name, v_measure_unit,
      v_purchase_unit, v_measure_unit, v_factor,
      p_unit_cost, coalesce(p_item_kind, 'raw_material'), coalesce(p_storage_type, 'ambient'),
      coalesce(p_min_stock_level, 0), p_max_stock_level, p_reorder_point, p_shelf_life_days
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.ingredients SET
      name = p_name, sku = p_sku, category_id = p_category_id, category = v_cat_name,
      unit = v_measure_unit, purchase_unit = v_purchase_unit, measure_unit = v_measure_unit,
      purchase_to_measure_factor = v_factor, unit_cost = p_unit_cost,
      item_kind = coalesce(p_item_kind, item_kind), storage_type = coalesce(p_storage_type, storage_type),
      min_stock_level = coalesce(p_min_stock_level, 0), max_stock_level = p_max_stock_level,
      reorder_point = p_reorder_point, shelf_life_days = p_shelf_life_days, updated_at = now()
    WHERE id = v_id AND tenant_id = v_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_ingredient_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.stock_movements sm
       WHERE sm.tenant_id = v_tenant
         AND sm.ingredient_id = v_id
     )
  THEN
    IF EXISTS (
      SELECT 1
      FROM public.ingredient_units iu
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = v_id
        AND iu.is_base
        AND iu.unit_id IS DISTINCT FROM v_base_unit_id
    ) THEN
      RAISE EXCEPTION 'inventory_unit_ladder_locked_by_stock_movements' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_tenant
        AND sm.ingredient_id = v_id
        AND sm.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_units) e
          WHERE (e->>'unit_id')::bigint = sm.entry_unit_id
        )
    ) THEN
      RAISE EXCEPTION 'inventory_unit_ladder_locked_by_stock_movements' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.ingredient_units iu
      JOIN (
        SELECT DISTINCT sm.entry_unit_id
        FROM public.stock_movements sm
        WHERE sm.tenant_id = v_tenant
          AND sm.ingredient_id = v_id
          AND sm.entry_unit_id IS NOT NULL
      ) used ON used.entry_unit_id = iu.unit_id
      JOIN LATERAL (
        SELECT e
        FROM jsonb_array_elements(p_units) e
        WHERE (e->>'unit_id')::bigint = iu.unit_id
        LIMIT 1
      ) incoming ON TRUE
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = v_id
        AND abs(
          iu.to_base_factor
          - public.inv_catalog_unit_to_base(v_base_unit_id, incoming.e, p_units)
        ) > 0.000000001
    ) THEN
      RAISE EXCEPTION 'inventory_unit_ladder_locked_by_stock_movements' USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM public.ingredient_units WHERE ingredient_id = v_id AND tenant_id = v_tenant;
  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
    anchor_unit_id, anchor_factor,
    allow_purchase, allow_issue, allow_production, sort_order
  )
  SELECT v_tenant, v_id, (e->>'unit_id')::bigint,
         public.inv_catalog_unit_to_base(v_base_unit_id, e, p_units),
         (e->>'is_base')::boolean,
         nullif(e->>'anchor_unit_id', '')::bigint,
         nullif(e->>'anchor_factor', '')::numeric,
         coalesce((e->>'allow_purchase')::boolean, false),
         coalesce((e->>'allow_issue')::boolean, false),
         coalesce((e->>'allow_production')::boolean, false),
         coalesce((e->>'sort_order')::int, 0)
  FROM jsonb_array_elements(p_units) e;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.upsert_ingredient_catalog(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, integer, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_ingredient_catalog(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, integer, jsonb) TO authenticated, service_role;
