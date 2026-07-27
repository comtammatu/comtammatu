-- D078 retired branch kitchen locations. Repair the exact integer overload
-- that the original dynamic rewrite skipped.
DO $$
DECLARE
  v_signature regprocedure := to_regprocedure(
    'public.add_menu_item_kitchen_stock_exception(bigint,bigint,integer,text)'
  );
  v_definition text;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'menu_limit_replenishment_rpc_missing'
      USING ERRCODE = '42883';
  END IF;

  SELECT pg_get_functiondef(v_signature)
    INTO v_definition;

  IF position('loc.location_kind = ''kitchen''' IN v_definition) > 0 THEN
    v_definition := replace(
      v_definition,
      'loc.location_kind = ''kitchen''',
      'loc.location_kind = ''warehouse'''
    );
    v_definition := replace(
      v_definition,
      'default_kitchen_location_required',
      'default_warehouse_location_required'
    );
    EXECUTE v_definition;
  END IF;

  SELECT pg_get_functiondef(v_signature)
    INTO v_definition;

  IF position('loc.location_kind = ''warehouse''' IN v_definition) = 0
     OR position('loc.location_kind = ''kitchen''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'menu_limit_replenishment_warehouse_repair_failed';
  END IF;
END
$$;

COMMENT ON FUNCTION public.add_menu_item_kitchen_stock_exception(
  bigint,
  bigint,
  integer,
  text
) IS
'Menu-Limits controlled +1/+2 branch warehouse replenishment by menu item recipe. Writes adjustment stock_movements only.';
