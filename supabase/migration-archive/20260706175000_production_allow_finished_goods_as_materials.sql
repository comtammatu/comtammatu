-- Allow finished goods (thành phẩm) to be selected as raw materials (nguyên liệu) in production recipes.

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_lines jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid           UUID   := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_kept          BIGINT[] := ARRAY[]::BIGINT[];
  v_line          JSONB;
  v_ingredient_id BIGINT;
  v_entry_unit_id BIGINT;
  v_quantity      NUMERIC;
  v_yield_factor  NUMERIC;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.ingredients i
    WHERE i.id = p_finished_good_id AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good' AND i.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines_must_not_be_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_entry_unit_id := NULLIF(v_line->>'entry_unit_id', '')::BIGINT;
    v_quantity := (v_line->>'quantity')::NUMERIC;
    v_yield_factor := COALESCE(NULLIF(v_line->>'yield_factor', '')::NUMERIC, 1.000);

    IF v_quantity <= 0 OR v_yield_factor <= 0 THEN
      RAISE EXCEPTION 'invalid_line_quantity' USING ERRCODE = '22023';
    END IF;

    IF v_ingredient_id = ANY(v_kept) THEN
      RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ingredients i
      WHERE i.id = v_ingredient_id AND i.tenant_id = v_tenant
        AND i.item_kind IN ('raw_material', 'finished_good') AND i.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.production_recipes (
      tenant_id, finished_good_id, ingredient_id,
      quantity, unit, entry_unit_id, note, yield_factor
    )
    VALUES (
      v_tenant, p_finished_good_id, v_ingredient_id,
      v_quantity,
      public.inventory_entry_unit_code(v_tenant, v_ingredient_id, v_entry_unit_id),
      v_entry_unit_id,
      NULLIF(v_line->>'note', ''), v_yield_factor
    )
    ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id,
      note = EXCLUDED.note, yield_factor = EXCLUDED.yield_factor;

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.production_recipes pr
  WHERE pr.tenant_id = v_tenant
    AND pr.finished_good_id = p_finished_good_id
    AND NOT (pr.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'finished_good_id', p_finished_good_id,
    'kept_count', COALESCE(array_length(v_kept, 1), 0)
  );
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
     AND ingredients.item_kind IN ('raw_material', 'finished_good')
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
    public.inventory_entry_unit_code(v_tenant, lines.ingredient_id, lines.entry_unit_id),
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
