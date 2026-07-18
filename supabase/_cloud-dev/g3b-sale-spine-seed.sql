-- Cloud DEV only: minimal POS sale-spine fixture.
-- Apply only to Environment Registry ref xrsantkidwknjhcgcfmi.
-- Printer hosts use RFC 5737 TEST-NET addresses and cannot target a real LAN.

BEGIN;

DO $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_owner_id uuid;
  v_zone_id bigint;
  v_category_id bigint;
  v_menu_item_id bigint;
  v_station_id bigint;
  v_unit_id bigint;
  v_ingredient_id bigint;
  v_location_id bigint;
  v_receipt_printer_id bigint;
  v_kitchen_printer_id bigint;
BEGIN
  SELECT t.id, b.id, p.id
  INTO STRICT v_tenant_id, v_branch_id, v_owner_id
  FROM public.tenants t
  JOIN public.branches b
    ON b.tenant_id = t.id
   AND b.code = 'GF'
   AND b.branch_kind = 'branch'
   AND b.is_active = true
  JOIN public.profiles p
    ON p.tenant_id = t.id
   AND p.is_active = true
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = t.id
   AND po.code = 'owner'
  WHERE t.slug = 'comtammatu';

  IF EXISTS (SELECT 1 FROM public.orders)
     OR EXISTS (SELECT 1 FROM public.pos_sessions)
     OR EXISTS (SELECT 1 FROM public.pos_terminals)
     OR EXISTS (SELECT 1 FROM public.branch_zones)
     OR EXISTS (SELECT 1 FROM public.tables)
     OR EXISTS (SELECT 1 FROM public.menu_categories)
     OR EXISTS (SELECT 1 FROM public.menu_items)
     OR EXISTS (SELECT 1 FROM public.kds_stations)
     OR EXISTS (SELECT 1 FROM public.printers)
     OR EXISTS (SELECT 1 FROM public.ingredients)
     OR EXISTS (SELECT 1 FROM public.stock_levels) THEN
    RAISE EXCEPTION 'g3b_sale_spine_seed_requires_empty_operational_catalog';
  END IF;

  PERFORM public.ensure_branch_inventory_location_defaults(
    v_tenant_id,
    v_branch_id
  );

  SELECT id
  INTO STRICT v_location_id
  FROM public.inventory_locations
  WHERE tenant_id = v_tenant_id
    AND branch_id = v_branch_id
    AND code = 'main_warehouse'
    AND location_kind = 'warehouse'
    AND is_active = true
    AND is_default_receive = true
    AND is_default_issue = true
    AND is_default_consumption = true;

  INSERT INTO public.branch_feature_flags (
    branch_id,
    flag_key,
    enabled,
    enabled_by,
    enabled_at,
    disabled_at,
    notes
  )
  VALUES (
    v_branch_id,
    'pos_stock_outcome_posting',
    true,
    v_owner_id,
    now(),
    null,
    'Cloud DEV G3b sale-spine fixture'
  );

  INSERT INTO public.pos_terminals (
    tenant_id,
    branch_id,
    name,
    device_id,
    is_active
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    'Greenfield POS QA',
    'greenfield-g3b-browser',
    true
  );

  INSERT INTO public.branch_zones (
    tenant_id,
    branch_id,
    name,
    sort_order
  )
  VALUES (v_tenant_id, v_branch_id, 'Greenfield QA Zone', 1)
  RETURNING id INTO v_zone_id;

  INSERT INTO public.tables (
    tenant_id,
    branch_id,
    zone_id,
    number,
    capacity,
    status
  )
  VALUES (v_tenant_id, v_branch_id, v_zone_id, 99, 2, 'available');

  INSERT INTO public.menu_categories (
    tenant_id,
    name,
    type,
    sort_order,
    is_active,
    kitchen_printer
  )
  VALUES (
    v_tenant_id,
    'Greenfield QA Kitchen',
    'main_dish',
    1,
    true,
    1
  )
  RETURNING id INTO v_category_id;

  INSERT INTO public.menu_items (
    tenant_id,
    category_id,
    name,
    description,
    base_price,
    is_active,
    sort_order
  )
  VALUES (
    v_tenant_id,
    v_category_id,
    'Greenfield Sale Spine 25K',
    'Cloud DEV only',
    25000,
    true,
    1
  )
  RETURNING id INTO v_menu_item_id;

  INSERT INTO public.kds_stations (
    tenant_id,
    branch_id,
    name,
    position,
    is_active
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    'Greenfield KDS QA',
    1,
    true
  )
  RETURNING id INTO v_station_id;

  INSERT INTO public.kds_station_categories (
    tenant_id,
    station_id,
    category_id
  )
  VALUES (v_tenant_id, v_station_id, v_category_id);

  INSERT INTO public.units (
    tenant_id,
    code,
    name,
    is_active,
    dimension,
    is_standard,
    standard_factor
  )
  VALUES (v_tenant_id, 'portion', 'Phần', true, null, false, null)
  RETURNING id INTO v_unit_id;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    category,
    min_stock_level,
    storage_type,
    is_active,
    item_kind
  )
  VALUES (
    v_tenant_id,
    'Greenfield QA Portion',
    'GF-QA-PORTION',
    10000,
    'greenfield_qa',
    0,
    'ambient',
    true,
    'raw_material'
  )
  RETURNING id INTO v_ingredient_id;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    sort_order,
    is_active
  )
  VALUES (
    v_tenant_id,
    v_ingredient_id,
    v_unit_id,
    1,
    true,
    1,
    true
  );

  INSERT INTO public.recipes (
    tenant_id,
    menu_item_id,
    ingredient_id,
    quantity,
    yield_factor,
    entry_unit_id,
    note
  )
  VALUES (
    v_tenant_id,
    v_menu_item_id,
    v_ingredient_id,
    1,
    1,
    v_unit_id,
    'Cloud DEV G3b one portion per sale'
  );

  INSERT INTO public.stock_levels (
    tenant_id,
    branch_id,
    ingredient_id,
    current_quantity,
    avg_unit_cost,
    location_id
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    v_ingredient_id,
    10,
    10000,
    v_location_id
  );

  INSERT INTO public.printers (
    tenant_id,
    branch_id,
    role,
    name,
    connection_type,
    lan_host,
    lan_port,
    paper_width_mm,
    code_page,
    is_active
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    'receipt',
    'Greenfield Receipt QA Offline',
    'lan',
    '192.0.2.1',
    9100,
    80,
    'CP1258',
    true
  )
  RETURNING id INTO v_receipt_printer_id;

  INSERT INTO public.printers (
    tenant_id,
    branch_id,
    role,
    name,
    connection_type,
    lan_host,
    lan_port,
    paper_width_mm,
    code_page,
    is_active
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    'kitchen_1',
    'Greenfield Kitchen QA Offline',
    'lan',
    '192.0.2.2',
    9100,
    80,
    'CP1258',
    true
  )
  RETURNING id INTO v_kitchen_printer_id;

  INSERT INTO public.printer_menu_categories (
    tenant_id,
    branch_id,
    printer_id,
    category_id
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    v_kitchen_printer_id,
    v_category_id
  );

  INSERT INTO public.printer_print_types (
    tenant_id,
    branch_id,
    printer_id,
    print_type
  )
  VALUES
    (v_tenant_id, v_branch_id, v_receipt_printer_id, 'receipt'),
    (v_tenant_id, v_branch_id, v_receipt_printer_id, 'provisional_bill'),
    (v_tenant_id, v_branch_id, v_receipt_printer_id, 'shift_close_report'),
    (v_tenant_id, v_branch_id, v_kitchen_printer_id, 'kitchen_ticket'),
    (v_tenant_id, v_branch_id, v_kitchen_printer_id, 'cancel_ticket');

  IF (SELECT count(*) FROM public.pos_terminals) <> 1
     OR (SELECT count(*) FROM public.branch_zones) <> 1
     OR (SELECT count(*) FROM public.tables) <> 1
     OR (SELECT count(*) FROM public.menu_categories) <> 1
     OR (SELECT count(*) FROM public.menu_items) <> 1
     OR (SELECT count(*) FROM public.kds_stations) <> 1
     OR (SELECT count(*) FROM public.kds_station_categories) <> 1
     OR (SELECT count(*) FROM public.inventory_locations) <> 1
     OR (SELECT count(*) FROM public.ingredients) <> 1
     OR (SELECT count(*) FROM public.recipes) <> 1
     OR (SELECT count(*) FROM public.stock_levels) <> 1
     OR (SELECT count(*) FROM public.printers) <> 2
     OR (SELECT count(*) FROM public.printer_menu_categories) <> 1
     OR (SELECT count(*) FROM public.printer_print_types) <> 5
     OR NOT EXISTS (
       SELECT 1
       FROM public.branch_feature_flags
       WHERE branch_id = v_branch_id
         AND flag_key = 'pos_stock_outcome_posting'
         AND enabled = true
     ) THEN
    RAISE EXCEPTION 'g3b_sale_spine_seed_postcondition_failed';
  END IF;
END;
$$;

COMMIT;
