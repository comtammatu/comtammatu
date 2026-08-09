BEGIN;

DO $$
DECLARE
  v_definition text;
  v_trigger_definition text;
BEGIN
  IF pg_get_function_result('public.scan_inventory_alerts()'::regprocedure) <> 'bigint' THEN
    RAISE EXCEPTION 'scan_inventory_alerts_return_type_drift';
  END IF;

  SELECT pg_get_functiondef('public.scan_inventory_alerts()'::regprocedure)
  INTO v_definition;
  IF position('min_stock_level' IN v_definition) = 0
     OR position('sum(stock.current_quantity)' IN v_definition) = 0
     OR position('production_storage' IN v_definition) = 0
     OR position('inventory.stock_low:%s:%s' IN v_definition) = 0
     OR position('notification_reads' IN v_definition) = 0
     OR position('reorder_point' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'inventory_low_stock_contract_drift';
  END IF;

  SELECT pg_get_functiondef('public.weekly_waste_report()'::regprocedure)
  INTO v_definition;
  IF position('Asia/Ho_Chi_Minh' IN v_definition) = 0
     OR position('v_week_end - 7' IN v_definition) = 0
     OR position('ON CONFLICT' IN v_definition) = 0
     OR position('expires_at' IN v_definition) = 0
     OR position('waste-approvals' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'weekly_waste_report_contract_drift';
  END IF;

  SELECT pg_get_functiondef('public.trg_notify_grn_created()'::regprocedure)
  INTO v_definition;
  IF position('hàng từ chối' IN v_definition) = 0
     OR position('giá' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'grn_notification_copy_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'stocktake_conflicts'
      AND trigger_row.tgname = 'notify_stocktake_conflict_after_insert'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'stocktake_conflict_notification_trigger_missing';
  END IF;

  FOREACH v_trigger_definition IN ARRAY ARRAY[
    pg_get_triggerdef((
      SELECT trigger_row.oid
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'stock_requests'
        AND trigger_row.tgname = 'trg_broadcast_branch_ops'
        AND NOT trigger_row.tgisinternal
    )),
    pg_get_triggerdef((
      SELECT trigger_row.oid
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'purchase_requests'
        AND trigger_row.tgname = 'trg_broadcast_branch_ops'
        AND NOT trigger_row.tgisinternal
    )),
    pg_get_triggerdef((
      SELECT trigger_row.oid
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'production_runs'
        AND trigger_row.tgname = 'trg_broadcast_branch_ops'
        AND NOT trigger_row.tgisinternal
    ))
  ] LOOP
    IF v_trigger_definition IS NULL
       OR position('broadcast_branch_ops' IN v_trigger_definition) = 0 THEN
      RAISE EXCEPTION 'inventory_branch_ops_broadcast_trigger_missing';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stocktake_sessions'
      AND column_name = 'updated_at'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'stocktake_session_updated_at_missing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_expiry_writeoff(bigint,bigint,bigint,numeric,bigint,text,text[])',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.create_expiry_writeoff(bigint,bigint,bigint,numeric,bigint,text,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'create_expiry_writeoff_quarantine_acl_drift';
  END IF;

  SELECT pg_get_functiondef('private.canonicalize_notification()'::regprocedure)
  INTO v_definition;
  IF position(
       'format(''/br/%s/stock?work=receive'', NEW.target_branch_id)'
       IN v_definition
     ) = 0
     OR position(
       'format(''/br/%s/stock/waste-approvals'', NEW.target_branch_id)'
       IN v_definition
     ) = 0 THEN
    RAISE EXCEPTION 'inventory_notification_branch_routing_drift';
  END IF;

  SELECT pg_get_functiondef(
    'public.run_inventory_valuation_reconciliation()'::regprocedure
  )
  INTO v_definition;
  IF position('/finance/food-cost?year=' IN v_definition) = 0
     OR position('/finance/cost-close' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'valuation_reconciliation_url_drift';
  END IF;
END;
$$;

ROLLBACK;
