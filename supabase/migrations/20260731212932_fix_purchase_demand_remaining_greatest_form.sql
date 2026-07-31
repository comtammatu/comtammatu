-- GREATEST is a special SQL form; schema-qualified pg_catalog.greatest
-- has no numeric overload under search_path ''.

CREATE OR REPLACE FUNCTION private.purchase_request_item_remaining_demand_qty(
  p_tenant_id bigint,
  p_request_item_id bigint
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_demand_qty numeric;
  v_demand_factor numeric;
  v_ordered_base numeric;
  v_remaining numeric;
BEGIN
  SELECT
    demand_item.quantity,
    request_unit.to_base_factor
  INTO v_demand_qty, v_demand_factor
  FROM public.purchase_request_items AS demand_item
  JOIN public.ingredient_units AS request_unit
    ON request_unit.tenant_id = demand_item.tenant_id
   AND request_unit.ingredient_id = demand_item.ingredient_id
   AND request_unit.unit_id = demand_item.entry_unit_id
  WHERE demand_item.tenant_id = p_tenant_id
    AND demand_item.id = p_request_item_id;

  IF v_demand_qty IS NULL
     OR v_demand_factor IS NULL
     OR v_demand_factor <= 0 THEN
    RAISE EXCEPTION 'purchase_demand_coverage_unit_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_ordered_base := private.purchase_request_item_ordered_base(
    p_tenant_id,
    p_request_item_id
  );

  v_remaining :=
    v_demand_qty - pg_catalog.round(v_ordered_base / v_demand_factor, 3);

  IF v_remaining < 0 THEN
    RETURN 0;
  END IF;

  RETURN v_remaining;
END;
$$;
