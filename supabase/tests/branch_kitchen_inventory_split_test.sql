\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch bigint;
  v_warehouse bigint;
  v_kitchen bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_transfer bigint;
  v_repeat bigint;
  v_reverse bigint;
  v_key uuid := pg_catalog.gen_random_uuid();
  v_reverse_key uuid := pg_catalog.gen_random_uuid();
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
  v_failed boolean := false;
  v_count integer;
  v_qty numeric;
  v_prepared jsonb;
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

  SELECT branch.id
  INTO v_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'SPLIT: owner and active store branch fixtures required';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner'
      )
    )::text,
    TRUE
  );

  v_prepared := public.prepare_branch_kitchen_split(v_branch);
  v_warehouse := (v_prepared ->> 'warehouse_location_id')::bigint;
  v_kitchen := (v_prepared ->> 'kitchen_location_id')::bigint;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__split_u_' || v_suffix, 'Split unit')
  RETURNING id INTO v_unit;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant, '__split_i_' || v_suffix, '__SPLIT-' || v_suffix,
    5000, 'raw_material', TRUE, v_unit, v_unit, v_unit
  ) RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active
  ) VALUES (v_tenant, v_ingredient, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, location_id, ingredient_id, type,
    quantity_change, reason, created_by, unit_cost, entry_unit_id,
    entry_quantity
  ) VALUES (
    v_tenant, v_branch, v_warehouse, v_ingredient, 'count_adjustment',
    10, 'Branch kitchen split acceptance seed', v_owner, 5000, v_unit, 10
  );

  v_transfer := (public.commit_intra_site_transfer(
    v_branch,
    v_warehouse,
    v_kitchen,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'ingredientId', v_ingredient,
      'quantity', 6,
      'entryUnitId', v_unit
    )),
    'Acceptance transfer',
    v_key
  ) ->> 'id')::bigint;

  v_repeat := (public.commit_intra_site_transfer(
    v_branch,
    v_warehouse,
    v_kitchen,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'ingredientId', v_ingredient,
      'quantity', 6,
      'entryUnitId', v_unit
    )),
    'Acceptance transfer',
    v_key
  ) ->> 'id')::bigint;

  IF v_transfer IS NULL OR v_repeat <> v_transfer THEN
    RAISE EXCEPTION 'SPLIT: idempotent commit did not return the original transfer';
  END IF;

  BEGIN
    PERFORM public.commit_intra_site_transfer(
      v_branch,
      v_warehouse,
      v_kitchen,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'ingredientId', v_ingredient,
        'quantity', 5,
        'entryUnitId', v_unit
      )),
      'Acceptance transfer',
      v_key
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM = 'intra_site_transfer_idempotency_conflict';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'SPLIT: changed payload reused the idempotency key';
  END IF;
  v_failed := FALSE;

  SELECT count(*)
  INTO v_count
  FROM public.stock_movements AS movement
  WHERE movement.transfer_id = v_transfer
    AND movement.tenant_id = v_tenant
    AND movement.type IN ('transfer_out', 'transfer_in');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'SPLIT: expected exactly two balanced movements, got %', v_count;
  END IF;

  SELECT sum(movement.quantity_change)
  INTO v_qty
  FROM public.stock_movements AS movement
  WHERE movement.transfer_id = v_transfer
    AND movement.tenant_id = v_tenant;
  IF v_qty <> 0 THEN
    RAISE EXCEPTION 'SPLIT: intra-site movement net expected 0, got %', v_qty;
  END IF;

  SELECT stock.current_quantity
  INTO v_qty
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.location_id = v_kitchen
    AND stock.ingredient_id = v_ingredient;
  IF v_qty <> 6 THEN
    RAISE EXCEPTION 'SPLIT: kitchen quantity expected 6, got %', v_qty;
  END IF;

  BEGIN
    UPDATE public.stock_transfer_items
    SET quantity = quantity + 1
    WHERE tenant_id = v_tenant
      AND transfer_id = v_transfer;
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM LIKE 'intra_site_transfer_items_immutable:%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'SPLIT: completed intra-site item remained editable';
  END IF;
  v_failed := FALSE;

  BEGIN
    UPDATE public.stock_transfers
    SET status = 'cancelled'
    WHERE tenant_id = v_tenant
      AND id = v_transfer;
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM LIKE 'intra_site_transfer_document_immutable:%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'SPLIT: completed intra-site document remained mutable';
  END IF;
  v_failed := FALSE;

  BEGIN
    PERFORM public.commit_intra_site_transfer(
      v_branch,
      v_warehouse,
      v_kitchen,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'ingredientId', v_ingredient,
        'quantity', 99,
        'entryUnitId', v_unit
      )),
      'Must roll back',
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE 'intra_site_transfer_insufficient_stock:%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'SPLIT: insufficient stock was not rejected';
  END IF;

  v_reverse := (public.reverse_intra_site_transfer(
    v_transfer,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'ingredientId', v_ingredient,
      'quantity', 2,
      'entryUnitId', v_unit
    )),
    'Partial reversal',
    v_reverse_key
  ) ->> 'id')::bigint;

  v_repeat := (public.reverse_intra_site_transfer(
    v_transfer,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'ingredientId', v_ingredient,
      'quantity', 2,
      'entryUnitId', v_unit
    )),
    'Partial reversal',
    v_reverse_key
  ) ->> 'id')::bigint;
  IF v_repeat <> v_reverse THEN
    RAISE EXCEPTION 'SPLIT: idempotent reverse did not return the original transfer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_reverse
      AND transfer.reverses_transfer_id = v_transfer
      AND transfer.transfer_scope = 'intra_site'
      AND transfer.status = 'received'
  ) THEN
    RAISE EXCEPTION 'SPLIT: partial reversal document is invalid';
  END IF;

  SELECT remaining.remaining_quantity
  INTO v_qty
  FROM public.get_intra_site_transfer_remaining(v_transfer) AS remaining
  WHERE remaining.ingredient_id = v_ingredient;
  IF v_qty <> 4 THEN
    RAISE EXCEPTION 'SPLIT: expected remaining reversal quantity 4, got %', v_qty;
  END IF;
END;
$$;

ROLLBACK;
