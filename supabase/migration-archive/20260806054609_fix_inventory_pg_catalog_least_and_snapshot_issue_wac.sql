-- P0: LEAST is a SQL special form, not a pg_catalog function.
-- pg_catalog.least(...) raises 42883 and breaks multi-layer FIFO posting.
DO $fix_least$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_stock_movement_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  IF v_def ~ 'pg_catalog\.least\(' THEN
    v_def := replace(v_def, 'pg_catalog.least(', 'least(');
    EXECUTE v_def;
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_supplier_credit_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_supplier_credit_valuation missing';
  END IF;

  IF v_def ~ 'pg_catalog\.least\(' THEN
    v_def := replace(v_def, 'pg_catalog.least(', 'least(');
    EXECUTE v_def;
  END IF;
END
$fix_least$;

-- P1: Snapshot WAC onto draft stock_issue_items so line value is visible
-- before confirm. Confirm still re-reads live WAC at posting time.
CREATE OR REPLACE FUNCTION public.save_stock_issue_line(
  p_issue_id bigint,
  p_ingredient_id bigint,
  p_quantity numeric,
  p_entry_unit_id bigint,
  p_reason text DEFAULT NULL::text,
  p_photo_urls text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue public.stock_issues%ROWTYPE;
  v_base_quantity numeric;
  v_available_quantity numeric;
  v_unit_cost numeric(15, 2);
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

  SELECT
    stock.current_quantity,
    coalesce(stock.avg_unit_cost, 0)::numeric(15, 2)
  INTO v_available_quantity, v_unit_cost
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
    v_unit_cost,
    nullif(pg_catalog.btrim(p_reason), ''),
    coalesce(p_photo_urls, ARRAY[]::text[])
  )
  ON CONFLICT (issue_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    entry_unit_id = EXCLUDED.entry_unit_id,
    unit_cost = EXCLUDED.unit_cost,
    reason = EXCLUDED.reason,
    photo_urls = CASE
      WHEN p_photo_urls IS NULL THEN stock_issue_items.photo_urls
      ELSE EXCLUDED.photo_urls
    END
  RETURNING id INTO v_item_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'item_id', v_item_id,
    'unit_cost', v_unit_cost
  );
END;
$function$;

-- Backfill open draft consumption/other lines that still carry unit_cost = 0.
UPDATE public.stock_issue_items AS item
SET unit_cost = coalesce(stock.avg_unit_cost, 0)::numeric(15, 2)
FROM public.stock_issues AS issue,
     public.stock_levels AS stock
WHERE item.issue_id = issue.id
  AND item.tenant_id = issue.tenant_id
  AND stock.tenant_id = issue.tenant_id
  AND stock.branch_id = issue.branch_id
  AND stock.location_id = issue.source_location_id
  AND stock.ingredient_id = item.ingredient_id
  AND issue.status = 'draft'
  AND issue.issue_type IN ('consumption', 'other')
  AND coalesce(item.unit_cost, 0) = 0
  AND issue.source_location_id IS NOT NULL;

