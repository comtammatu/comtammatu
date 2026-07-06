CREATE OR REPLACE FUNCTION public.bulk_import_ingredients(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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
    btrim(raw.value->>'purchase_unit') AS purchase_unit,
    btrim(raw.value->>'measure_unit') AS measure_unit,
    coalesce((raw.value->>'purchase_to_measure_factor')::numeric, 1) AS purchase_to_measure_factor,
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
       OR coalesce(purchase_unit, '') = ''
       OR coalesce(measure_unit, '') = ''
       OR purchase_to_measure_factor <= 0
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
  SELECT DISTINCT v_tenant, code, code, true
  FROM (
    SELECT purchase_unit AS code FROM pg_temp.bulk_import_ingredient_rows
    UNION
    SELECT measure_unit AS code FROM pg_temp.bulk_import_ingredient_rows
  ) unit_codes
  WHERE coalesce(code, '') <> ''
  ON CONFLICT ON CONSTRAINT units_code_tenant_key DO NOTHING;

  INSERT INTO public.ingredient_categories (tenant_id, name)
  SELECT DISTINCT v_tenant, category
  FROM pg_temp.bulk_import_ingredient_rows
  WHERE category IS NOT NULL
  ON CONFLICT ON CONSTRAINT ingredient_categories_name_tenant_key DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows rows
    LEFT JOIN public.units purchase_units
      ON purchase_units.tenant_id = v_tenant
     AND purchase_units.code = rows.purchase_unit
     AND purchase_units.is_active
    LEFT JOIN public.units measure_units
      ON measure_units.tenant_id = v_tenant
     AND measure_units.code = rows.measure_unit
     AND measure_units.is_active
    WHERE purchase_units.id IS NULL OR measure_units.id IS NULL
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
      tenant_id, name, sku, category_id, category, unit,
      purchase_unit, measure_unit, purchase_to_measure_factor,
      unit_cost, item_kind, storage_type,
      min_stock_level, max_stock_level, reorder_point, shelf_life_days
    )
    SELECT
      v_tenant,
      rows.name,
      rows.sku,
      categories.id,
      categories.name,
      measure_units.code,
      purchase_units.code,
      measure_units.code,
      rows.purchase_to_measure_factor,
      rows.unit_cost,
      rows.item_kind,
      rows.storage_type,
      rows.min_stock_level,
      rows.max_stock_level,
      rows.reorder_point,
      rows.shelf_life_days
    FROM pg_temp.bulk_import_ingredient_rows rows
    JOIN public.units purchase_units
      ON purchase_units.tenant_id = v_tenant
     AND purchase_units.code = rows.purchase_unit
     AND purchase_units.is_active
    JOIN public.units measure_units
      ON measure_units.tenant_id = v_tenant
     AND measure_units.code = rows.measure_unit
     AND measure_units.is_active
    LEFT JOIN public.ingredient_categories categories
      ON categories.tenant_id = v_tenant
     AND categories.name = rows.category
     AND categories.is_active
    ON CONFLICT ON CONSTRAINT ingredients_name_tenant_id_key
    DO UPDATE SET
      sku = EXCLUDED.sku,
      category_id = EXCLUDED.category_id,
      category = EXCLUDED.category,
      unit = EXCLUDED.unit,
      purchase_unit = EXCLUDED.purchase_unit,
      measure_unit = EXCLUDED.measure_unit,
      purchase_to_measure_factor = EXCLUDED.purchase_to_measure_factor,
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
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
    allow_purchase, allow_issue, allow_production, sort_order
  )
  SELECT
    v_tenant,
    upserted.id,
    import_units.unit_id,
    import_units.to_base_factor,
    import_units.is_base,
    import_units.allow_purchase,
    import_units.allow_issue,
    import_units.allow_production,
    import_units.sort_order
  FROM pg_temp.bulk_import_ingredient_rows rows
  JOIN pg_temp.bulk_import_ingredient_upserted upserted
    ON upserted.name = rows.name
  JOIN LATERAL (
    SELECT
      purchase_units.id AS unit_id,
      1::numeric AS to_base_factor,
      true AS is_base,
      true AS allow_purchase,
      true AS allow_issue,
      false AS allow_production,
      0 AS sort_order
    FROM public.units purchase_units
    WHERE purchase_units.tenant_id = v_tenant
      AND purchase_units.code = rows.purchase_unit
      AND purchase_units.is_active
    UNION ALL
    SELECT
      measure_units.id AS unit_id,
      1 / rows.purchase_to_measure_factor AS to_base_factor,
      false AS is_base,
      false AS allow_purchase,
      false AS allow_issue,
      true AS allow_production,
      1 AS sort_order
    FROM public.units measure_units
    WHERE measure_units.tenant_id = v_tenant
      AND measure_units.code = rows.measure_unit
      AND measure_units.is_active
      AND rows.measure_unit <> rows.purchase_unit
  ) import_units ON true;

  SELECT
    count(*) FILTER (WHERE NOT existed),
    count(*) FILTER (WHERE existed)
  INTO v_inserted, v_updated
  FROM pg_temp.bulk_import_ingredient_upserted;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_import_production_recipes(p_groups jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_recipes integer := 0;
  v_lines integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_groups IS NULL OR jsonb_typeof(p_groups) <> 'array' OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'groups_must_be_non_empty_array' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.bulk_import_production_groups;
  DROP TABLE IF EXISTS pg_temp.bulk_import_production_lines;

  CREATE TEMP TABLE pg_temp.bulk_import_production_groups ON COMMIT DROP AS
  SELECT
    raw.ordinality::integer AS group_no,
    (raw.value->>'finished_good_id')::bigint AS finished_good_id,
    raw.value->'lines' AS lines
  FROM jsonb_array_elements(p_groups) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups
    WHERE finished_good_id IS NULL
       OR lines IS NULL
       OR jsonb_typeof(lines) <> 'array'
       OR jsonb_array_length(lines) = 0
  ) THEN
    RAISE EXCEPTION 'invalid_group_shape' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups
    GROUP BY finished_good_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_finished_good' USING ERRCODE = '23505';
  END IF;

  CREATE TEMP TABLE pg_temp.bulk_import_production_lines ON COMMIT DROP AS
  SELECT
    groups.finished_good_id,
    raw.ordinality::integer AS line_no,
    (raw.value->>'ingredient_id')::bigint AS ingredient_id,
    (raw.value->>'quantity')::numeric AS quantity,
    btrim(raw.value->>'unit') AS unit,
    NULLIF(raw.value->>'entry_unit_id', '')::bigint AS entry_unit_id,
    nullif(btrim(coalesce(raw.value->>'note', '')), '') AS note,
    coalesce(NULLIF(raw.value->>'yield_factor', '')::numeric, 1) AS yield_factor
  FROM pg_temp.bulk_import_production_groups groups
  CROSS JOIN LATERAL jsonb_array_elements(groups.lines) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines
    WHERE ingredient_id IS NULL
       OR quantity <= 0
       OR yield_factor <= 0
       OR coalesce(unit, '') = ''
  ) THEN
    RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines
    GROUP BY finished_good_id, ingredient_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_groups groups
    LEFT JOIN public.ingredients finished_goods
      ON finished_goods.id = groups.finished_good_id
     AND finished_goods.tenant_id = v_tenant
     AND finished_goods.item_kind = 'finished_good'
     AND finished_goods.is_active
    WHERE finished_goods.id IS NULL
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_production_lines lines
    LEFT JOIN public.ingredients ingredients
      ON ingredients.id = lines.ingredient_id
     AND ingredients.tenant_id = v_tenant
     AND ingredients.item_kind = 'raw_material'
     AND ingredients.is_active
    WHERE ingredients.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.production_recipes (
    tenant_id, finished_good_id, ingredient_id,
    quantity, unit, entry_unit_id, note, yield_factor
  )
  SELECT
    v_tenant,
    lines.finished_good_id,
    lines.ingredient_id,
    lines.quantity,
    lines.unit,
    lines.entry_unit_id,
    lines.note,
    lines.yield_factor
  FROM pg_temp.bulk_import_production_lines lines
  ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    entry_unit_id = EXCLUDED.entry_unit_id,
    note = EXCLUDED.note,
    yield_factor = EXCLUDED.yield_factor;

  DELETE FROM public.production_recipes recipes
  USING pg_temp.bulk_import_production_groups groups
  WHERE recipes.tenant_id = v_tenant
    AND recipes.finished_good_id = groups.finished_good_id
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.bulk_import_production_lines lines
      WHERE lines.finished_good_id = recipes.finished_good_id
        AND lines.ingredient_id = recipes.ingredient_id
    );

  SELECT count(*) INTO v_recipes
  FROM pg_temp.bulk_import_production_groups;

  SELECT count(*) INTO v_lines
  FROM pg_temp.bulk_import_production_lines;

  RETURN jsonb_build_object('recipes', v_recipes, 'lines', v_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_ingredients(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_ingredients(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_ingredients(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.bulk_import_production_recipes(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_production_recipes(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_production_recipes(jsonb) TO service_role;
