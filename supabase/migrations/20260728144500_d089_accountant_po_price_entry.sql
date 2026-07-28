-- Procurement readers need item/unit labels to prepare purchase orders.
ALTER POLICY ingredients_select
ON public.ingredients
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    (SELECT public.has_permission_any('inventory:read'))
    OR (SELECT public.has_permission_any('procurement:read'))
  )
);

ALTER POLICY units_select
ON public.units
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    (SELECT public.has_permission_any('inventory:read'))
    OR (SELECT public.has_permission_any('procurement:read'))
  )
);

ALTER POLICY ingredient_units_select
ON public.ingredient_units
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    (SELECT public.has_permission_any('inventory:read'))
    OR (SELECT public.has_permission_any('procurement:read'))
  )
);

ALTER POLICY supplier_items_read
ON public.supplier_items
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    (SELECT public.has_permission_any('procurement:price_list_read'))
    OR (SELECT public.has_permission_any('procurement:read'))
  )
);

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices(
  p_po_id bigint,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_po record;
  v_input_count integer;
  v_distinct_count integer;
  v_expected_count integer;
  v_updated_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'update_purchase_order_prices: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'update_purchase_order_prices: invalid input'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id, branch_id, status
    INTO v_po
    FROM public.purchase_orders
   WHERE id = p_po_id
     AND tenant_id = v_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_purchase_order_prices: PO not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'update_purchase_order_prices: forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'update_purchase_order_prices: PO is not draft'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), count(DISTINCT line_id)
    INTO v_input_count, v_distinct_count
    FROM jsonb_to_recordset(p_lines) AS line(line_id bigint, unit_price numeric);

  SELECT count(*)
    INTO v_expected_count
    FROM public.purchase_order_items
   WHERE tenant_id = v_tenant_id
     AND po_id = p_po_id;

  IF v_input_count <> v_distinct_count
     OR v_input_count <> v_expected_count
     OR EXISTS (
       SELECT 1
         FROM jsonb_to_recordset(p_lines) AS line(line_id bigint, unit_price numeric)
         LEFT JOIN public.purchase_order_items poi
           ON poi.id = line.line_id
          AND poi.tenant_id = v_tenant_id
          AND poi.po_id = p_po_id
        WHERE poi.id IS NULL
           OR line.unit_price IS NULL
           OR line.unit_price <= 0
     ) THEN
    RAISE EXCEPTION 'update_purchase_order_prices: invalid lines'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.purchase_order_items poi
     SET unit_price_est = line.unit_price,
         line_total = round(poi.quantity * line.unit_price, 2)
    FROM jsonb_to_recordset(p_lines) AS line(line_id bigint, unit_price numeric)
   WHERE poi.id = line.line_id
     AND poi.tenant_id = v_tenant_id
     AND poi.po_id = p_po_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  PERFORM public.log_audit(
    'inventory.po.prices_updated',
    'purchase_order',
    p_po_id,
    NULL,
    jsonb_build_object('updated_lines', v_updated_count)
  );

  RETURN jsonb_build_object('id', p_po_id, 'updated_lines', v_updated_count);
END;
$$;

REVOKE ALL ON FUNCTION public.update_purchase_order_prices(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_prices(bigint, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.update_purchase_order_prices(bigint, jsonb) IS
  'Atomically sets positive prices for every line of a draft PO before approval.';
