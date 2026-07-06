-- Allow changing recipe output product (menu_item or finished_good) during edit.
-- Drops and recreates atomic recipe upsert RPCs to accept an optional p_old_*_id parameter.

-- 1. Drop old functions to avoid signature overload conflicts
DROP FUNCTION IF EXISTS public.upsert_recipe_lines(bigint, jsonb);
DROP FUNCTION IF EXISTS public.upsert_production_recipe_lines(bigint, jsonb);

-- 2. Recreate upsert_recipe_lines with optional p_old_menu_item_id
CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(
  p_menu_item_id bigint,
  p_lines jsonb,
  p_old_menu_item_id bigint DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_kept   BIGINT[] := ARRAY[]::BIGINT[];
  v_line   JSONB;
  v_ingredient_id BIGINT;
  v_entry_unit_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND mi.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023'; END IF;

  -- If old menu item is provided and differs from new menu item, clear the old recipe lines
  IF p_old_menu_item_id IS NOT NULL AND p_old_menu_item_id <> p_menu_item_id THEN
    DELETE FROM public.recipes r
    WHERE r.tenant_id = v_tenant AND r.menu_item_id = p_old_menu_item_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_entry_unit_id := NULLIF(v_line->>'entry_unit_id', '')::BIGINT;

    INSERT INTO public.recipes (tenant_id, menu_item_id, ingredient_id, quantity, unit, entry_unit_id, note, yield_factor)
    VALUES (
      v_tenant,
      p_menu_item_id,
      v_ingredient_id,
      (v_line->>'quantity')::NUMERIC,
      public.inventory_entry_unit_code(v_tenant, v_ingredient_id, v_entry_unit_id),
      v_entry_unit_id,
      NULLIF(v_line->>'note',''),
      COALESCE(NULLIF(v_line->>'yield_factor', '')::NUMERIC, 1.000)
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit,
                  entry_unit_id = EXCLUDED.entry_unit_id,
                  note = EXCLUDED.note, yield_factor = EXCLUDED.yield_factor;
    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.recipes r
  WHERE r.tenant_id = v_tenant AND r.menu_item_id = p_menu_item_id
    AND NOT (r.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'menu_item_id', p_menu_item_id,
    'kept_count', COALESCE(array_length(v_kept, 1), 0)
  );
END;
$$;

-- 3. Recreate upsert_production_recipe_lines with optional p_old_finished_good_id
CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_lines jsonb,
  p_old_finished_good_id bigint DEFAULT NULL
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

  -- If old finished good is provided and differs from new finished good, clear the old production recipe lines
  IF p_old_finished_good_id IS NOT NULL AND p_old_finished_good_id <> p_finished_good_id THEN
    DELETE FROM public.production_recipes pr
    WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = p_old_finished_good_id;
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

-- 4. Grant execute permissions to roles
REVOKE ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb, bigint) TO authenticated, service_role;

-- 5. Add comments describing functions
COMMENT ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) IS 'Atomically replace the recipe lines of a menu item (finished product). Inserts/updates provided lines, clears old menu item recipe if changed, and deletes removed ones.';
COMMENT ON FUNCTION public.upsert_production_recipe_lines(bigint, jsonb, bigint) IS 'Atomically replaces production BOM lines for one finished good, clearing old finished good recipe if changed.';
