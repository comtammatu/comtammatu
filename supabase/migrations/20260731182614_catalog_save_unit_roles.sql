CREATE FUNCTION public.save_ingredient_catalog(
  p_ingredient_id bigint,
  p_name text,
  p_sku text,
  p_category_id bigint,
  p_item_kind text,
  p_storage_type text,
  p_min_stock_level numeric,
  p_max_stock_level numeric,
  p_reorder_point numeric,
  p_shelf_life_days integer,
  p_units jsonb,
  p_default_fulfill_site_kind text,
  p_receipt_unit_id bigint,
  p_issue_unit_id bigint,
  p_production_unit_id bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_id bigint := p_ingredient_id;
  v_base_unit_id bigint;
  v_category_name text;
  v_preserved_unit_cost numeric;
  v_receipt_factor numeric;
  v_issue_factor numeric;
  v_production_factor numeric;
  v_receipt_dimension text;
  v_issue_dimension text;
  v_production_dimension text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner'
     OR NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_units IS NULL
     OR jsonb_typeof(p_units) <> 'array'
     OR jsonb_array_length(p_units) NOT BETWEEN 1 AND 3
     OR p_receipt_unit_id IS NULL
     OR p_issue_unit_id IS NULL THEN
    RAISE EXCEPTION 'inventory_unit_roles_invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) AS incoming
    LEFT JOIN public.units AS unit_row
      ON unit_row.id = (incoming ->> 'unit_id')::bigint
     AND unit_row.tenant_id = v_tenant
     AND unit_row.is_active
    WHERE unit_row.id IS NULL
       OR COALESCE((incoming ->> 'to_base_factor')::numeric, 0) <= 0
  ) OR (
    SELECT count(*)
    FROM jsonb_array_elements(p_units)
  ) <> (
    SELECT count(DISTINCT (incoming ->> 'unit_id')::bigint)
    FROM jsonb_array_elements(p_units) AS incoming
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) AS incoming
    WHERE COALESCE((incoming ->> 'is_base')::boolean, false)
      AND (incoming ->> 'to_base_factor')::numeric IS DISTINCT FROM 1
  ) THEN
    RAISE EXCEPTION 'inventory_unit_roles_invalid' USING ERRCODE = '23514';
  END IF;
  IF (
    SELECT count(*)
    FROM jsonb_array_elements(p_units) AS incoming
    WHERE COALESCE((incoming ->> 'is_base')::boolean, false)
  ) <> 1 THEN
    RAISE EXCEPTION 'exactly_one_standard_unit_required' USING ERRCODE = '23514';
  END IF;

  SELECT (incoming ->> 'unit_id')::bigint
  INTO v_base_unit_id
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE COALESCE((incoming ->> 'is_base')::boolean, false)
  LIMIT 1;

  IF v_base_unit_id IS DISTINCT FROM COALESCE(p_production_unit_id, p_issue_unit_id) THEN
    RAISE EXCEPTION 'inventory_standard_unit_role_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
  INTO v_receipt_factor
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE (incoming ->> 'unit_id')::bigint = p_receipt_unit_id;
  SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
  INTO v_issue_factor
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE (incoming ->> 'unit_id')::bigint = p_issue_unit_id;
  SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
  INTO v_production_factor
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE (incoming ->> 'unit_id')::bigint = p_production_unit_id;

  IF v_receipt_factor IS NULL
     OR v_issue_factor IS NULL
     OR (p_production_unit_id IS NOT NULL AND v_production_factor IS NULL)
     OR v_receipt_factor < v_issue_factor
     OR (p_production_unit_id IS NOT NULL AND v_issue_factor < v_production_factor) THEN
    RAISE EXCEPTION 'inventory_unit_role_order_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT CASE WHEN is_standard THEN dimension END
  INTO v_receipt_dimension
  FROM public.units
  WHERE tenant_id = v_tenant AND id = p_receipt_unit_id;
  SELECT CASE WHEN is_standard THEN dimension END
  INTO v_issue_dimension
  FROM public.units
  WHERE tenant_id = v_tenant AND id = p_issue_unit_id;
  SELECT CASE WHEN is_standard THEN dimension END
  INTO v_production_dimension
  FROM public.units
  WHERE tenant_id = v_tenant AND id = p_production_unit_id;

  IF (v_receipt_dimension IS NOT NULL AND v_issue_dimension IS NOT NULL AND v_receipt_dimension IS DISTINCT FROM v_issue_dimension)
     OR (v_production_dimension IS NOT NULL AND (
       (v_receipt_dimension IS NOT NULL AND v_production_dimension IS DISTINCT FROM v_receipt_dimension)
       OR (v_issue_dimension IS NOT NULL AND v_production_dimension IS DISTINCT FROM v_issue_dimension)
     )) THEN
    RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT name
    INTO v_category_name
    FROM public.ingredient_categories
    WHERE id = p_category_id
      AND tenant_id = v_tenant
      AND is_active;
    IF v_category_name IS NULL THEN
      RAISE EXCEPTION 'category not found' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category, unit_cost, item_kind,
      storage_type, min_stock_level, max_stock_level, reorder_point,
      shelf_life_days, default_fulfill_site_kind, receipt_unit_id,
      issue_unit_id, production_unit_id
    ) VALUES (
      v_tenant, p_name, p_sku, p_category_id, v_category_name, 0,
      COALESCE(p_item_kind, 'raw_material'), COALESCE(p_storage_type, 'ambient'),
      COALESCE(p_min_stock_level, 0), p_max_stock_level, p_reorder_point,
      p_shelf_life_days, p_default_fulfill_site_kind, p_receipt_unit_id,
      p_issue_unit_id, p_production_unit_id
    ) RETURNING id INTO v_id;
  ELSE
    SELECT unit_cost
    INTO v_preserved_unit_cost
    FROM public.ingredients
    WHERE id = v_id
      AND tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient not found' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.stock_movements
      WHERE tenant_id = v_tenant
        AND ingredient_id = v_id
    ) THEN
      IF EXISTS (
        SELECT 1
        FROM public.ingredient_units
        WHERE tenant_id = v_tenant
          AND ingredient_id = v_id
          AND is_base
          AND unit_id IS DISTINCT FROM v_base_unit_id
      ) THEN
        RAISE EXCEPTION 'inventory_standard_unit_locked_by_stock_movements' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.stock_movements AS movement
        WHERE movement.tenant_id = v_tenant
          AND movement.ingredient_id = v_id
          AND movement.entry_unit_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_units) AS incoming
            WHERE (incoming ->> 'unit_id')::bigint = movement.entry_unit_id
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.ingredient_units AS unit_row
        JOIN (
          SELECT DISTINCT movement.entry_unit_id
          FROM public.stock_movements AS movement
          WHERE movement.tenant_id = v_tenant
            AND movement.ingredient_id = v_id
            AND movement.entry_unit_id IS NOT NULL
        ) AS used ON used.entry_unit_id = unit_row.unit_id
        JOIN LATERAL (
          SELECT incoming
          FROM jsonb_array_elements(p_units) AS incoming
          WHERE (incoming ->> 'unit_id')::bigint = unit_row.unit_id
          LIMIT 1
        ) AS payload ON TRUE
        WHERE unit_row.tenant_id = v_tenant
          AND unit_row.ingredient_id = v_id
          AND abs(unit_row.to_base_factor - public.inv_catalog_unit_to_base(v_base_unit_id, payload.incoming, p_units)) > 0.000000001
      ) THEN
        RAISE EXCEPTION 'inventory_unit_ladder_locked_by_stock_movements' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.production_recipes AS recipe
      WHERE recipe.tenant_id = v_tenant
        AND recipe.ingredient_id = v_id
        AND recipe.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_units) AS incoming
          WHERE (incoming ->> 'unit_id')::bigint = recipe.entry_unit_id
        )
    ) THEN
      RAISE EXCEPTION 'ingredient_unit_in_use_by_production_recipe' USING ERRCODE = '23503';
    END IF;

    UPDATE public.ingredients
    SET name = p_name,
        sku = p_sku,
        category_id = p_category_id,
        category = v_category_name,
        unit_cost = v_preserved_unit_cost,
        item_kind = COALESCE(p_item_kind, item_kind),
        storage_type = COALESCE(p_storage_type, storage_type),
        min_stock_level = COALESCE(p_min_stock_level, 0),
        max_stock_level = p_max_stock_level,
        reorder_point = p_reorder_point,
        shelf_life_days = p_shelf_life_days,
        default_fulfill_site_kind = p_default_fulfill_site_kind,
        receipt_unit_id = p_receipt_unit_id,
        issue_unit_id = p_issue_unit_id,
        production_unit_id = p_production_unit_id,
        updated_at = now()
    WHERE id = v_id
      AND tenant_id = v_tenant;
  END IF;

  UPDATE public.ingredient_units
  SET is_base = false
  WHERE tenant_id = v_tenant
    AND ingredient_id = v_id
    AND is_base
    AND unit_id IS DISTINCT FROM v_base_unit_id;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
    anchor_unit_id, anchor_factor, sort_order
  )
  SELECT
    v_tenant,
    v_id,
    (incoming ->> 'unit_id')::bigint,
    public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units),
    COALESCE((incoming ->> 'is_base')::boolean, false),
    NULLIF(incoming ->> 'anchor_unit_id', '')::bigint,
    NULLIF(incoming ->> 'anchor_factor', '')::numeric,
    COALESCE((incoming ->> 'sort_order')::integer, 0)
  FROM jsonb_array_elements(p_units) AS incoming
  ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key DO UPDATE
  SET to_base_factor = EXCLUDED.to_base_factor,
      is_base = EXCLUDED.is_base,
      anchor_unit_id = EXCLUDED.anchor_unit_id,
      anchor_factor = EXCLUDED.anchor_factor,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

  DELETE FROM public.ingredient_units AS unit_row
  WHERE unit_row.tenant_id = v_tenant
    AND unit_row.ingredient_id = v_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_units) AS incoming
      WHERE (incoming ->> 'unit_id')::bigint = unit_row.unit_id
    );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric,
  integer, jsonb, text, bigint, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric,
  integer, jsonb, text, bigint, bigint, bigint
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.execute_bulk_import_ingredients(
  p_rows jsonb
) RETURNS jsonb
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
    btrim(raw.value ->> 'name') AS name,
    NULLIF(btrim(COALESCE(raw.value ->> 'sku', '')), '') AS sku,
    btrim(raw.value ->> 'unit') AS unit,
    NULLIF(btrim(COALESCE(raw.value ->> 'category', '')), '') AS category,
    COALESCE(NULLIF(btrim(COALESCE(raw.value ->> 'item_kind', '')), ''), 'raw_material') AS item_kind,
    (raw.value ->> 'unit_cost')::numeric AS unit_cost,
    COALESCE((raw.value ->> 'min_stock_level')::numeric, 0) AS min_stock_level,
    (raw.value ->> 'max_stock_level')::numeric AS max_stock_level,
    (raw.value ->> 'reorder_point')::numeric AS reorder_point,
    COALESCE(NULLIF(btrim(COALESCE(raw.value ->> 'storage_type', '')), ''), 'ambient') AS storage_type,
    (raw.value ->> 'shelf_life_days')::integer AS shelf_life_days
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows
    WHERE COALESCE(name, '') = '' OR COALESCE(unit, '') = ''
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
  WHERE COALESCE(unit, '') <> ''
  ON CONFLICT ON CONSTRAINT units_code_tenant_key DO NOTHING;

  INSERT INTO public.ingredient_categories (tenant_id, name)
  SELECT DISTINCT v_tenant, category
  FROM pg_temp.bulk_import_ingredient_rows
  WHERE category IS NOT NULL
  ON CONFLICT ON CONSTRAINT ingredient_categories_name_tenant_key DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows AS rows
    LEFT JOIN public.units AS base_units
      ON base_units.tenant_id = v_tenant
     AND base_units.code = rows.unit
     AND base_units.is_active
    WHERE base_units.id IS NULL
  ) THEN
    RAISE EXCEPTION 'unit_not_found' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows AS rows
    LEFT JOIN public.ingredient_categories AS categories
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
    JOIN pg_temp.bulk_import_ingredient_rows AS rows ON rows.name = ingredients.name
    WHERE ingredients.tenant_id = v_tenant
  ), upserted AS (
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category, unit_cost, item_kind,
      storage_type, min_stock_level, max_stock_level, reorder_point,
      shelf_life_days, receipt_unit_id, issue_unit_id
    )
    SELECT
      v_tenant, rows.name, rows.sku, categories.id, categories.name,
      rows.unit_cost, rows.item_kind, rows.storage_type, rows.min_stock_level,
      rows.max_stock_level, rows.reorder_point, rows.shelf_life_days,
      base_units.id, base_units.id
    FROM pg_temp.bulk_import_ingredient_rows AS rows
    JOIN public.units AS base_units
      ON base_units.tenant_id = v_tenant
     AND base_units.code = rows.unit
     AND base_units.is_active
    LEFT JOIN public.ingredient_categories AS categories
      ON categories.tenant_id = v_tenant
     AND categories.name = rows.category
     AND categories.is_active
    ON CONFLICT ON CONSTRAINT ingredients_name_tenant_id_key DO UPDATE
    SET sku = EXCLUDED.sku,
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

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_upserted AS upserted
    JOIN pg_temp.bulk_import_ingredient_rows AS rows ON rows.name = upserted.name
    JOIN public.units AS import_units
      ON import_units.tenant_id = v_tenant
     AND import_units.code = rows.unit
     AND import_units.is_active
    JOIN public.ingredient_units AS existing_base
      ON existing_base.tenant_id = v_tenant
     AND existing_base.ingredient_id = upserted.id
     AND existing_base.is_base
    WHERE upserted.existed
      AND existing_base.unit_id IS DISTINCT FROM import_units.id
  ) THEN
    RAISE EXCEPTION 'bulk_import_base_unit_change_forbidden' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, sort_order
  )
  SELECT v_tenant, upserted.id, base_units.id, 1::numeric, true, 0
  FROM pg_temp.bulk_import_ingredient_rows AS rows
  JOIN pg_temp.bulk_import_ingredient_upserted AS upserted ON upserted.name = rows.name
  JOIN public.units AS base_units
    ON base_units.tenant_id = v_tenant
   AND base_units.code = rows.unit
   AND base_units.is_active
  ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key DO UPDATE
  SET to_base_factor = 1,
      is_base = true,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

  SELECT count(*) FILTER (WHERE NOT existed), count(*) FILTER (WHERE existed)
  INTO v_inserted, v_updated
  FROM pg_temp.bulk_import_ingredient_upserted;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$$;

DROP FUNCTION public.save_ingredient_catalog_v2(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric,
  integer, jsonb, text, bigint, bigint, bigint
);
DROP FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric,
  integer, jsonb, text
);
DROP FUNCTION public.upsert_ingredient_catalog(
  bigint, text, text, bigint, numeric, text, text, numeric, numeric,
  numeric, integer, jsonb
);
DROP FUNCTION private.execute_upsert_ingredient_catalog(
  bigint, text, text, bigint, numeric, text, text, numeric, numeric,
  numeric, integer, jsonb
);
