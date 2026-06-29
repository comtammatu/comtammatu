-- Phase B foundation: convert an entered (ingredient, unit, qty) to the
-- ingredient's BASE unit using ingredient_units.to_base_factor. Fail-closed:
-- a unit not registered/active for the ingredient raises (no silent mis-post).
-- NULL unit means "already in base" (legacy/back-compat callers).
CREATE OR REPLACE FUNCTION public.inv_to_base(
  p_ingredient_id bigint,
  p_unit_id       bigint,
  p_qty           numeric
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_factor numeric;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_unit_id IS NULL THEN
    RETURN p_qty;
  END IF;
  SELECT to_base_factor INTO v_factor
  FROM public.ingredient_units
  WHERE ingredient_id = p_ingredient_id AND unit_id = p_unit_id AND is_active;
  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'unit % is not valid for ingredient %', p_unit_id, p_ingredient_id
      USING ERRCODE = '23503';
  END IF;
  RETURN p_qty * v_factor;
END $$;

GRANT EXECUTE ON FUNCTION public.inv_to_base(bigint, bigint, numeric) TO authenticated;
