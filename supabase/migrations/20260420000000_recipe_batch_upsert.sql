-- =============================================================
-- Recipe batch upsert RPC
-- Purpose: let the recipe dialog replace the whole set of ingredient
-- lines for a finished-product menu item in one atomic call.
-- Diff semantics:
--   • Lines present in p_lines → INSERT or UPDATE
--   • Lines not present in p_lines → DELETE
-- =============================================================

CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(
  p_menu_item_id BIGINT,
  p_lines        JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_role    TEXT   := public.auth_role();
  v_kept    BIGINT[] := ARRAY[]::BIGINT[];
  v_line    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'warehouse_manager', 'production_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Validate menu item belongs to tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = p_menu_item_id AND mi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023';
  END IF;

  -- Upsert each line; collect ingredient_ids we keep
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF (v_line->>'ingredient_id') IS NULL
       OR (v_line->>'quantity')   IS NULL
       OR (v_line->>'unit')       IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.recipes (
      tenant_id, menu_item_id, ingredient_id,
      quantity, unit, note, yield_factor
    )
    VALUES (
      v_tenant,
      p_menu_item_id,
      (v_line->>'ingredient_id')::BIGINT,
      (v_line->>'quantity')::NUMERIC,
      v_line->>'unit',
      NULLIF(v_line->>'note', ''),
      COALESCE((v_line->>'yield_factor')::NUMERIC, 1.000)
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity     = EXCLUDED.quantity,
      unit         = EXCLUDED.unit,
      note         = EXCLUDED.note,
      yield_factor = EXCLUDED.yield_factor;

    v_kept := v_kept || (v_line->>'ingredient_id')::BIGINT;
  END LOOP;

  -- Delete lines no longer in the payload
  DELETE FROM public.recipes r
  WHERE r.tenant_id = v_tenant
    AND r.menu_item_id = p_menu_item_id
    AND NOT (r.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'menu_item_id', p_menu_item_id,
    'kept_count',   COALESCE(array_length(v_kept, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_recipe_lines(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_recipe_lines(BIGINT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.upsert_recipe_lines(BIGINT, JSONB)
  IS 'Atomically replace the recipe lines of a menu item (finished product). Inserts/updates provided lines and deletes removed ones.';
