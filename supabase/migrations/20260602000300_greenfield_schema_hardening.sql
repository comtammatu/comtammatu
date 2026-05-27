-- ============================================================================
-- Greenfield schema hardening
--
-- This migration tightens inherited live-schema grants without changing the
-- current application runtime contract:
--   - direct materialized-view Data API access is revoked;
--   - public views are invoker/gated and anon access is removed;
--   - internal no-policy tables are made service-only at the grant layer;
--   - broad function EXECUTE is replaced with a deliberate RPC allowlist;
--   - public bucket listing policies are tenant-scoped for authenticated users.
-- ============================================================================

-- Public views exposed through PostgREST must not bypass underlying RLS.
ALTER VIEW public.feedbacks_with_masked_phone SET (security_invoker = true);
ALTER VIEW public.printer_agent_status SET (security_invoker = true);
ALTER VIEW public.v_print_agent_fleet SET (security_invoker = true);

REVOKE ALL ON TABLE
  public.feedbacks_with_masked_phone,
  public.printer_agent_status,
  public.v_print_agent_fleet
FROM PUBLIC, anon;

GRANT SELECT ON TABLE
  public.feedbacks_with_masked_phone,
  public.printer_agent_status,
  public.v_print_agent_fleet
TO authenticated, service_role;

-- RLS does not protect materialized views. Keep reads behind vetted RPCs.
REVOKE ALL ON TABLE
  public.mv_daily_revenue,
  public.mv_food_cost,
  public.mv_grn_price_baseline,
  public.mv_inventory_stock_current,
  public.mv_inventory_value_ranking,
  public.mv_top_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.mv_daily_revenue,
  public.mv_food_cost,
  public.mv_grn_price_baseline,
  public.mv_inventory_stock_current,
  public.mv_inventory_value_ranking,
  public.mv_top_items
TO service_role;

-- These tables are service/RPC implementation details. RLS has no client
-- policies, so make the grant layer explicit as well.
REVOKE ALL ON TABLE
  public.kitchen_daily_counters,
  public.printer_agent_presence_tokens,
  public.tenant_po_counters
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.kitchen_daily_counters,
  public.printer_agent_presence_tokens,
  public.tenant_po_counters
TO service_role;

-- Public buckets can still serve public object URLs. Listing through the Data
-- API is limited to authenticated users inside their tenant folder.
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
  anon_rpc_names text[] := ARRAY[
    'submit_feedback'
  ];
  missing_names text[];
  proc_record record;
BEGIN
  SELECT array_agg(name ORDER BY name)
  INTO missing_names
  FROM unnest(authenticated_rpc_names || anon_rpc_names) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = required.name
  );

  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION 'greenfield_schema_hardening missing expected RPC(s): %', missing_names;
  END IF;

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
