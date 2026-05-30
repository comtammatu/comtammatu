-- Production BOM batch upsert for import/export.
-- Keeps all lines for one finished good atomic and mirrors the sales recipe
-- batch-upsert shape without conflating menu recipes with production BOMs.

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id BIGINT,
  p_lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid           UUID   := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_kept          BIGINT[] := ARRAY[]::BIGINT[];
  v_line          JSONB;
  v_ingredient_id BIGINT;
  v_quantity      NUMERIC;
  v_yield_factor  NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients i
    WHERE i.id = p_finished_good_id
      AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good'
      AND i.is_active = TRUE
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
    IF (v_line->>'ingredient_id') IS NULL
       OR (v_line->>'quantity') IS NULL
       OR (v_line->>'unit') IS NULL
       OR btrim(v_line->>'unit') = '' THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_quantity := (v_line->>'quantity')::NUMERIC;
    v_yield_factor := COALESCE(
      NULLIF(v_line->>'yield_factor', '')::NUMERIC,
      1.000
    );

    IF v_quantity <= 0 OR v_yield_factor <= 0 THEN
      RAISE EXCEPTION 'invalid_line_quantity' USING ERRCODE = '22023';
    END IF;

    IF v_ingredient_id = ANY(v_kept) THEN
      RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients i
      WHERE i.id = v_ingredient_id
        AND i.tenant_id = v_tenant
        AND i.item_kind = 'raw_material'
        AND i.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.production_recipes (
      tenant_id,
      finished_good_id,
      ingredient_id,
      quantity,
      unit,
      note,
      yield_factor
    )
    VALUES (
      v_tenant,
      p_finished_good_id,
      v_ingredient_id,
      v_quantity,
      btrim(v_line->>'unit'),
      NULLIF(v_line->>'note', ''),
      v_yield_factor
    )
    ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      note = EXCLUDED.note,
      yield_factor = EXCLUDED.yield_factor;

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

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(BIGINT, JSONB)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_production_recipe_lines(BIGINT, JSONB)
TO authenticated;

COMMENT ON FUNCTION public.upsert_production_recipe_lines(BIGINT, JSONB)
IS 'Atomically replaces production BOM lines for one finished good.';
