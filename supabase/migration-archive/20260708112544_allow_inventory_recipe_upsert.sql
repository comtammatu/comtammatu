CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(
  p_menu_item_id bigint,
  p_lines jsonb,
  p_old_menu_item_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_kept bigint[] := ARRAY[]::bigint[];
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (
    public.has_permission_any('inventory:write')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.menu_items mi
    WHERE mi.id = p_menu_item_id
      AND mi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023';
  END IF;

  IF p_old_menu_item_id IS NOT NULL AND p_old_menu_item_id <> p_menu_item_id THEN
    DELETE FROM public.recipes r
    WHERE r.tenant_id = v_tenant
      AND r.menu_item_id = p_old_menu_item_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::bigint;
    v_entry_unit_id := NULLIF(v_line->>'entry_unit_id', '')::bigint;

    INSERT INTO public.recipes (
      tenant_id,
      menu_item_id,
      ingredient_id,
      quantity,
      unit,
      entry_unit_id,
      note,
      yield_factor
    )
    VALUES (
      v_tenant,
      p_menu_item_id,
      v_ingredient_id,
      (v_line->>'quantity')::numeric,
      public.inventory_entry_unit_code(v_tenant, v_ingredient_id, v_entry_unit_id),
      v_entry_unit_id,
      NULLIF(v_line->>'note', ''),
      COALESCE(NULLIF(v_line->>'yield_factor', '')::numeric, 1.000)
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id,
      note = EXCLUDED.note,
      yield_factor = EXCLUDED.yield_factor;

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.recipes r
  WHERE r.tenant_id = v_tenant
    AND r.menu_item_id = p_menu_item_id
    AND NOT (r.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'menu_item_id', p_menu_item_id,
    'kept_count', COALESCE(array_length(v_kept, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_recipe_lines(bigint, jsonb, bigint) TO authenticated, service_role;
