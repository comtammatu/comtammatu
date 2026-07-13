BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ingredients
    WHERE shelf_life_days IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_shelf_life_retirement_blocked';
  END IF;
END;
$$;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_shelf_life_days_retirement_guard
  CHECK (shelf_life_days IS NULL) NOT VALID;

ALTER TABLE public.ingredients
  VALIDATE CONSTRAINT ingredients_shelf_life_days_retirement_guard;

CREATE OR REPLACE FUNCTION public.upsert_ingredient_catalog(
  p_ingredient_id bigint,
  p_name text,
  p_sku text,
  p_category_id bigint,
  p_unit_cost numeric,
  p_item_kind text,
  p_storage_type text,
  p_min_stock_level numeric,
  p_max_stock_level numeric,
  p_reorder_point numeric,
  p_units jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN public.upsert_ingredient_catalog(
    p_ingredient_id,
    p_name,
    p_sku,
    p_category_id,
    p_unit_cost,
    p_item_kind,
    p_storage_type,
    p_min_stock_level,
    p_max_stock_level,
    p_reorder_point,
    NULL::integer,
    p_units
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  numeric,
  text,
  text,
  numeric,
  numeric,
  numeric,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  numeric,
  text,
  text,
  numeric,
  numeric,
  numeric,
  jsonb
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
