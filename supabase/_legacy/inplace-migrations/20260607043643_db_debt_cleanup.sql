SET lock_timeout = '5s';
SET statement_timeout = '30min';

DO $$
BEGIN
  IF to_regclass('public.v_print_agent_fleet') IS NOT NULL THEN
    COMMENT ON VIEW public.v_print_agent_fleet IS
      'Fleet-wide print-agent status. RLS inherits from printer_agents.';
  END IF;

  IF to_regclass('public.stock_levels') IS NOT NULL THEN
    COMMENT ON COLUMN public.stock_levels.location_id IS
      'Inventory location for this stock level row.';
  END IF;

  IF to_regclass('public.stock_movements') IS NOT NULL THEN
    COMMENT ON COLUMN public.stock_movements.location_id IS
      'Inventory location affected by this movement row.';
  END IF;

  IF to_regclass('public.stock_issues') IS NOT NULL THEN
    COMMENT ON COLUMN public.stock_issues.source_location_id IS
      'Inventory location goods move from.';
    COMMENT ON COLUMN public.stock_issues.target_location_id IS
      'Inventory location goods move to.';
  END IF;

  IF to_regclass('public.stock_transfers') IS NOT NULL THEN
    COMMENT ON COLUMN public.stock_transfers.from_location_id IS
      'Inventory location goods move from.';
    COMMENT ON COLUMN public.stock_transfers.to_location_id IS
      'Inventory location goods move to.';
  END IF;

  IF to_regclass('public.stocktake_sessions') IS NOT NULL THEN
    COMMENT ON COLUMN public.stocktake_sessions.location_id IS
      'Inventory location counted in this stocktake session.';
  END IF;
END
$$;

UPDATE public.system_settings
SET description = 'Loại QR in trên phiếu tạm tính.'
WHERE key = 'payment_qr_type'
  AND (
    description IS NULL
    OR description ~* '(todo|future|momo|legacy|compat|phase|backfill|cutover)'
  );

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(
  p_position_code text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_position_code
    WHEN 'owner' THEN 'owner'
    WHEN 'super_manager' THEN 'super_manager'
    WHEN 'executive_assistant' THEN 'super_manager'
    WHEN 'area_manager' THEN 'area_manager'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'chief_accountant' THEN 'office'
    WHEN 'accountant' THEN 'office'
    WHEN 'office' THEN 'office'
    WHEN 'warehouse_head' THEN 'warehouse_manager'
    WHEN 'warehouse_keeper' THEN 'warehouse_manager'
    WHEN 'head_chef' THEN 'production_manager'
    WHEN 'chef' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'waiter' THEN 'waiter'
    WHEN 'warehouse_manager' THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(text)
  FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.staff_role_from_position_code(text) IS
  'Maps HR position codes to StaffRole buckets used by route ACL.';

DO $$
DECLARE
  fn_record record;
  fn_sql text;
BEGIN
  FOR fn_record IN
    SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosrc ILIKE '%legacy_role_code%'
    ORDER BY p.oid::regprocedure::text
  LOOP
    fn_sql := fn_record.definition;
    fn_sql := replace(
      fn_sql,
      'SELECT legacy_role_code INTO v_code',
      'SELECT private.staff_role_from_position_code(code) INTO v_code'
    );
    fn_sql := replace(
      fn_sql,
      'COALESCE(po.legacy_role_code, ''office'')',
      'COALESCE(private.staff_role_from_position_code(po.code), ''office'')'
    );
    fn_sql := replace(
      fn_sql,
      'COALESCE(po.legacy_role_code, ''unassigned'')',
      'COALESCE(private.staff_role_from_position_code(po.code), ''unassigned'')'
    );
    fn_sql := replace(
      fn_sql,
      'pos.legacy_role_code::text AS role',
      'private.staff_role_from_position_code(pos.code) AS role'
    );
    fn_sql := regexp_replace(fn_sql, E'\n\\s*--[^\n]*legacy[^\n]*', '', 'gi');

    IF fn_sql ILIKE '%legacy_role_code%' THEN
      RAISE EXCEPTION
        'role source cleanup did not fully rewrite %',
        fn_record.signature;
    END IF;

    EXECUTE fn_sql;
  END LOOP;
END
$$;

COMMENT ON FUNCTION public.auth_role() IS
  'Returns the StaffRole bucket derived from positions.code for the current user.';
COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Auth hook emits tenant, branch, area, position, and StaffRole bucket claims.';

DO $$
DECLARE
  reader_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'positions'
      AND column_name = 'legacy_role_code'
  ) THEN
    SELECT count(*)
    INTO reader_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosrc ILIKE '%legacy_role_code%';

    IF reader_count > 0 THEN
      RAISE EXCEPTION
        'positions.legacy_role_code still has % database function reader(s); cut those readers before dropping the column',
        reader_count;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_policy
      WHERE COALESCE(pg_get_expr(polqual, polrelid), '') ILIKE '%legacy_role_code%'
         OR COALESCE(pg_get_expr(polwithcheck, polrelid), '') ILIKE '%legacy_role_code%'
    ) THEN
      RAISE EXCEPTION
        'positions.legacy_role_code is still referenced by RLS policy expression(s)';
    END IF;

    ALTER TABLE public.positions DROP COLUMN legacy_role_code;
  END IF;
END
$$;

DO $$
DECLARE
  view_name text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'public.feedbacks_with_masked_phone',
    'public.printer_agent_status',
    'public.v_print_agent_fleet'
  ]
  LOOP
    IF to_regclass(view_name) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = true)', view_name);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon', view_name);
      EXECUTE format(
        'GRANT SELECT ON TABLE %s TO authenticated, service_role',
        view_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  rel_name text;
BEGIN
  FOREACH rel_name IN ARRAY ARRAY[
    'public.mv_daily_revenue',
    'public.mv_food_cost',
    'public.mv_grn_price_baseline',
    'public.mv_inventory_stock_current',
    'public.mv_inventory_value_ranking',
    'public.mv_top_items'
  ]
  LOOP
    IF to_regclass(rel_name) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated',
        rel_name
      );
      EXECUTE format('GRANT SELECT ON TABLE %s TO service_role', rel_name);
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  rel_name text;
  policy_name text;
BEGIN
  FOREACH rel_name IN ARRAY ARRAY[
    'public.cash_entries',
    'public.kitchen_daily_counters',
    'public.printer_agent_presence_tokens',
    'public.recurring_expense_templates',
    'public.tenant_po_counters'
  ]
  LOOP
    IF to_regclass(rel_name) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated',
        rel_name
      );
      EXECUTE format('GRANT ALL ON TABLE %s TO service_role', rel_name);
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', rel_name);

      policy_name := replace(split_part(rel_name, '.', 2), '.', '_')
        || '_service_only_no_client_access';
      EXECUTE format('DROP POLICY IF EXISTS %I ON %s', policy_name, rel_name);
      EXECUTE format(
        'CREATE POLICY %I ON %s AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        policy_name,
        rel_name
      );
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS inv_attach_read ON storage.objects;
CREATE POLICY inv_attach_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inventory-attachments'
    AND public.auth_tenant_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::text
  );

DROP POLICY IF EXISTS menu_images_read ON storage.objects;
CREATE POLICY menu_images_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND public.auth_tenant_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::text
  );

DO $$
DECLARE
  authenticated_rpc_names text[] := ARRAY[
    '_auth_v2_is_owner',
    'acquire_zone_lock',
    'admin_update_profile',
    'amend_grn_line',
    'append_order_items',
    'apply_order_discount',
    'apply_template_to_user',
    'approve_shift_request',
    'approve_waste',
    'auth_branch_id',
    'auth_role',
    'auth_tenant_id',
    'bulk_mark_feedback_suspect',
    'bump_kds_ticket',
    'can_access_branch',
    'cancel_order',
    'cancel_pending_payment',
    'cancel_production_order',
    'cancel_shift_request',
    'clear_branch_menu_daily_limit',
    'clear_order_discount',
    'close_fiscal_period',
    'close_period_hard',
    'close_period_soft',
    'close_pos_session',
    'close_recount_round',
    'commit_intra_branch_transfer',
    'complete_kds_tickets',
    'complete_stocktake',
    'compute_user_trust_score',
    'confirm_cash_payment',
    'confirm_goods_receipt_note',
    'confirm_payment_and_post',
    'confirm_production_order',
    'confirm_stock_issue',
    'confirm_supplier_return',
    'confirm_vietqr_payment',
    'consume_stock_for_order',
    'count_unread_notifications',
    'create_grn_from_po',
    'create_manual_journal_entry',
    'create_order',
    'create_payment',
    'create_production_order',
    'create_refund',
    'create_stock_transfer_draft',
    'create_stocktake_session',
    'create_supplier_return_from_grn',
    'create_supplier_return_from_stock',
    'create_waste_entry',
    'edit_pending_order_item',
    'enqueue_cancel_ticket_print',
    'enqueue_edit_pending_order_item_quantity_print',
    'enqueue_kitchen_print',
    'enqueue_partial_cancel_ticket_print',
    'enqueue_provisional_bill',
    'enqueue_receipt_print',
    'enqueue_shift_close_print',
    'escalate_round_4',
    'extend_express_window',
    'finalize_stocktake',
    'find_payment_order_desync',
    'fn_generate_b01_dn',
    'fn_generate_b02_dn',
    'fn_generate_b03_dn',
    'fn_generate_form_01_gtgt',
    'fn_reconcile_drilldown',
    'fn_reconcile_period',
    'fn_reconcile_sales_by_day',
    'get_branch_menu_daily_limits_for_pos',
    'get_cash_variance_summary',
    'get_daily_revenue',
    'get_finance_dashboard_summary',
    'get_food_cost',
    'get_grn_price_baseline',
    'get_inventory_alerts',
    'get_inventory_dashboard',
    'get_orders_for_day',
    'get_pos_session_report',
    'get_revenue_by_cashier',
    'get_revenue_by_hour',
    'get_revenue_kpis',
    'get_revenue_rollup',
    'get_stocktake_lines_blind',
    'get_top_items',
    'gl_reconciliation',
    'grant_permission',
    'grn_is_auto_approvable',
    'has_permission',
    'has_permission_any',
    'heartbeat_zone_lock',
    'inventory_shift_key',
    'is_feature_enabled',
    'is_inventory_production_operator',
    'list_branch_menu_daily_limits',
    'log_audit',
    'mark_all_notifications_read',
    'mark_kds_item_out_of_stock',
    'mark_order_item_served',
    'merge_orders',
    'next_po_display_id',
    'override_grn_hardblock',
    'post_manual_journal_entry',
    'recall_kds_ticket',
    'recompute_supplier_invoice_matching',
    'reduce_order_item_quantity',
    'refresh_finance_views',
    'refresh_inventory_dashboard',
    'reject_shift_request',
    'release_zone_lock',
    'replace_tax_invoice',
    'resolve_stocktake_conflict',
    'retry_print_job',
    'reverse_payment_and_post',
    'revoke_permission',
    'route_order_to_kds',
    'save_item_modifiers',
    'save_item_sides',
    'save_item_variants',
    'save_station_categories',
    'seed_chart_of_accounts',
    'set_branch_menu_daily_limit',
    'set_order_service_charge',
    'set_pos_order_item_priority',
    'set_pos_order_priority',
    'split_order',
    'start_stocktake',
    'stock_transfer_confirm_receive',
    'stock_transfer_confirm_ship',
    'stock_transfer_list_branches',
    'stock_transfer_mark_in_transit',
    'stock_transfer_receive',
    'submit_count_round',
    'submit_feedback',
    'submit_shift_request',
    'toggle_category_active',
    'toggle_ingredient_active',
    'toggle_item_active',
    'toggle_profile_active',
    'transfer_order_table',
    'transition_supplier_return',
    'transition_tax_invoice_state',
    'update_ingredient_thresholds_bulk',
    'update_my_dependents_count',
    'update_my_profile',
    'update_pos_order_status',
    'upsert_printer_with_routes',
    'upsert_production_recipe_lines',
    'upsert_recipe_lines',
    'verify_branch_override_code',
    'void_manual_journal_entry',
    'void_order_item'
  ];
  anon_rpc_names text[] := ARRAY['submit_feedback'];
  proc_record record;
BEGIN
  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

  FOR proc_record IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(authenticated_rpc_names)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', proc_record.signature);
  END LOOP;

  FOR proc_record IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(anon_rpc_names)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', proc_record.signature);
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

DO $$
DECLARE
  fn_signature text;
BEGIN
  FOREACH fn_signature IN ARRAY ARRAY[
    'public._auth_v2_check_area_scope()',
    'public._auth_v2_check_branch_required()',
    'public.auth_area_id()',
    'public.auth_branch_id()',
    'public.auth_tenant_id()',
    'public.can_access_branch(bigint)',
    'public.check_menu_item_tenant()',
    'public.check_sides_tenant()',
    'public.check_table_zone_tenant()',
    'public.check_variant_tenant()',
    'public.close_pos_session(bigint,numeric,text)',
    'public.release_table(bigint)',
    'public.route_order_to_kds(bigint)',
    'public.save_item_modifiers(bigint,jsonb)',
    'public.save_item_sides(bigint,jsonb)',
    'public.save_item_variants(bigint,jsonb)',
    'public.save_station_categories(bigint,bigint[])',
    'public.toggle_category_active(bigint)',
    'public.toggle_item_active(bigint)',
    'public.update_updated_at()'
  ]
  LOOP
    IF to_regprocedure(fn_signature) IS NOT NULL THEN
      EXECUTE format(
        'ALTER FUNCTION %s SET search_path = pg_catalog, public, private, extensions, auth, storage',
        fn_signature
      );
    END IF;
  END LOOP;

  IF to_regprocedure('public.feedback_validate_categories(text[])') IS NOT NULL THEN
    ALTER FUNCTION public.feedback_validate_categories(text[]) SET search_path = '';
  END IF;
END
$$;

DROP POLICY IF EXISTS "sti_select" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "sti_manage" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "pp_manage" ON public.payroll_periods;
DROP POLICY IF EXISTS "pp_select" ON public.payroll_periods;
DROP POLICY IF EXISTS "attendance_employee_self_select" ON public.attendance_records;

DROP INDEX IF EXISTS public.idx_kitchen_send_batches_order;
DROP INDEX IF EXISTS public.idx_telegram_outbox_feedback;

DO $$
DECLARE
  fk_record record;
BEGIN
  FOR fk_record IN
    WITH fk AS (
      SELECT
        c.oid AS con_oid,
        t.oid AS table_oid,
        n.nspname AS schema_name,
        t.relname AS table_name,
        array_agg(a.attname ORDER BY u.ordinality) AS column_names,
        c.conkey AS conkey
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = u.attnum
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND t.relkind IN ('r', 'p')
      GROUP BY c.oid, t.oid, n.nspname, t.relname, c.conkey
    ),
    covered AS (
      SELECT fk.con_oid
      FROM fk
      JOIN pg_index i ON i.indrelid = fk.table_oid
      WHERE i.indisvalid
        AND i.indpred IS NULL
        AND array_length(i.indkey::smallint[], 1) >= array_length(fk.conkey, 1)
        AND NOT EXISTS (
          SELECT 1
          FROM generate_subscripts(fk.conkey, 1) AS s(pos)
          WHERE (i.indkey::smallint[])[s.pos - 1] IS DISTINCT FROM fk.conkey[s.pos]
        )
    )
    SELECT
      schema_name,
      table_name,
      column_names,
      left(
        'idx_' || table_name || '_' || array_to_string(column_names, '_'),
        54
      )
        || '_'
        || substr(md5(schema_name || '.' || table_name || '.' || array_to_string(column_names, ',')), 1, 8)
        AS index_name
    FROM fk
    WHERE NOT EXISTS (
      SELECT 1
      FROM covered
      WHERE covered.con_oid = fk.con_oid
    )
    ORDER BY table_name, column_names
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      fk_record.index_name,
      fk_record.schema_name,
      fk_record.table_name,
      (
        SELECT string_agg(format('%I', col), ', ')
        FROM unnest(fk_record.column_names) AS col
      )
    );
  END LOOP;
END
$$;
