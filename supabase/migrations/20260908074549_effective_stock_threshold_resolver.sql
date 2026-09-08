-- Migration: effective_stock_threshold_resolver

CREATE FUNCTION private.resolve_effective_stock_thresholds(
  p_ingredient_min numeric,
  p_ingredient_target numeric,
  p_ingredient_capacity numeric,
  p_location_min numeric,
  p_location_target numeric,
  p_location_capacity numeric
)
RETURNS TABLE (
  min_stock_level numeric,
  target_stock_level numeric,
  capacity_limit numeric
)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_quantity numeric;
BEGIN
  min_stock_level := COALESCE(p_location_min, p_ingredient_min, 0);
  target_stock_level := COALESCE(
    p_location_target, p_ingredient_target, min_stock_level * 2
  );
  capacity_limit := COALESCE(p_location_capacity, p_ingredient_capacity);

  -- Validate shadowed inputs and the derived target without rounding via typmod.
  FOREACH v_quantity IN ARRAY ARRAY[
    p_ingredient_min, p_ingredient_target, p_ingredient_capacity,
    p_location_min, p_location_target, p_location_capacity,
    target_stock_level
  ] LOOP
    IF v_quantity IS NOT NULL AND (
      v_quantity::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_quantity < 0
      OR v_quantity > 999999999999.999
      OR pg_catalog.trunc(v_quantity, 3) <> v_quantity
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023', MESSAGE = 'stock_threshold_quantity_invalid';
    END IF;
  END LOOP;

  IF min_stock_level > target_stock_level
    OR (capacity_limit IS NOT NULL AND target_stock_level > capacity_limit)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'stock_threshold_order_invalid';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_effective_stock_thresholds(
  numeric, numeric, numeric, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.resolve_effective_stock_thresholds(
  numeric, numeric, numeric, numeric, numeric, numeric
) IS 'Pure replenishment threshold contract: fieldwise NULL inheritance, explicit zero, numeric(15,3), NULL unbounded capacity. Internal to future authorized RPCs; existing reorder readers and writers do not use it.';
