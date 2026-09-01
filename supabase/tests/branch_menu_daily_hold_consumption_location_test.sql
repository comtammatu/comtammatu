-- Test: branch_menu_daily_hold_consumption_location_test.sql
-- Verifies that inserting into branch_menu_item_daily_holds routes consumption location without 42703 error

BEGIN;

DO $test_branch_menu_daily_hold_trigger$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_menu_item bigint;
  v_warehouse_location bigint;
  v_kitchen_location bigint;
  v_hold_token uuid := gen_random_uuid();
  v_hold_id bigint;
  v_routed_location bigint;
  v_order_id bigint;
  v_split_order_id bigint;
BEGIN
  -- 1. Setup tenant & branch
  INSERT INTO public.tenants (name)
  VALUES ('Daily Hold Trigger Test Tenant')
  RETURNING id INTO v_tenant;

  INSERT INTO public.branches (tenant_id, name, branch_code)
  VALUES (v_tenant, 'Daily Hold Trigger Test Branch', 'DHTB01')
  RETURNING id INTO v_branch;

  -- 2. Setup inventory locations (one default kitchen, one warehouse)
  INSERT INTO public.inventory_locations (
    tenant_id,
    branch_id,
    name,
    location_kind,
    is_default_consumption,
    is_active
  )
  VALUES (
    v_tenant,
    v_branch,
    'DHTB Kitchen',
    'kitchen',
    true,
    true
  )
  RETURNING id INTO v_kitchen_location;

  INSERT INTO public.inventory_locations (
    tenant_id,
    branch_id,
    name,
    location_kind,
    is_default_consumption,
    is_active
  )
  VALUES (
    v_tenant,
    v_branch,
    'DHTB Warehouse',
    'warehouse',
    false,
    true
  )
  RETURNING id INTO v_warehouse_location;

  -- 3. Setup menu item
  INSERT INTO public.menu_items (
    tenant_id,
    name,
    base_price,
    is_active
  )
  VALUES (
    v_tenant,
    'Test Broken Rice',
    35000,
    true
  )
  RETURNING id INTO v_menu_item;

  -- 4. Test Hold creation without explicit stock_consumption_location_id
  -- This MUST NOT throw "record new has no field split_from_order_id" (42703)
  INSERT INTO public.branch_menu_item_daily_holds (
    tenant_id,
    branch_id,
    menu_item_id,
    limit_date,
    hold_token,
    held_by,
    source,
    quantity,
    expires_at
  )
  VALUES (
    v_tenant,
    v_branch,
    v_menu_item,
    CURRENT_DATE,
    v_hold_token,
    NULL,
    'pos_cart',
    2,
    now() + interval '5 minutes'
  )
  RETURNING id, stock_consumption_location_id INTO v_hold_id, v_routed_location;

  IF v_routed_location <> v_kitchen_location THEN
    RAISE EXCEPTION 'Hold routed location % does not match default kitchen location %',
      v_routed_location, v_kitchen_location;
  END IF;

  -- 5. Test Hold creation with explicit valid warehouse location
  v_hold_token := gen_random_uuid();
  INSERT INTO public.branch_menu_item_daily_holds (
    tenant_id,
    branch_id,
    menu_item_id,
    limit_date,
    hold_token,
    held_by,
    source,
    quantity,
    expires_at,
    stock_consumption_location_id
  )
  VALUES (
    v_tenant,
    v_branch,
    v_menu_item,
    CURRENT_DATE,
    v_hold_token,
    NULL,
    'pos_cart',
    1,
    now() + interval '5 minutes',
    v_warehouse_location
  )
  RETURNING id, stock_consumption_location_id INTO v_hold_id, v_routed_location;

  IF v_routed_location <> v_warehouse_location THEN
    RAISE EXCEPTION 'Hold explicit warehouse location % was not preserved',
      v_routed_location;
  END IF;

  -- 6. Test Order creation routing & split order lineage
  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_type,
    stock_consumption_location_id
  )
  VALUES (
    v_tenant,
    v_branch,
    'dine_in',
    v_warehouse_location
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_type,
    split_from_order_id
  )
  VALUES (
    v_tenant,
    v_branch,
    'dine_in',
    v_order_id
  )
  RETURNING id, stock_consumption_location_id INTO v_split_order_id, v_routed_location;

  IF v_routed_location <> v_warehouse_location THEN
    RAISE EXCEPTION 'Split order did not inherit consumption location % from source order',
      v_warehouse_location;
  END IF;

  RAISE NOTICE 'branch_menu_daily_hold_consumption_location_test passed successfully';
END;
$$;

ROLLBACK;
