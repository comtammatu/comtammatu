-- Temporarily downgrade default_consumption from hard gate to warning.
--
-- Rationale:
-- - Menu items are not guaranteed to have full inventory/recipe readiness yet.
-- - `default_consumption` identifies the preferred branch kitchen location; it
--   should not block transfer/cap-bep/POS runtime while setup is being cleaned.
-- - We still require an active kitchen location for kitchen consumption flows.

DO $$
DECLARE
  v_sql    TEXT;
  v_before TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_stock_transfer_draft(bigint,bigint,text,text,text,jsonb,bigint,bigint)'::regprocedure
  )
    INTO v_sql;

  v_before := v_sql;
  v_sql := regexp_replace(
    v_sql,
    $pattern$IF v_to_loc.location_kind <> 'kitchen' OR v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN\s+RAISE EXCEPTION 'intra_branch_target_must_be_default_consumption' USING ERRCODE = '23514';\s+END IF;$pattern$,
    $replace$IF v_to_loc.location_kind <> 'kitchen' THEN
      RAISE EXCEPTION 'intra_branch_target_must_be_kitchen' USING ERRCODE = '23514';
    END IF;

    IF v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
      RAISE WARNING 'default_consumption_location_not_marked:branch %, location %',
        p_to_branch_id,
        p_to_location_id;
    END IF;$replace$,
    'g'
  );

  IF v_sql = v_before THEN
    RAISE EXCEPTION 'default_consumption_warn_only_patch_missed:create_stock_transfer_draft';
  END IF;

  EXECUTE v_sql;
END $$;

DO $$
DECLARE
  v_sql    TEXT;
  v_before TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.commit_intra_branch_transfer(bigint,bigint,bigint,text,text,jsonb)'::regprocedure
  )
    INTO v_sql;

  v_before := v_sql;
  v_sql := regexp_replace(
    v_sql,
    $pattern$IF NOT FOUND\s+OR v_to_loc.branch_id <> p_branch_id\s+OR v_to_loc.location_kind <> 'kitchen'\s+OR v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN\s+RAISE EXCEPTION 'intra_branch_target_must_be_default_consumption' USING ERRCODE = '23514';\s+END IF;$pattern$,
    $replace$IF NOT FOUND
     OR v_to_loc.branch_id <> p_branch_id
     OR v_to_loc.location_kind <> 'kitchen' THEN
    RAISE EXCEPTION 'intra_branch_target_must_be_kitchen' USING ERRCODE = '23514';
  END IF;

  IF v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_not_marked:branch %, location %',
      p_branch_id,
      p_to_location_id;
  END IF;$replace$,
    'g'
  );

  IF v_sql = v_before THEN
    RAISE EXCEPTION 'default_consumption_warn_only_patch_missed:commit_intra_branch_transfer';
  END IF;

  EXECUTE v_sql;
END $$;

DO $$
DECLARE
  v_sql    TEXT;
  v_before TEXT;
BEGIN
  SELECT pg_get_functiondef('public.stock_transfer_confirm_ship(bigint)'::regprocedure)
    INTO v_sql;

  v_before := v_sql;
  v_sql := regexp_replace(
    v_sql,
    $pattern$IF NOT FOUND\s+OR v_to_loc.branch_id <> v_tr.to_branch_id\s+OR v_from_loc.location_kind <> 'warehouse'\s+OR v_to_loc.location_kind <> 'kitchen'\s+OR v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN\s+RAISE EXCEPTION 'intra_branch_location_invalid' USING ERRCODE = '23514';\s+END IF;$pattern$,
    $replace$IF NOT FOUND
       OR v_to_loc.branch_id <> v_tr.to_branch_id
       OR v_from_loc.location_kind <> 'warehouse'
       OR v_to_loc.location_kind <> 'kitchen' THEN
      RAISE EXCEPTION 'intra_branch_location_invalid' USING ERRCODE = '23514';
    END IF;

    IF v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
      RAISE WARNING 'default_consumption_location_not_marked:branch %, location %',
        v_tr.to_branch_id,
        v_tr.to_location_id;
    END IF;$replace$,
    'g'
  );

  IF v_sql = v_before THEN
    RAISE EXCEPTION 'default_consumption_warn_only_patch_missed:stock_transfer_confirm_ship';
  END IF;

  EXECUTE v_sql;
END $$;

DO $$
DECLARE
  v_sql    TEXT;
  v_before TEXT;
BEGIN
  SELECT pg_get_functiondef('public.consume_stock_for_order(bigint)'::regprocedure)
    INTO v_sql;

  v_before := v_sql;

  v_sql := replace(
    v_sql,
    'v_location_id BIGINT;',
    'v_location_id BIGINT;
  v_location_is_default BOOLEAN;'
  );

  v_sql := regexp_replace(
    v_sql,
    $pattern$SELECT il.id INTO v_location_id\s+FROM public.inventory_locations il\s+WHERE il.branch_id = v_order.branch_id\s+AND il.tenant_id = v_tenant\s+AND il.is_default_consumption = TRUE\s+AND il.is_active = TRUE\s+LIMIT 1;\s+IF v_location_id IS NULL THEN\s+RAISE EXCEPTION 'default_consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';\s+END IF;$pattern$,
    $replace$SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using kitchen location %',
      v_order.branch_id,
      v_location_id;
  END IF;$replace$,
    'g'
  );

  IF v_sql = v_before THEN
    RAISE EXCEPTION 'default_consumption_warn_only_patch_missed:consume_stock_for_order';
  END IF;

  EXECUTE v_sql;
END $$;

DO $$
DECLARE
  v_sql    TEXT;
  v_before TEXT;
BEGIN
  SELECT pg_get_functiondef('public.consume_stock_for_order_service(bigint,uuid)'::regprocedure)
    INTO v_sql;

  v_before := v_sql;

  v_sql := replace(
    v_sql,
    'v_location_id BIGINT;',
    'v_location_id BIGINT;
  v_location_is_default BOOLEAN;'
  );

  v_sql := regexp_replace(
    v_sql,
    $pattern$SELECT il.id INTO v_location_id\s+FROM public.inventory_locations il\s+WHERE il.branch_id = v_order.branch_id\s+AND il.tenant_id = v_order.tenant_id\s+AND il.is_default_consumption = TRUE\s+AND il.is_active = TRUE\s+LIMIT 1;\s+IF v_location_id IS NULL THEN\s+RAISE EXCEPTION 'default_consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';\s+END IF;$pattern$,
    $replace$SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using kitchen location %',
      v_order.branch_id,
      v_location_id;
  END IF;$replace$,
    'g'
  );

  IF v_sql = v_before THEN
    RAISE EXCEPTION 'default_consumption_warn_only_patch_missed:consume_stock_for_order_service';
  END IF;

  EXECUTE v_sql;
END $$;
