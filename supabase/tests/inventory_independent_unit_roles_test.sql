\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner uuid := pg_catalog.gen_random_uuid();
  v_tenant bigint;
  v_branch bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.positions AS position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE position.code = 'owner'
      AND coalesce(profile.is_active, TRUE)
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.tenants
    ALTER CONSTRAINT tenants_owner_user_id_fkey
    DEFERRABLE INITIALLY DEFERRED;
  SET CONSTRAINTS tenants_owner_user_id_fkey DEFERRED;

  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    '__independent_units_' || v_owner::text,
    '__independent_units_' || v_owner::text,
    v_owner
  )
  RETURNING id INTO v_tenant;

  INSERT INTO public.positions (
    tenant_id, code, label_vi, label_en, is_active, is_system
  ) VALUES (v_tenant, 'owner', 'Chủ', 'Owner', TRUE, TRUE);

  INSERT INTO public.role_templates (
    tenant_id, name, position_code, permission_keys, is_system
  ) VALUES (v_tenant, 'owner', 'owner', '{}'::text[], TRUE);

  INSERT INTO public.branches (
    tenant_id, name, branch_kind, is_active, code
  ) VALUES (
    v_tenant,
    '__independent_units_branch_' || v_owner::text,
    'central_supply',
    TRUE,
    NULL
  ) RETURNING id INTO v_branch;

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (v_tenant, 'Independent units supplier', TRUE);

  INSERT INTO auth.users (
    id, email, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_owner,
    'independent-units-owner-' || v_owner::text || '@example.invalid',
    pg_catalog.jsonb_build_object(
      'tenant_id', v_tenant,
      'position_code', 'owner'
    ),
    pg_catalog.jsonb_build_object('full_name', 'Independent units owner')
  );
END;
$$;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch bigint;
  v_location bigint;
  v_supplier bigint;
  v_receipt_unit bigint;
  v_issue_unit bigint;
  v_production_unit bigint;
  v_outside_unit bigint;
  v_mass_unit bigint;
  v_volume_unit bigint;
  v_ingredient bigint;
  v_movement bigint;
  v_po bigint;
  v_po_item bigint;
  v_rejected boolean;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
BEGIN
  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id, location.id
  INTO v_branch, v_location
  FROM public.branches AS branch
  JOIN public.inventory_locations AS location
    ON location.tenant_id = branch.tenant_id
   AND location.branch_id = branch.id
   AND location.is_active
  WHERE branch.tenant_id = v_tenant
    AND branch.is_active
  ORDER BY branch.id, location.id
  LIMIT 1;

  SELECT supplier.id
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND coalesce(supplier.is_active, TRUE)
  ORDER BY supplier.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL OR v_branch IS NULL
     OR v_location IS NULL OR v_supplier IS NULL THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: owner/site/supplier fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__iur_r_' || v_suffix, 'Independent receipt')
  RETURNING id INTO v_receipt_unit;
  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__iur_i_' || v_suffix, 'Independent issue')
  RETURNING id INTO v_issue_unit;
  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__iur_p_' || v_suffix, 'Independent production')
  RETURNING id INTO v_production_unit;
  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__iur_x_' || v_suffix, 'Outside role')
  RETURNING id INTO v_outside_unit;
  INSERT INTO public.units (
    tenant_id, code, name, dimension, is_standard, standard_factor
  ) VALUES (
    v_tenant, '__iur_g_' || v_suffix, 'Independent gram', 'mass', TRUE, 1
  ) RETURNING id INTO v_mass_unit;
  INSERT INTO public.units (
    tenant_id, code, name, dimension, is_standard, standard_factor
  ) VALUES (
    v_tenant, '__iur_ml_' || v_suffix, 'Independent millilitre',
    'volume', TRUE, 1
  ) RETURNING id INTO v_volume_unit;

  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'position_code', 'owner'
      )
    )::text,
    TRUE
  );

  v_ingredient := public.save_ingredient_catalog(
    NULL,
    '__independent_unit_roles_' || v_suffix,
    NULL,
    NULL,
    'raw_material',
    'ambient',
    5,
    NULL,
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'unit_id', v_receipt_unit,
        'to_base_factor', 0.5,
        'is_base', FALSE,
        'anchor_unit_id', v_issue_unit,
        'anchor_factor', 0.5,
        'sort_order', 0
      ),
      jsonb_build_object(
        'unit_id', v_issue_unit,
        'to_base_factor', 1,
        'is_base', TRUE,
        'anchor_unit_id', NULL,
        'anchor_factor', NULL,
        'sort_order', 1
      ),
      jsonb_build_object(
        'unit_id', v_production_unit,
        'to_base_factor', 10,
        'is_base', FALSE,
        'anchor_unit_id', v_issue_unit,
        'anchor_factor', 10,
        'sort_order', 2
      )
    ),
    NULL,
    v_receipt_unit,
    v_issue_unit,
    v_production_unit
  );

  IF v_ingredient IS NULL THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: arbitrary role magnitudes rejected';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, location_id, ingredient_id,
    current_quantity, avg_unit_cost
  ) VALUES (
    v_tenant, v_branch, v_location, v_ingredient, 0, 20
  );

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, location_id, ingredient_id, type,
    quantity_change, created_by, unit_cost, entry_unit_id, entry_quantity,
    entry_to_base_factor, entry_unit_code
  ) VALUES (
    v_tenant, v_branch, v_location, v_ingredient, 'adjustment',
    100, v_owner, 20, v_issue_unit, 100, 1, '__snapshot__'
  ) RETURNING id INTO v_movement;

  INSERT INTO public.supplier_items (
    tenant_id, supplier_id, ingredient_id, is_active, is_preferred, created_by
  ) VALUES (
    v_tenant, v_supplier, v_ingredient, TRUE, TRUE, v_owner
  );

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier, '__IUR-PO-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_po;
  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id
  ) VALUES (
    v_tenant, v_po, v_ingredient, 1, v_receipt_unit
  ) RETURNING id INTO v_po_item;

  PERFORM public.save_ingredient_catalog(
    v_ingredient,
    '__independent_unit_roles_' || v_suffix,
    NULL,
    NULL,
    'raw_material',
    'ambient',
    5,
    NULL,
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'unit_id', v_receipt_unit,
        'to_base_factor', 0.05,
        'is_base', FALSE,
        'anchor_unit_id', v_production_unit,
        'anchor_factor', 0.05,
        'sort_order', 0
      ),
      jsonb_build_object(
        'unit_id', v_issue_unit,
        'to_base_factor', 0.1,
        'is_base', FALSE,
        'anchor_unit_id', v_production_unit,
        'anchor_factor', 0.1,
        'sort_order', 1
      ),
      jsonb_build_object(
        'unit_id', v_production_unit,
        'to_base_factor', 1,
        'is_base', TRUE,
        'anchor_unit_id', NULL,
        'anchor_factor', NULL,
        'sort_order', 2
      )
    ),
    NULL,
    v_receipt_unit,
    v_issue_unit,
    v_production_unit
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.ingredient_id = v_ingredient
      AND stock.current_quantity = 10
      AND stock.avg_unit_cost = 200
      AND stock.current_quantity * stock.avg_unit_cost = 2000
  ) THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: rebase changed stock quantity/value/WAC: %',
      (
        SELECT jsonb_build_object(
          'quantity', stock.current_quantity,
          'wac', stock.avg_unit_cost,
          'value', stock.current_quantity * stock.avg_unit_cost
        )
        FROM public.stock_levels AS stock
        WHERE stock.tenant_id = v_tenant
          AND stock.ingredient_id = v_ingredient
        LIMIT 1
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.id = v_movement
      AND movement.quantity_change = 100
      AND movement.entry_to_base_factor = 1
      AND movement.entry_unit_code = (
        SELECT unit_row.code FROM public.units AS unit_row
        WHERE unit_row.id = v_issue_unit
      )
  ) THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: historical movement snapshot changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.id = v_po_item
      AND item.entry_to_base_factor = 0.05
  ) THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: draft document factor was not refreshed';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.save_ingredient_catalog(
      v_ingredient, '__independent_unit_roles_' || v_suffix, NULL, NULL,
      'raw_material', 'ambient', 5, NULL, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_receipt_unit, 'to_base_factor', 0.05, 'is_base', FALSE, 'anchor_unit_id', v_production_unit, 'anchor_factor', 0.05),
        jsonb_build_object('unit_id', v_issue_unit, 'to_base_factor', 0.1, 'is_base', FALSE, 'anchor_unit_id', v_production_unit, 'anchor_factor', 0.1),
        jsonb_build_object('unit_id', v_production_unit, 'to_base_factor', 1, 'is_base', TRUE)
      ),
      NULL, v_outside_unit, v_issue_unit, v_production_unit
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: role outside p_units accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.save_ingredient_catalog(
      v_ingredient, '__independent_unit_roles_' || v_suffix, NULL, NULL,
      'raw_material', 'ambient', 5, NULL, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_receipt_unit, 'to_base_factor', 0.5, 'is_base', FALSE, 'anchor_unit_id', v_outside_unit, 'anchor_factor', 0.5),
        jsonb_build_object('unit_id', v_issue_unit, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_outside_unit, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_outside_unit, 'to_base_factor', 1, 'is_base', TRUE)
      ),
      NULL, v_receipt_unit, v_issue_unit, NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: base outside all roles accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.save_ingredient_catalog(
      NULL, '__independent_dimension_' || v_suffix, NULL, NULL,
      'raw_material', 'ambient', 0, NULL, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_mass_unit, 'to_base_factor', 1, 'is_base', TRUE),
        jsonb_build_object('unit_id', v_volume_unit, 'to_base_factor', 1, 'is_base', FALSE)
      ),
      NULL, v_mass_unit, v_volume_unit, NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INDEPENDENT UNIT ROLES: cross-dimension standards accepted';
  END IF;

  RAISE NOTICE 'INDEPENDENT UNIT ROLES: ok';
END;
$$;

ROLLBACK;
