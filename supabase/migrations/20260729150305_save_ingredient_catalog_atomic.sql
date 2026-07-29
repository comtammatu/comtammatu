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
  p_default_fulfill_site_kind text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_preserved_unit_cost numeric;
  v_ingredient_id bigint;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_ingredient_id IS NULL THEN
    v_preserved_unit_cost := 0;
  ELSE
    SELECT ingredient.unit_cost
    INTO v_preserved_unit_cost
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = p_ingredient_id
      AND ingredient.tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient not found'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_ingredient_id := private.execute_upsert_ingredient_catalog(
    p_ingredient_id,
    p_name,
    p_sku,
    p_category_id,
    v_preserved_unit_cost,
    p_item_kind,
    p_storage_type,
    p_min_stock_level,
    p_max_stock_level,
    p_reorder_point,
    p_shelf_life_days,
    p_units
  );

  UPDATE public.ingredients AS ingredient
  SET default_fulfill_site_kind = p_default_fulfill_site_kind
  WHERE ingredient.id = v_ingredient_id
    AND ingredient.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ingredient not found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_ingredient_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  jsonb,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  jsonb,
  text
) TO authenticated, service_role;
