-- Expand every inventory document boundary to any active ingredient unit.
-- Legacy ingredient role columns remain compatibility mirrors until the
-- destructive contract migration can run after the roleless runtime soaks.

CREATE OR REPLACE FUNCTION private.entry_unit_is_active_for_ingredient(
  p_tenant_id bigint,
  p_ingredient_id bigint,
  p_entry_unit_id bigint
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit_row
      ON unit_row.tenant_id = ingredient_unit.tenant_id
     AND unit_row.id = ingredient_unit.unit_id
     AND unit_row.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = p_tenant_id
      AND ingredient_unit.ingredient_id = p_ingredient_id
      AND ingredient_unit.unit_id = p_entry_unit_id
      AND ingredient_unit.is_active IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION private.entry_unit_matches_roles(
  p_tenant_id bigint,
  p_ingredient_id bigint,
  p_entry_unit_id bigint,
  p_roles text
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT private.entry_unit_is_active_for_ingredient(
    p_tenant_id,
    p_ingredient_id,
    p_entry_unit_id
  );
$$;

CREATE OR REPLACE FUNCTION private.enforce_stock_movement_unit_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT private.entry_unit_is_active_for_ingredient(
    NEW.tenant_id,
    NEW.ingredient_id,
    NEW.entry_unit_id
  ) THEN
    RAISE EXCEPTION 'inventory_unit_not_active_for_ingredient'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_stock_issue_line(
  p_issue_id bigint,
  p_ingredient_id bigint,
  p_quantity numeric,
  p_entry_unit_id bigint,
  p_reason text DEFAULT NULL,
  p_photo_urls text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue public.stock_issues%ROWTYPE;
  v_base_quantity numeric;
  v_available_quantity numeric;
  v_item_id bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_quantity IS NULL
     OR p_quantity <= 0
     OR p_quantity = 'NaN'::numeric
     OR p_quantity = 'Infinity'::numeric
     OR p_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'issue_line_quantity_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_photo_urls IS NOT NULL
     AND pg_catalog.cardinality(p_photo_urls) > 1 THEN
    RAISE EXCEPTION 'issue_line_photo_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT issue.*
  INTO v_issue
  FROM public.stock_issues AS issue
  WHERE issue.id = p_issue_id
    AND issue.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.created_by IS DISTINCT FROM v_uid
     OR NOT public.has_permission(v_issue.branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden_inventory_write' USING ERRCODE = '42501';
  END IF;
  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_issue.issue_type = 'writeoff'
     AND v_issue.approval_status <> 'not_required' THEN
    RAISE EXCEPTION 'writeoff_locked' USING ERRCODE = '42501';
  END IF;
  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing' USING ERRCODE = '23502';
  END IF;

  PERFORM location.id
  FROM public.inventory_locations AS location
  WHERE location.id = v_issue.source_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = v_issue.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_source_location_invalid' USING ERRCODE = '23514';
  END IF;

  PERFORM ingredient.id
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = p_ingredient_id
    AND ingredient.tenant_id = v_tenant
    AND ingredient.is_active IS TRUE
    AND private.entry_unit_is_active_for_ingredient(
      v_tenant,
      p_ingredient_id,
      p_entry_unit_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_line_unit_invalid' USING ERRCODE = '23503';
  END IF;

  v_base_quantity := public.inv_to_base_for_tenant(
    v_tenant,
    p_ingredient_id,
    p_entry_unit_id,
    p_quantity
  );

  SELECT stock.current_quantity
  INTO v_available_quantity
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = v_issue.branch_id
    AND stock.location_id = v_issue.source_location_id
    AND stock.ingredient_id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND OR v_base_quantity > v_available_quantity THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_issue_items (
    tenant_id,
    issue_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    unit_cost,
    reason,
    photo_urls
  ) VALUES (
    v_tenant,
    p_issue_id,
    p_ingredient_id,
    p_quantity,
    p_entry_unit_id,
    0,
    nullif(pg_catalog.btrim(p_reason), ''),
    coalesce(p_photo_urls, ARRAY[]::text[])
  )
  ON CONFLICT (issue_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    entry_unit_id = EXCLUDED.entry_unit_id,
    reason = EXCLUDED.reason,
    photo_urls = CASE
      WHEN p_photo_urls IS NULL THEN stock_issue_items.photo_urls
      ELSE EXCLUDED.photo_urls
    END
  RETURNING id INTO v_item_id;

  RETURN jsonb_build_object('success', TRUE, 'item_id', v_item_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_stock_issue_line(
  bigint, bigint, numeric, bigint, text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_stock_issue_line(
  bigint, bigint, numeric, bigint, text, text[]
) TO authenticated, service_role;

REVOKE DELETE, MAINTAIN ON public.stock_issue_items
FROM anon, authenticated;
REVOKE INSERT (
  tenant_id, issue_id, ingredient_id, quantity,
  unit_cost, reason, photo_urls, entry_unit_id
) ON public.stock_issue_items FROM authenticated;
REVOKE UPDATE (
  tenant_id, issue_id, ingredient_id, quantity,
  unit_cost, reason, photo_urls, entry_unit_id
) ON public.stock_issue_items FROM authenticated;

COMMENT ON FUNCTION public.save_stock_issue_line(
  bigint, bigint, numeric, bigint, text, text[]
) IS 'Saves one draft stock-issue line after enforcing actor, tenant, active ingredient unit, location, and stock boundaries.';

DO $migration$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'jsonb_array_length(p_units) NOT BETWEEN 1 AND 3',
    'jsonb_array_length(p_units) NOT BETWEEN 1 AND 20'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'save_ingredient_catalog_unit_limit_not_found';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.adjust_stock_exception(bigint,bigint,numeric,bigint,text)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    E'    AND p_entry_unit_id IN (\n      ingredient.issue_unit_id,\n      ingredient.receipt_unit_id\n    )',
    ''
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'adjust_stock_exception_active_unit_guard_not_found';
  END IF;
  EXECUTE v_definition;

  v_definition := pg_get_functiondef(
    'public.adjust_stock_exception(bigint,bigint,numeric,text)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    E'    ingredient.issue_unit_id,\n    ingredient_unit.to_base_factor',
    E'    ingredient_unit.unit_id,\n    ingredient_unit.to_base_factor'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'adjust_stock_exception_standard_unit_select_not_found';
  END IF;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    E'   AND ingredient_unit.unit_id = ingredient.issue_unit_id\n   AND ingredient_unit.is_active IS TRUE',
    E'   AND ingredient_unit.is_base IS TRUE\n   AND ingredient_unit.is_active IS TRUE'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'adjust_stock_exception_standard_unit_join_not_found';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.create_inventory_document_correction(text,bigint,bigint,bigint,numeric,text,uuid)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'AND ingredient_unit.unit_id = ingredient.issue_unit_id',
    'AND ingredient_unit.is_base IS TRUE'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'document_correction_standard_unit_not_found';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.review_purchase_demand(bigint,text,jsonb,text,uuid)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $old$  IF EXISTS (
    SELECT 1
    FROM public.purchase_request_allocations AS allocation
    JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.purchase_request_item_id
     AND demand_item.tenant_id = allocation.tenant_id
     AND demand_item.purchase_request_id = allocation.purchase_request_id
    LEFT JOIN public.ingredients AS ingredient
      ON ingredient.id = demand_item.ingredient_id
     AND ingredient.tenant_id = demand_item.tenant_id
    LEFT JOIN public.ingredient_units AS request_unit
      ON request_unit.tenant_id = demand_item.tenant_id
     AND request_unit.ingredient_id = demand_item.ingredient_id
     AND request_unit.unit_id = demand_item.entry_unit_id
    LEFT JOIN public.ingredient_units AS receipt_unit
      ON receipt_unit.tenant_id = ingredient.tenant_id
     AND receipt_unit.ingredient_id = ingredient.id
     AND receipt_unit.unit_id = ingredient.receipt_unit_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.purchase_request_id = p_demand_id
      AND (
        ingredient.id IS NULL
        OR ingredient.receipt_unit_id IS NULL
        OR request_unit.unit_id IS NULL
        OR receipt_unit.unit_id IS NULL
        OR receipt_unit.is_active IS NOT TRUE
        OR request_unit.to_base_factor <= 0
        OR receipt_unit.to_base_factor <= 0
        OR allocation.quantity * request_unit.to_base_factor
          / receipt_unit.to_base_factor
          <> pg_catalog.round(
            allocation.quantity * request_unit.to_base_factor
              / receipt_unit.to_base_factor,
            3
          )
      )
  ) THEN
    RAISE EXCEPTION 'purchase_demand_receipt_unit_conversion_invalid'
      USING ERRCODE = '23514';
  END IF;

$old$,
    ''
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'review_purchase_demand_conversion_precheck_not_found';
  END IF;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $old$      allocation.quantity * request_unit.to_base_factor / receipt_unit.to_base_factor,
      ingredient.receipt_unit_id,
      NULL,
      NULL
    FROM public.purchase_request_allocations AS allocation
    JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.purchase_request_item_id
     AND demand_item.tenant_id = allocation.tenant_id
     AND demand_item.purchase_request_id = allocation.purchase_request_id
    JOIN public.ingredients AS ingredient
      ON ingredient.id = demand_item.ingredient_id
     AND ingredient.tenant_id = demand_item.tenant_id
    JOIN public.ingredient_units AS request_unit
      ON request_unit.tenant_id = demand_item.tenant_id
     AND request_unit.ingredient_id = demand_item.ingredient_id
     AND request_unit.unit_id = demand_item.entry_unit_id
    JOIN public.ingredient_units AS receipt_unit
      ON receipt_unit.tenant_id = ingredient.tenant_id
     AND receipt_unit.ingredient_id = ingredient.id
     AND receipt_unit.unit_id = ingredient.receipt_unit_id$old$,
    $new$      allocation.quantity,
      demand_item.entry_unit_id,
      NULL,
      NULL
    FROM public.purchase_request_allocations AS allocation
    JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.purchase_request_item_id
     AND demand_item.tenant_id = allocation.tenant_id
     AND demand_item.purchase_request_id = allocation.purchase_request_id$new$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'review_purchase_demand_unit_inheritance_not_found';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef('public.scan_inventory_alerts()'::regprocedure);
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'AND issue_unit.unit_id = ingredient.issue_unit_id',
    'AND issue_unit.is_base IS TRUE'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'scan_inventory_alerts_standard_unit_not_found';
  END IF;
  EXECUTE v_definition;
END;
$migration$;
