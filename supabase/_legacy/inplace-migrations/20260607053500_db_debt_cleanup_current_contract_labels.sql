DO $$
BEGIN
  IF to_regprocedure('public.close_pos_session(bigint,numeric,text,text)') IS NOT NULL THEN
    EXECUTE $comment$
      COMMENT ON FUNCTION public.close_pos_session(bigint,numeric,text,text) IS
        'Close cashier session without blocking on cash variance. Variance breach triggers manager notification via trg_notify_pos_shift_variance. expected_cash = opening + SUM(paid AND payment_method=cash). Unpaid orders carry forward to next session. JSONB result includes variance_breached for UI notification.'
    $comment$;
  END IF;

  IF to_regprocedure('public.close_pos_session(bigint,numeric,text)') IS NOT NULL THEN
    EXECUTE $comment$
      COMMENT ON FUNCTION public.close_pos_session(bigint,numeric,text) IS
        'Close cashier session without blocking on cash variance. expected_cash is opening cash plus order revenue in the session. JSONB result includes the cash difference for operator review.'
    $comment$;
  END IF;

  IF to_regprocedure('public.edit_pending_order_item(bigint,bigint,text,numeric,jsonb,jsonb,text,integer)') IS NOT NULL THEN
    EXECUTE $comment$
      COMMENT ON FUNCTION public.edit_pending_order_item(bigint,bigint,text,numeric,jsonb,jsonb,text,integer) IS
        'Sửa món đã gửi khi status=pending (chef chưa bắt đầu nấu). Server recompute unit_price/subtotal từ menu và không tin p_unit_price từ client. Sides JSONB được enrich qua pos_enrich_order_sides. Lock order + item, gate qua pos:void_order. Recompute discount qua compute_discount_amount, bump kds_tickets.updated_at.'
    $comment$;
  END IF;

  IF to_regprocedure('public.enqueue_kitchen_print(bigint)') IS NOT NULL THEN
    EXECUTE $comment$
      COMMENT ON FUNCTION public.enqueue_kitchen_print(bigint) IS
        'POS send RPC returns the current deferred-print contract: work routes to KDS, and kitchen paper is queued by complete_kds_tickets when KDS marks items ready.'
    $comment$;
  END IF;

  IF to_regprocedure('public.sync_missing_permissions_from_template()') IS NOT NULL THEN
    EXECUTE $comment$
      COMMENT ON FUNCTION public.sync_missing_permissions_from_template() IS
        'Synchronizes missing staff permission rows from position templates after template changes.'
    $comment$;
  END IF;

  IF to_regclass('public.permission_keys') IS NOT NULL THEN
    COMMENT ON TABLE public.permission_keys IS
      'Global catalog of permission strings. Edits must go through controlled permission-management flows, never ad-hoc SQL.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_levels' AND column_name = 'location_id'
  ) THEN
    COMMENT ON COLUMN public.stock_levels.location_id IS
      'Inventory location scope for the current stock level row.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_issues' AND column_name = 'source_location_id'
  ) THEN
    COMMENT ON COLUMN public.stock_issues.source_location_id IS
      'Source inventory location for this issue when the movement is location-scoped.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_issues' AND column_name = 'target_location_id'
  ) THEN
    COMMENT ON COLUMN public.stock_issues.target_location_id IS
      'Target inventory location for issue flows that hand stock to another internal location.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'location_id'
  ) THEN
    COMMENT ON COLUMN public.stock_movements.location_id IS
      'Inventory location affected by this stock movement.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_transfers' AND column_name = 'from_location_id'
  ) THEN
    COMMENT ON COLUMN public.stock_transfers.from_location_id IS
      'Source inventory location for this transfer.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_transfers' AND column_name = 'to_location_id'
  ) THEN
    COMMENT ON COLUMN public.stock_transfers.to_location_id IS
      'Destination inventory location for this transfer.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stocktake_sessions' AND column_name = 'location_id'
  ) THEN
    COMMENT ON COLUMN public.stocktake_sessions.location_id IS
      'Inventory location scope for this stocktake session.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tax_invoices' AND column_name = 'archive_attempts'
  ) THEN
    COMMENT ON COLUMN public.tax_invoices.archive_attempts IS
      'Incremented every reconcile/archive attempt regardless of outcome. Giveup threshold = 5 attempts; admin retry flow can reset it.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'owner_user_id'
  ) THEN
    COMMENT ON COLUMN public.tenants.owner_user_id IS
      'Canonical auth identity of tenant owner. UUID FK to auth.users with ON DELETE RESTRICT; distinct from representative legal name and the owner HR position label.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.v_print_agent_fleet') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.v_print_agent_fleet
      WITH (security_invoker='true') AS
      SELECT
        b.id AS branch_id,
        b.tenant_id,
        b.name AS branch_name,
        pa.agent_id,
        pa.version,
        pa.last_seen_at,
        EXTRACT(epoch FROM (now() - pa.last_seen_at))::integer AS seconds_since_seen,
        CASE
          WHEN pa.branch_id IS NULL THEN 'never_started'::text
          WHEN pa.last_seen_at < (now() - '00:05:00'::interval) THEN 'offline'::text
          WHEN pa.version IS NULL OR pa.version = ''::text THEN 'active_unknown_version'::text
          WHEN (string_to_array(pa.version, '.'::text))::integer[] < ARRAY[0, 3, 0] THEN 'outdated'::text
          ELSE 'current'::text
        END AS status
      FROM public.branches b
      LEFT JOIN public.printer_agents pa ON pa.branch_id = b.id
      WHERE b.is_active = true
    $view$;

    COMMENT ON VIEW public.v_print_agent_fleet IS
      'Fleet-wide print-agent status. RLS inherits from printer_agents (manager+).';

    GRANT ALL ON TABLE public.v_print_agent_fleet TO authenticated;
    GRANT ALL ON TABLE public.v_print_agent_fleet TO service_role;
  END IF;
END;
$$;
