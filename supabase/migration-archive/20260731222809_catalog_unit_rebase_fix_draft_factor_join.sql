-- Fix draft-document factor refresh JOINs in save_ingredient_catalog.
-- Postgres rejects UPDATE-target references inside FROM/JOIN ON clauses
-- (42P01: invalid reference to FROM-clause entry for table "item").

CREATE OR REPLACE FUNCTION public.save_ingredient_catalog(
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
  p_default_fulfill_site_kind text,
  p_receipt_unit_id bigint,
  p_issue_unit_id bigint,
  p_production_unit_id bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_scale numeric := 1;
  v_bridge_factor numeric;
  v_min_stock numeric;
  v_max_stock numeric;
  v_reorder numeric;
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

  IF v_base_unit_id IS DISTINCT FROM COALESCE(p_production_unit_id, p_issue_unit_id) THEN
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
     OR (p_production_unit_id IS NOT NULL AND v_production_factor IS NULL)
     OR v_receipt_factor < v_issue_factor
     OR (p_production_unit_id IS NOT NULL AND v_issue_factor < v_production_factor) THEN
    RAISE EXCEPTION 'inventory_unit_role_order_invalid' USING ERRCODE = '23514';
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

  IF v_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category, unit_cost, item_kind,
      storage_type, min_stock_level, max_stock_level, reorder_point,
      shelf_life_days, default_fulfill_site_kind, receipt_unit_id,
      issue_unit_id, production_unit_id
    ) VALUES (
      v_tenant, p_name, p_sku, p_category_id, v_category_name, 0,
      COALESCE(p_item_kind, 'raw_material'), COALESCE(p_storage_type, 'ambient'),
      COALESCE(p_min_stock_level, 0), p_max_stock_level, p_reorder_point,
      p_shelf_life_days, p_default_fulfill_site_kind, p_receipt_unit_id,
      p_issue_unit_id, p_production_unit_id
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
        default_fulfill_site_kind = p_default_fulfill_site_kind,
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

  -- Living master/draft snapshots track the current ladder; confirmed
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
  bigint, text, text, bigint, text, text, numeric, numeric, numeric,
  integer, jsonb, text, bigint, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric,
  integer, jsonb, text, bigint, bigint, bigint
) TO authenticated, service_role;
