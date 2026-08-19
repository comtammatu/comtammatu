-- Wave 3: dest-initiated DC drafts, BM transfer_create/ship, OD-4 both
-- central fulfill sites. Does not REVOKE YCH writes (Wave 4). Does not
-- DROP stock_requests. Does not mix ISS-05/ISS-06.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS fulfill_from_central_supply boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fulfill_from_central_kitchen boolean NOT NULL DEFAULT FALSE;

UPDATE public.ingredients
SET
  fulfill_from_central_supply = (default_fulfill_site_kind = 'central_supply'),
  fulfill_from_central_kitchen = (default_fulfill_site_kind = 'central_kitchen')
WHERE default_fulfill_site_kind IS NOT NULL;

COMMENT ON COLUMN public.ingredients.fulfill_from_central_supply IS
  'OD-4: ingredient may be pulled from Kho Tổng on dest-initiated DC.';
COMMENT ON COLUMN public.ingredients.fulfill_from_central_kitchen IS
  'OD-4: ingredient may be pulled from Bếp TT on dest-initiated DC.';

GRANT SELECT (fulfill_from_central_supply) ON public.ingredients TO authenticated;
GRANT SELECT (fulfill_from_central_kitchen) ON public.ingredients TO authenticated;

DROP FUNCTION IF EXISTS public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric, integer, jsonb, text, bigint, bigint, bigint
);

CREATE FUNCTION public.save_ingredient_catalog(p_ingredient_id bigint, p_name text, p_sku text, p_category_id bigint, p_item_kind text, p_storage_type text, p_min_stock_level numeric, p_max_stock_level numeric, p_reorder_point numeric, p_shelf_life_days integer, p_units jsonb, p_default_fulfill_site_kind text, p_receipt_unit_id bigint, p_issue_unit_id bigint, p_production_unit_id bigint, p_fulfill_from_central_supply boolean DEFAULT NULL, p_fulfill_from_central_kitchen boolean DEFAULT NULL) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_id bigint := p_ingredient_id;
  v_base_unit_id bigint;
  v_old_base_unit_id bigint;
  v_category_name text;
  v_preserved_unit_cost numeric;
  v_receipt_factor numeric;
  v_issue_factor numeric;
  v_production_factor numeric;
  v_receipt_dimension text;
  v_issue_dimension text;
  v_production_dimension text;
  v_scale numeric := 1;
  v_bridge_factor numeric;
  v_min_stock numeric;
  v_max_stock numeric;
  v_reorder numeric;
  v_fulfill_supply boolean;
  v_fulfill_kitchen boolean;
  v_fulfill_kind text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner'
     OR NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_units IS NULL
     OR jsonb_typeof(p_units) <> 'array'
     OR jsonb_array_length(p_units) NOT BETWEEN 1 AND 3
     OR p_receipt_unit_id IS NULL
     OR p_issue_unit_id IS NULL THEN
    RAISE EXCEPTION 'inventory_unit_roles_invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) AS incoming
    LEFT JOIN public.units AS unit_row
      ON unit_row.id = (incoming ->> 'unit_id')::bigint
     AND unit_row.tenant_id = v_tenant
     AND unit_row.is_active
    WHERE unit_row.id IS NULL
       OR COALESCE((incoming ->> 'to_base_factor')::numeric, 0) <= 0
  ) OR (
    SELECT count(*)
    FROM jsonb_array_elements(p_units)
  ) <> (
    SELECT count(DISTINCT (incoming ->> 'unit_id')::bigint)
    FROM jsonb_array_elements(p_units) AS incoming
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) AS incoming
    WHERE COALESCE((incoming ->> 'is_base')::boolean, false)
      AND (incoming ->> 'to_base_factor')::numeric IS DISTINCT FROM 1
  ) THEN
    RAISE EXCEPTION 'inventory_unit_roles_invalid' USING ERRCODE = '23514';
  END IF;
  IF (
    SELECT count(*)
    FROM jsonb_array_elements(p_units) AS incoming
    WHERE COALESCE((incoming ->> 'is_base')::boolean, false)
  ) <> 1 THEN
    RAISE EXCEPTION 'exactly_one_standard_unit_required' USING ERRCODE = '23514';
  END IF;

  SELECT (incoming ->> 'unit_id')::bigint
  INTO v_base_unit_id
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE COALESCE((incoming ->> 'is_base')::boolean, false)
  LIMIT 1;

  IF v_base_unit_id IS DISTINCT FROM p_receipt_unit_id
     AND v_base_unit_id IS DISTINCT FROM p_issue_unit_id
     AND v_base_unit_id IS DISTINCT FROM p_production_unit_id THEN
    RAISE EXCEPTION 'inventory_standard_unit_role_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
  INTO v_receipt_factor
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE (incoming ->> 'unit_id')::bigint = p_receipt_unit_id;
  SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
  INTO v_issue_factor
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE (incoming ->> 'unit_id')::bigint = p_issue_unit_id;
  SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
  INTO v_production_factor
  FROM jsonb_array_elements(p_units) AS incoming
  WHERE (incoming ->> 'unit_id')::bigint = p_production_unit_id;

  IF v_receipt_factor IS NULL
     OR v_issue_factor IS NULL
     OR (p_production_unit_id IS NOT NULL AND v_production_factor IS NULL) THEN
    RAISE EXCEPTION 'inventory_unit_roles_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT CASE WHEN is_standard THEN dimension END
  INTO v_receipt_dimension
  FROM public.units
  WHERE tenant_id = v_tenant AND id = p_receipt_unit_id;
  SELECT CASE WHEN is_standard THEN dimension END
  INTO v_issue_dimension
  FROM public.units
  WHERE tenant_id = v_tenant AND id = p_issue_unit_id;
  SELECT CASE WHEN is_standard THEN dimension END
  INTO v_production_dimension
  FROM public.units
  WHERE tenant_id = v_tenant AND id = p_production_unit_id;

  IF (v_receipt_dimension IS NOT NULL AND v_issue_dimension IS NOT NULL AND v_receipt_dimension IS DISTINCT FROM v_issue_dimension)
     OR (v_production_dimension IS NOT NULL AND (
       (v_receipt_dimension IS NOT NULL AND v_production_dimension IS DISTINCT FROM v_receipt_dimension)
       OR (v_issue_dimension IS NOT NULL AND v_production_dimension IS DISTINCT FROM v_issue_dimension)
     )) THEN
    RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT name
    INTO v_category_name
    FROM public.ingredient_categories
    WHERE id = p_category_id
      AND tenant_id = v_tenant
      AND is_active;
    IF v_category_name IS NULL THEN
      RAISE EXCEPTION 'category not found' USING ERRCODE = '23503';
    END IF;
  END IF;


  v_fulfill_supply := COALESCE(
    p_fulfill_from_central_supply,
    p_default_fulfill_site_kind = 'central_supply'
  );
  v_fulfill_kitchen := COALESCE(
    p_fulfill_from_central_kitchen,
    p_default_fulfill_site_kind = 'central_kitchen'
  );
  IF p_fulfill_from_central_supply IS NOT NULL
     OR p_fulfill_from_central_kitchen IS NOT NULL THEN
    v_fulfill_supply := COALESCE(p_fulfill_from_central_supply, FALSE);
    v_fulfill_kitchen := COALESCE(p_fulfill_from_central_kitchen, FALSE);
  END IF;
  v_fulfill_kind := CASE
    WHEN v_fulfill_supply THEN 'central_supply'
    WHEN v_fulfill_kitchen THEN 'central_kitchen'
    ELSE NULL
  END;

  IF v_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category, unit_cost, item_kind,
      storage_type, min_stock_level, max_stock_level, reorder_point,
      shelf_life_days, default_fulfill_site_kind, receipt_unit_id,
      issue_unit_id, production_unit_id,
      fulfill_from_central_supply, fulfill_from_central_kitchen
    ) VALUES (
      v_tenant, p_name, p_sku, p_category_id, v_category_name, 0,
      COALESCE(p_item_kind, 'raw_material'), COALESCE(p_storage_type, 'ambient'),
      COALESCE(p_min_stock_level, 0), p_max_stock_level, p_reorder_point,
      p_shelf_life_days, v_fulfill_kind, p_receipt_unit_id,
      p_issue_unit_id, p_production_unit_id,
      v_fulfill_supply, v_fulfill_kitchen
    ) RETURNING id INTO v_id;
  ELSE
    SELECT unit_cost,
           min_stock_level,
           max_stock_level,
           reorder_point
    INTO v_preserved_unit_cost,
         v_min_stock,
         v_max_stock,
         v_reorder
    FROM public.ingredients
    WHERE id = v_id
      AND tenant_id = v_tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT unit_id
    INTO v_old_base_unit_id
    FROM public.ingredient_units
    WHERE tenant_id = v_tenant
      AND ingredient_id = v_id
      AND is_base
    LIMIT 1;

    IF EXISTS (
      SELECT 1
      FROM public.production_recipes AS recipe
      WHERE recipe.tenant_id = v_tenant
        AND recipe.ingredient_id = v_id
        AND recipe.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_units) AS incoming
          WHERE (incoming ->> 'unit_id')::bigint = recipe.entry_unit_id
        )
    ) THEN
      RAISE EXCEPTION 'ingredient_unit_in_use_by_production_recipe' USING ERRCODE = '23503';
    END IF;

    -- How many new-base units equal one old-base unit.
    IF v_old_base_unit_id IS NOT NULL
       AND v_old_base_unit_id IS DISTINCT FROM v_base_unit_id THEN
      SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
      INTO v_scale
      FROM jsonb_array_elements(p_units) AS incoming
      WHERE (incoming ->> 'unit_id')::bigint = v_old_base_unit_id
      LIMIT 1;

      IF v_scale IS NULL THEN
        SELECT unit_row.to_base_factor
        INTO v_bridge_factor
        FROM public.ingredient_units AS unit_row
        WHERE unit_row.tenant_id = v_tenant
          AND unit_row.ingredient_id = v_id
          AND unit_row.unit_id = v_base_unit_id;
        IF v_bridge_factor IS NOT NULL AND v_bridge_factor > 0 THEN
          v_scale := 1 / v_bridge_factor;
        ELSE
          -- Sole-unit rename / swap without an explicit bridge: treat as 1:1.
          v_scale := 1;
        END IF;
      END IF;
    END IF;

    IF abs(v_scale - 1) > 0.000000001 THEN
      v_min_stock := COALESCE(p_min_stock_level, v_min_stock, 0) * v_scale;
      v_max_stock := CASE
        WHEN p_max_stock_level IS NOT NULL THEN p_max_stock_level * v_scale
        WHEN v_max_stock IS NOT NULL THEN v_max_stock * v_scale
        ELSE NULL
      END;
      v_reorder := CASE
        WHEN p_reorder_point IS NOT NULL THEN p_reorder_point * v_scale
        WHEN v_reorder IS NOT NULL THEN v_reorder * v_scale
        ELSE NULL
      END;
      v_preserved_unit_cost := CASE
        WHEN v_preserved_unit_cost IS NULL THEN NULL
        ELSE v_preserved_unit_cost / v_scale
      END;

      UPDATE public.stock_levels
      SET current_quantity = current_quantity * v_scale,
          avg_unit_cost = CASE
            WHEN avg_unit_cost IS NULL THEN NULL
            ELSE avg_unit_cost / v_scale
          END,
          updated_at = now()
      WHERE tenant_id = v_tenant
        AND ingredient_id = v_id;

      UPDATE public.inventory_valuation_accounts
      SET quantity = quantity * v_scale,
          valuation_version = valuation_version + 1,
          updated_at = pg_catalog.now()
      WHERE tenant_id = v_tenant
        AND ingredient_id = v_id;

      UPDATE public.inventory_cost_origins
      SET original_quantity = original_quantity * v_scale,
          finalized_quantity = finalized_quantity * v_scale
      WHERE tenant_id = v_tenant
        AND ingredient_id = v_id;

      UPDATE public.inventory_origin_balances AS balance
      SET quantity = balance.quantity * v_scale,
          updated_at = pg_catalog.now()
      FROM public.inventory_cost_origins AS origin
      WHERE origin.tenant_id = v_tenant
        AND origin.ingredient_id = v_id
        AND balance.tenant_id = v_tenant
        AND balance.origin_id = origin.id;
    ELSE
      v_min_stock := COALESCE(p_min_stock_level, 0);
      v_max_stock := p_max_stock_level;
      v_reorder := p_reorder_point;
    END IF;

    UPDATE public.ingredients
    SET name = p_name,
        sku = p_sku,
        category_id = p_category_id,
        category = v_category_name,
        unit_cost = COALESCE(v_preserved_unit_cost, unit_cost),
        item_kind = COALESCE(p_item_kind, item_kind),
        storage_type = COALESCE(p_storage_type, storage_type),
        min_stock_level = v_min_stock,
        max_stock_level = v_max_stock,
        reorder_point = v_reorder,
        shelf_life_days = p_shelf_life_days,
        default_fulfill_site_kind = v_fulfill_kind,
        fulfill_from_central_supply = v_fulfill_supply,
        fulfill_from_central_kitchen = v_fulfill_kitchen,
        receipt_unit_id = p_receipt_unit_id,
        issue_unit_id = p_issue_unit_id,
        production_unit_id = p_production_unit_id,
        updated_at = now()
    WHERE id = v_id
      AND tenant_id = v_tenant;
  END IF;

  UPDATE public.ingredient_units
  SET is_base = false
  WHERE tenant_id = v_tenant
    AND ingredient_id = v_id
    AND is_base
    AND unit_id IS DISTINCT FROM v_base_unit_id;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
    anchor_unit_id, anchor_factor, sort_order
  )
  SELECT
    v_tenant,
    v_id,
    (incoming ->> 'unit_id')::bigint,
    public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units),
    COALESCE((incoming ->> 'is_base')::boolean, false),
    NULLIF(incoming ->> 'anchor_unit_id', '')::bigint,
    NULLIF(incoming ->> 'anchor_factor', '')::numeric,
    COALESCE((incoming ->> 'sort_order')::integer, 0)
  FROM jsonb_array_elements(p_units) AS incoming
  ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key DO UPDATE
  SET to_base_factor = EXCLUDED.to_base_factor,
      is_base = EXCLUDED.is_base,
      anchor_unit_id = EXCLUDED.anchor_unit_id,
      anchor_factor = EXCLUDED.anchor_factor,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

  DELETE FROM public.ingredient_units AS unit_row
  WHERE unit_row.tenant_id = v_tenant
    AND unit_row.ingredient_id = v_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_units) AS incoming
      WHERE (incoming ->> 'unit_id')::bigint = unit_row.unit_id
    );

  -- Living master/draft snapshots track the current unit factors; confirmed
  -- documents and stock_movements keep their historical snapshots.
  UPDATE public.production_recipes AS recipe
  SET entry_to_base_factor = unit_row.to_base_factor,
      entry_unit_code = units.code
  FROM public.ingredient_units AS unit_row,
       public.units AS units
  WHERE recipe.tenant_id = v_tenant
    AND recipe.ingredient_id = v_id
    AND recipe.entry_unit_id = unit_row.unit_id
    AND unit_row.tenant_id = v_tenant
    AND unit_row.ingredient_id = v_id
    AND units.id = unit_row.unit_id
    AND units.tenant_id = unit_row.tenant_id;

  UPDATE public.purchase_order_items AS item
  SET entry_to_base_factor = unit_row.to_base_factor,
      entry_unit_code = units.code
  FROM public.purchase_orders AS po,
       public.ingredient_units AS unit_row,
       public.units AS units
  WHERE item.tenant_id = v_tenant
    AND item.ingredient_id = v_id
    AND item.entry_unit_id = unit_row.unit_id
    AND unit_row.tenant_id = v_tenant
    AND unit_row.ingredient_id = v_id
    AND units.id = unit_row.unit_id
    AND units.tenant_id = unit_row.tenant_id
    AND po.id = item.po_id
    AND po.tenant_id = v_tenant
    AND po.status = 'draft';

  UPDATE public.grn_items AS item
  SET entry_to_base_factor = unit_row.to_base_factor,
      entry_unit_code = units.code
  FROM public.goods_received_notes AS grn,
       public.ingredient_units AS unit_row,
       public.units AS units
  WHERE item.tenant_id = v_tenant
    AND item.ingredient_id = v_id
    AND item.entry_unit_id = unit_row.unit_id
    AND unit_row.tenant_id = v_tenant
    AND unit_row.ingredient_id = v_id
    AND units.id = unit_row.unit_id
    AND units.tenant_id = unit_row.tenant_id
    AND grn.id = item.grn_id
    AND grn.tenant_id = v_tenant
    AND grn.status = 'draft';

  UPDATE public.stock_transfer_items AS item
  SET entry_to_base_factor = unit_row.to_base_factor,
      entry_unit_code = units.code
  FROM public.stock_transfers AS transfer,
       public.ingredient_units AS unit_row,
       public.units AS units
  WHERE item.tenant_id = v_tenant
    AND item.ingredient_id = v_id
    AND item.entry_unit_id = unit_row.unit_id
    AND unit_row.tenant_id = v_tenant
    AND unit_row.ingredient_id = v_id
    AND units.id = unit_row.unit_id
    AND units.tenant_id = unit_row.tenant_id
    AND transfer.id = item.transfer_id
    AND transfer.tenant_id = v_tenant
    AND transfer.status = 'draft';

  UPDATE public.stock_issue_items AS item
  SET entry_to_base_factor = unit_row.to_base_factor,
      entry_unit_code = units.code
  FROM public.stock_issues AS issue,
       public.ingredient_units AS unit_row,
       public.units AS units
  WHERE item.tenant_id = v_tenant
    AND item.ingredient_id = v_id
    AND item.entry_unit_id = unit_row.unit_id
    AND unit_row.tenant_id = v_tenant
    AND unit_row.ingredient_id = v_id
    AND units.id = unit_row.unit_id
    AND units.tenant_id = unit_row.tenant_id
    AND issue.id = item.issue_id
    AND issue.tenant_id = v_tenant
    AND issue.status = 'draft';

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric, integer, jsonb, text, bigint, bigint, bigint, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric, integer, jsonb, text, bigint, bigint, bigint, boolean, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(p_from_branch_id bigint, p_to_branch_id bigint, p_transfer_number text, p_notes text DEFAULT NULL::text, p_vehicle_info text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_from_location_id bigint DEFAULT NULL::bigint, p_to_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_transfer_id bigint;
  v_from_kind text;
  v_to_kind text;
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_entry_quantity numeric(15,3);
  v_transfer_number text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'transfer_requires_distinct_branches'
      USING ERRCODE = '22023';
  END IF;
  IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_warehouse_locations_required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  PERFORM branch.id
  FROM public.branches AS branch
  WHERE branch.id = ANY(ARRAY[
    p_from_branch_id,
    p_to_branch_id
  ]::bigint[])
  ORDER BY branch.id
  FOR UPDATE OF branch;

  SELECT branch.branch_kind
  INTO v_from_kind
  FROM public.branches AS branch
  WHERE branch.id = p_from_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE
    AND branch.branch_kind IN (
      'branch',
      'central_supply',
      'central_kitchen'
    );

  SELECT branch.branch_kind
  INTO v_to_kind
  FROM public.branches AS branch
  WHERE branch.id = p_to_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE
    AND branch.branch_kind IN (
      'branch',
      'central_supply',
      'central_kitchen'
    );

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'transfer_branch_invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_from_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_from_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_to_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_to_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Wave 3: dest-initiated drafts (permission on to-site) or source-authored
  -- (from-site). Create writes draft only; no stock_movements. Ship checks
  -- source on-hand.
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission(
       p_from_branch_id,
       'inventory:transfer_create'
     )
     AND NOT public.has_permission(
       p_to_branch_id,
       'inventory:transfer_create'
     ) THEN
    RAISE EXCEPTION 'forbidden_transfer_create'
      USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
  END IF;

  v_transfer_number := public.next_inventory_doc_number(
    v_tenant,
    'transfer'
  );

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    status,
    notes,
    vehicle_info,
    created_by
  )
  VALUES (
    v_tenant,
    p_from_branch_id,
    p_to_branch_id,
    p_from_location_id,
    p_to_location_id,
    v_transfer_number,
    'draft',
    p_notes,
    p_vehicle_info,
    v_uid
  )
  RETURNING id INTO v_transfer_id;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_lines) AS line(value)
  LOOP
    v_ingredient_id := NULLIF(
      coalesce(
        v_line ->> 'ingredientId',
        v_line ->> 'ingredient_id'
      ),
      ''
    )::bigint;
    v_entry_quantity := NULLIF(
      v_line ->> 'quantity',
      ''
    )::numeric(15,3);
    v_entry_unit_id := NULLIF(
      coalesce(
        v_line ->> 'entryUnitId',
        v_line ->> 'entry_unit_id'
      ),
      ''
    )::bigint;

    IF v_ingredient_id IS NULL
       OR v_entry_quantity IS NULL
       OR v_entry_quantity <= 0
       OR v_entry_quantity = 'NaN'::numeric
       OR v_entry_quantity = 'Infinity'::numeric
       OR v_entry_quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'transfer_lines_invalid'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients AS ingredient
      WHERE ingredient.id = v_ingredient_id
        AND ingredient.tenant_id = v_tenant
        AND ingredient.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'transfer_ingredient_invalid:%',
        v_ingredient_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_entry_unit_id IS NULL THEN
      SELECT ingredient_unit.unit_id
      INTO v_entry_unit_id
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active IS TRUE
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = v_ingredient_id
        AND ingredient_unit.is_base IS TRUE
        AND ingredient_unit.is_active IS TRUE
      ORDER BY ingredient_unit.sort_order, ingredient_unit.id
      LIMIT 1;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active IS TRUE
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = v_ingredient_id
        AND ingredient_unit.unit_id = v_entry_unit_id
        AND ingredient_unit.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'entry_unit_not_found:%',
        v_ingredient_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%',
        v_ingredient_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO public.stock_transfer_items (
      tenant_id,
      transfer_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_cost_at_ship
    )
    VALUES (
      v_tenant,
      v_transfer_id,
      v_ingredient_id,
      v_entry_quantity,
      v_entry_unit_id,
      (
        SELECT stock.avg_unit_cost
        FROM public.stock_levels AS stock
        WHERE stock.tenant_id = v_tenant
          AND stock.branch_id = p_from_branch_id
          AND stock.location_id = p_from_location_id
          AND stock.ingredient_id = v_ingredient_id
        LIMIT 1
      )
    )
    ON CONFLICT (transfer_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      entry_unit_id = EXCLUDED.entry_unit_id,
      unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_transfer_id,
    'status', 'draft',
    'transfer_number', v_transfer_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_transfer record;
  v_line record;
  v_source_quantity numeric(15,3);
  v_source_wac numeric(15,2);
  v_quantity_base numeric(15,3);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_transfer.from_branch_id = v_transfer.to_branch_id THEN
    RAISE EXCEPTION 'transfer_requires_distinct_branches'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  -- Wave 3: ship stays from-site only. BM may ship outbound from own CN
  -- when granted inventory:transfer_ship on from_branch_id.
  IF NOT public.has_permission(
    v_transfer.from_branch_id,
    'inventory:transfer_ship'
  ) THEN
    RAISE EXCEPTION 'forbidden_transfer_ship'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.from_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.from_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.to_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.to_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'transfer_lines_required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
    ORDER BY item.ingredient_id
    FOR UPDATE
  LOOP
    IF v_line.quantity <= 0
       OR v_line.quantity = 'NaN'::numeric
       OR v_line.quantity = 'Infinity'::numeric
       OR v_line.quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'transfer_line_quantity_invalid:%',
        v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    v_quantity_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_source_quantity, v_source_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_transfer.from_branch_id
      AND stock.location_id = v_transfer.from_location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND
       OR coalesce(v_source_quantity, 0) < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock:%',
        v_line.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      transfer_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_transfer.from_branch_id,
      v_line.ingredient_id,
      'transfer_out',
      -v_quantity_base,
      'Transfer ' || v_transfer.transfer_number,
      v_uid,
      p_transfer_id,
      v_source_wac,
      v_transfer.from_location_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_source_wac
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'confirmed_ship',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;


  PERFORM public.log_audit(
    'inventory.transfer.shipped',
    'stock_transfer',
    p_transfer_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'confirmed_ship',
      'transfer_number', v_transfer.transfer_number
    )
  );

  RETURN public.stock_transfer_mark_in_transit(p_transfer_id);

END;
$function$;

UPDATE public.role_templates AS template
SET permission_keys = (
  SELECT coalesce(array_agg(DISTINCT key ORDER BY key), ARRAY[]::text[])
  FROM unnest(
    template.permission_keys || ARRAY[
      'inventory:transfer_create',
      'inventory:transfer_ship'
    ]::text[]
  ) AS key
),
updated_at = pg_catalog.now()
WHERE template.position_code = 'branch_manager'
  AND (
    NOT ('inventory:transfer_create' = ANY (template.permission_keys))
    OR NOT ('inventory:transfer_ship' = ANY (template.permission_keys))
  );

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by
)
SELECT
  profile.id,
  profile.tenant_id,
  profile.branch_id,
  grant_key.permission_key,
  template.id,
  NULL
FROM public.profiles AS profile
JOIN public.positions AS position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
JOIN public.role_templates AS template
  ON template.tenant_id = profile.tenant_id
 AND template.position_code = position.code
CROSS JOIN (
  VALUES
    ('inventory:transfer_create'),
    ('inventory:transfer_ship')
) AS grant_key(permission_key)
WHERE position.code = 'branch_manager'
  AND coalesce(profile.is_active, TRUE)
  AND profile.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions AS existing
    WHERE existing.user_id = profile.id
      AND existing.tenant_id = profile.tenant_id
      AND existing.permission_key = grant_key.permission_key
      AND existing.branch_id IS NOT DISTINCT FROM profile.branch_id
  );
