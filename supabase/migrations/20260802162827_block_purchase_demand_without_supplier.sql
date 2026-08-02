DO $block_purchase_demand_without_supplier$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.save_purchase_demand(bigint,bigint,date,text,jsonb,boolean,uuid)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    $$  v_demand_id := (v_saved ->> 'request_id')::bigint;

  UPDATE public.purchase_requests$$,
    $$  v_demand_id := (v_saved ->> 'request_id')::bigint;

  IF v_status = 'pending_allocation'
     AND EXISTS (
       SELECT 1
       FROM public.purchase_request_items AS demand_item
       WHERE demand_item.tenant_id = v_tenant
         AND demand_item.purchase_request_id = v_demand_id
         AND NOT EXISTS (
           SELECT 1
           FROM public.supplier_items AS supplier_item
           JOIN public.suppliers AS supplier
             ON supplier.id = supplier_item.supplier_id
            AND supplier.tenant_id = supplier_item.tenant_id
            AND supplier.is_active
           WHERE supplier_item.tenant_id = v_tenant
             AND supplier_item.ingredient_id = demand_item.ingredient_id
             AND supplier_item.is_active
         )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_requests$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'save_purchase_demand_supplier_guard_not_found';
  END IF;
  EXECUTE v_definition;
END;
$block_purchase_demand_without_supplier$;
