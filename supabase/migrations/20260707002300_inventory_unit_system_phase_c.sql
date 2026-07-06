-- Migration Phase C: Clean up legacy inventory units
-- Drop columns `purchase_unit`, `measure_unit`, `purchase_to_measure_factor`, `unit` from `ingredients`
-- Drop columns `allow_purchase`, `allow_issue`, `allow_production` from `ingredient_units`
-- Update `upsert_ingredient_catalog` and `bulk_import_ingredients` RPCs.

-- 1. Update `upsert_ingredient_catalog` to not touch legacy columns
CREATE OR REPLACE FUNCTION public.upsert_ingredient_catalog(p_ingredient_id bigint, p_name text, p_sku text, p_category_id bigint, p_unit_cost numeric, p_item_kind text, p_storage_type text, p_min_stock_level numeric, p_max_stock_level numeric, p_reorder_point numeric, p_shelf_life_days integer, p_units jsonb) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant       bigint := public.auth_tenant_id();
  v_id           bigint := p_ingredient_id;
  v_base         jsonb;
  v_base_unit_id bigint;
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

  IF v_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category,
      unit_cost, item_kind, storage_type,
      min_stock_level, max_stock_level, reorder_point, shelf_life_days
    ) VALUES (
      v_tenant, p_name, p_sku, p_category_id, v_cat_name,
      p_unit_cost, coalesce(p_item_kind, 'raw_material'), coalesce(p_storage_type, 'ambient'),
      coalesce(p_min_stock_level, 0), p_max_stock_level, p_reorder_point, p_shelf_life_days
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.ingredients SET
      name = p_name, sku = p_sku, category_id = p_category_id, category = v_cat_name,
      unit_cost = p_unit_cost,
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
    anchor_unit_id, anchor_factor, sort_order
  )
  SELECT v_tenant, v_id, (e->>'unit_id')::bigint,
         public.inv_catalog_unit_to_base(v_base_unit_id, e, p_units),
         (e->>'is_base')::boolean,
         nullif(e->>'anchor_unit_id', '')::bigint,
         nullif(e->>'anchor_factor', '')::numeric,
         coalesce((e->>'sort_order')::int, 0)
  FROM jsonb_array_elements(p_units) e;

  RETURN v_id;
END $$;

-- 2. Update `bulk_import_ingredients`
CREATE OR REPLACE FUNCTION public.bulk_import_ingredients(p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_inserted integer := 0;
  v_updated integer := 0;
BEGIN
  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'rows_must_be_non_empty_array' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.bulk_import_ingredient_rows;
  DROP TABLE IF EXISTS pg_temp.bulk_import_ingredient_upserted;

  CREATE TEMP TABLE pg_temp.bulk_import_ingredient_rows ON COMMIT DROP AS
  SELECT
    raw.ordinality::integer AS row_no,
    btrim(raw.value->>'name') AS name,
    nullif(btrim(coalesce(raw.value->>'sku', '')), '') AS sku,
    btrim(raw.value->>'unit') AS unit,
    nullif(btrim(coalesce(raw.value->>'category', '')), '') AS category,
    coalesce(nullif(btrim(coalesce(raw.value->>'item_kind', '')), ''), 'raw_material') AS item_kind,
    (raw.value->>'unit_cost')::numeric AS unit_cost,
    coalesce((raw.value->>'min_stock_level')::numeric, 0) AS min_stock_level,
    (raw.value->>'max_stock_level')::numeric AS max_stock_level,
    (raw.value->>'reorder_point')::numeric AS reorder_point,
    coalesce(nullif(btrim(coalesce(raw.value->>'storage_type', '')), ''), 'ambient') AS storage_type,
    (raw.value->>'shelf_life_days')::integer AS shelf_life_days
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows
    WHERE coalesce(name, '') = ''
       OR coalesce(unit, '') = ''
  ) THEN
    RAISE EXCEPTION 'invalid_import_row' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows
    GROUP BY name
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_import_name' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.units (tenant_id, code, name, is_active)
  SELECT DISTINCT v_tenant, unit, unit, true
  FROM pg_temp.bulk_import_ingredient_rows
  WHERE coalesce(unit, '') <> ''
  ON CONFLICT ON CONSTRAINT units_code_tenant_key DO NOTHING;

  INSERT INTO public.ingredient_categories (tenant_id, name)
  SELECT DISTINCT v_tenant, category
  FROM pg_temp.bulk_import_ingredient_rows
  WHERE category IS NOT NULL
  ON CONFLICT ON CONSTRAINT ingredient_categories_name_tenant_key DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows rows
    LEFT JOIN public.units base_units
      ON base_units.tenant_id = v_tenant
     AND base_units.code = rows.unit
     AND base_units.is_active
    WHERE base_units.id IS NULL
  ) THEN
    RAISE EXCEPTION 'unit_not_found' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows rows
    LEFT JOIN public.ingredient_categories categories
      ON categories.tenant_id = v_tenant
     AND categories.name = rows.category
     AND categories.is_active
    WHERE rows.category IS NOT NULL
      AND categories.id IS NULL
  ) THEN
    RAISE EXCEPTION 'category_not_found' USING ERRCODE = '23503';
  END IF;

  CREATE TEMP TABLE pg_temp.bulk_import_ingredient_upserted ON COMMIT DROP AS
  WITH existing AS (
    SELECT ingredients.name
    FROM public.ingredients
    JOIN pg_temp.bulk_import_ingredient_rows rows
      ON rows.name = ingredients.name
    WHERE ingredients.tenant_id = v_tenant
  ),
  upserted AS (
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category,
      unit_cost, item_kind, storage_type,
      min_stock_level, max_stock_level, reorder_point, shelf_life_days
    )
    SELECT
      v_tenant,
      rows.name,
      rows.sku,
      categories.id,
      categories.name,
      rows.unit_cost,
      rows.item_kind,
      rows.storage_type,
      rows.min_stock_level,
      rows.max_stock_level,
      rows.reorder_point,
      rows.shelf_life_days
    FROM pg_temp.bulk_import_ingredient_rows rows
    LEFT JOIN public.ingredient_categories categories
      ON categories.tenant_id = v_tenant
     AND categories.name = rows.category
     AND categories.is_active
    ON CONFLICT ON CONSTRAINT ingredients_name_tenant_id_key
    DO UPDATE SET
      sku = EXCLUDED.sku,
      category_id = EXCLUDED.category_id,
      category = EXCLUDED.category,
      unit_cost = EXCLUDED.unit_cost,
      item_kind = EXCLUDED.item_kind,
      storage_type = EXCLUDED.storage_type,
      min_stock_level = EXCLUDED.min_stock_level,
      max_stock_level = EXCLUDED.max_stock_level,
      reorder_point = EXCLUDED.reorder_point,
      shelf_life_days = EXCLUDED.shelf_life_days,
      updated_at = now()
    RETURNING id, name
  )
  SELECT upserted.id, upserted.name, existing.name IS NOT NULL AS existed
  FROM upserted
  LEFT JOIN existing ON existing.name = upserted.name;

  DELETE FROM public.ingredient_units ingredient_units
  USING pg_temp.bulk_import_ingredient_upserted upserted
  WHERE ingredient_units.tenant_id = v_tenant
    AND ingredient_units.ingredient_id = upserted.id;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, sort_order
  )
  SELECT
    v_tenant,
    upserted.id,
    base_units.id,
    1::numeric,
    true,
    0
  FROM pg_temp.bulk_import_ingredient_rows rows
  JOIN pg_temp.bulk_import_ingredient_upserted upserted
    ON upserted.name = rows.name
  JOIN public.units base_units
    ON base_units.tenant_id = v_tenant
   AND base_units.code = rows.unit
   AND base_units.is_active;

  SELECT
    count(*) FILTER (WHERE NOT existed),
    count(*) FILTER (WHERE existed)
  INTO v_inserted, v_updated
  FROM pg_temp.bulk_import_ingredient_upserted;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$$;

-- 3. Drop columns
ALTER TABLE public.ingredients
  DROP COLUMN purchase_unit,
  DROP COLUMN measure_unit,
  DROP COLUMN purchase_to_measure_factor,
  DROP COLUMN unit;

ALTER TABLE public.ingredient_units
  DROP COLUMN allow_purchase,
  DROP COLUMN allow_issue,
  DROP COLUMN allow_production;
