-- Realtime PR5 — Freshness stamps + cron run-log/alert + drop stale MVs

-- 1. Drop stale/dead materialized views
DROP MATERIALIZED VIEW IF EXISTS public.mv_top_items CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_revenue CASCADE;

-- 2. Update refresh_finance_views() to only refresh mv_food_cost
CREATE OR REPLACE FUNCTION public.refresh_finance_views() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Authenticated callers must hold settings:tenant (matches the server action);
  -- pg_cron runs with no JWT (auth.uid() IS NULL) and bypasses the check.
  IF auth.uid() IS NOT NULL AND NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'permission denied: settings:tenant required' USING ERRCODE = '42501';
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_food_cost;
  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_food_cost', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;
END;
$$;

-- 3. Update refresh_inventory_dashboard() to also log to mv_refresh_log
-- Allow bypass of auth for pg_cron (auth.uid() IS NULL)
CREATE OR REPLACE FUNCTION public.refresh_inventory_dashboard() RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Authenticated callers must hold appropriate permissions;
  -- pg_cron runs with no JWT (auth.uid() IS NULL) and bypasses the check.
  IF auth.uid() IS NOT NULL THEN
    IF NOT (public.has_permission(NULL, 'reports:view_branch') OR public.has_permission(NULL, 'reports:view_tenant')
         OR public.has_permission(NULL, 'settings:branch') OR public.has_permission(NULL, 'settings:tenant')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;

  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_inventory_stock_current', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;

  RETURN now();
END; $$;

-- 4. Update get_inventory_dashboard RPC to return freshness timestamp
CREATE OR REPLACE FUNCTION public.get_inventory_dashboard(p_branch_id bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_tenant BIGINT := public.auth_tenant_id(); v_can_cost BOOLEAN;
  v_summary JSONB; v_locations JSONB; v_alerts JSONB; v_in_transit JSONB;
  v_refreshed_at TIMESTAMPTZ;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_permission(p_branch_id, 'inventory:read') OR public.has_permission(NULL, 'reports:view_branch') OR public.has_permission(NULL, 'reports:view_tenant')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_can_cost := public.has_permission(NULL, 'reports:view_branch') OR public.has_permission(NULL, 'reports:view_tenant');

  SELECT refreshed_at INTO v_refreshed_at
  FROM public.mv_refresh_log
  WHERE view_name = 'mv_inventory_stock_current';

  SELECT jsonb_build_object(
    'total_skus', COALESCE(COUNT(DISTINCT m.ingredient_id), 0),
    'location_count', COALESCE(COUNT(DISTINCT m.location_id), 0),
    'total_quantity', COALESCE(SUM(m.current_quantity), 0),
    'total_value_vnd', CASE WHEN v_can_cost THEN COALESCE(SUM(m.stock_value), 0) ELSE NULL END,
    'alerts_count', (SELECT COUNT(*) FROM public.mv_inventory_stock_current a
                     WHERE a.tenant_id=v_tenant AND a.branch_id=p_branch_id
                       AND a.reorder_point IS NOT NULL AND a.current_quantity < a.reorder_point)
  ) INTO v_summary FROM public.mv_inventory_stock_current m
  WHERE m.tenant_id=v_tenant AND m.branch_id=p_branch_id;

  SELECT COALESCE(jsonb_agg(loc ORDER BY (loc->>'location_kind'), (loc->>'location_name')), '[]'::JSONB)
  INTO v_locations FROM (
    SELECT jsonb_build_object(
      'location_id', m.location_id, 'location_name', MAX(m.location_name), 'location_kind', MAX(m.location_kind),
      'sku_count', COUNT(DISTINCT m.ingredient_id), 'total_quantity', SUM(m.current_quantity),
      'total_value_vnd', CASE WHEN v_can_cost THEN SUM(m.stock_value) ELSE NULL END,
      'alerts_count', COUNT(*) FILTER (WHERE m.reorder_point IS NOT NULL AND m.current_quantity < m.reorder_point)
    ) AS loc FROM public.mv_inventory_stock_current m
    WHERE m.tenant_id=v_tenant AND m.branch_id=p_branch_id GROUP BY m.location_id) t;

  SELECT COALESCE(jsonb_agg(a ORDER BY (a->>'severity_rank'), (a->>'shortage_ratio') DESC), '[]'::JSONB)
  INTO v_alerts FROM (
    SELECT jsonb_build_object(
      'alert_type', CASE WHEN m.current_quantity < 0 THEN 'negative_stock'
                         WHEN m.current_quantity = 0 THEN 'out_of_stock' ELSE 'low_stock' END,
      'severity_rank', CASE WHEN m.current_quantity < 0 THEN 0 WHEN m.current_quantity = 0 THEN 1 ELSE 2 END,
      'ingredient_id', m.ingredient_id, 'ingredient_name', m.ingredient_name,
      'location_id', m.location_id, 'location_name', m.location_name,
      'current_quantity', m.current_quantity, 'reorder_point', m.reorder_point,
      'shortage_ratio', CASE WHEN m.reorder_point > 0 THEN (m.reorder_point - m.current_quantity) / m.reorder_point ELSE 0 END
    ) AS a FROM public.mv_inventory_stock_current m
    WHERE m.tenant_id=v_tenant AND m.branch_id=p_branch_id) t
  WHERE (t.a->>'reorder_point') IS NOT NULL AND (t.a->>'current_quantity')::NUMERIC < (t.a->>'reorder_point')::NUMERIC;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'id' DESC), '[]'::JSONB)
  INTO v_in_transit FROM (
    SELECT jsonb_build_object(
      'id', t.id, 'transfer_number', t.transfer_number,
      'from_branch_name', fb.name, 'to_branch_name', tb.name, 'status', t.status
    ) AS x FROM public.stock_transfers t
    JOIN public.branches fb ON fb.id = t.from_branch_id
    JOIN public.branches tb ON tb.id = t.to_branch_id
    WHERE t.tenant_id=v_tenant AND (t.from_branch_id=p_branch_id OR t.to_branch_id=p_branch_id)
      AND t.status IN ('draft', 'confirmed_ship', 'in_transit', 'confirmed_receive')
  ) t2;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'computed_at', COALESCE(v_refreshed_at, now()),
    'summary', v_summary,
    'locations', v_locations,
    'top_alerts', v_alerts,
    'in_transit', v_in_transit
  );
END; $$;

-- 5. Create check_cron_jobs_health() RPC to monitor pg_cron runs
CREATE OR REPLACE FUNCTION public.check_cron_jobs_health() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_job RECORD;
  v_last_run RECORD;
  v_max_age INTERVAL;
  v_is_healthy BOOLEAN;
  v_dedup_key TEXT;
  v_msg TEXT;
BEGIN
  -- Iterate through pg_cron active schedules
  FOR v_job IN
    SELECT jobid, jobname, schedule
    FROM cron.job
  LOOP
    -- Skip checking this monitoring job itself
    IF v_job.jobname = 'check_cron_jobs_health_job' THEN
      CONTINUE;
    END IF;

    -- Determine maximum allowed run age (grace period)
    IF v_job.schedule LIKE '*/15%' THEN
      v_max_age := INTERVAL '45 minutes';
    ELSIF v_job.schedule LIKE '%* * * *' AND v_job.schedule NOT LIKE '*/%' THEN
      v_max_age := INTERVAL '90 minutes';
    ELSIF v_job.schedule LIKE '%* * *' THEN
      v_max_age := INTERVAL '28 hours';
    ELSE
      v_max_age := INTERVAL '8 days';
    END IF;

    -- Get last run details
    SELECT d.end_time, d.status, d.return_message
    INTO v_last_run
    FROM cron.job_run_details d
    WHERE d.jobid = v_job.jobid
    ORDER BY d.start_time DESC
    LIMIT 1;

    v_is_healthy := TRUE;
    v_msg := NULL;

    IF v_last_run.end_time IS NULL THEN
      -- Job never ran or got stuck indefinitely
      v_is_healthy := FALSE;
      v_msg := format('Tác vụ tự động "%s" chưa từng chạy thành công hoặc bị treo.', v_job.jobname);
    ELSIF v_last_run.status <> 'succeeded' THEN
      v_is_healthy := FALSE;
      v_msg := format('Tác vụ tự động "%s" thất bại với trạng thái: %s. Chi tiết: %s',
                      v_job.jobname, v_last_run.status, COALESCE(v_last_run.return_message, 'Không có'));
    ELSIF v_last_run.end_time < (now() - v_max_age) THEN
      v_is_healthy := FALSE;
      v_msg := format('Tác vụ tự động "%s" không chạy trong vòng %s qua (lần cuối chạy: %s).',
                      v_job.jobname, v_max_age::text, v_last_run.end_time::text);
    END IF;

    IF NOT v_is_healthy THEN
      -- Dedup key to re-nag every 6h per failing job
      v_dedup_key := format('cron_health:%s:%s', v_job.jobname, floor(extract(epoch from now()) / 21600)::text);

      INSERT INTO public.notifications (
        tenant_id,
        target_branch_id,
        severity,
        kind,
        dedup_key,
        target_roles,
        meta
      ) VALUES (
        1,
        NULL,
        'critical',
        'system.cron_failed',
        v_dedup_key,
        ARRAY['owner', 'admin']::text[],
        jsonb_build_object(
          'job_name', v_job.jobname,
          'schedule', v_job.schedule,
          'error_message', v_msg,
          'last_run_at', v_last_run.end_time,
          'status', v_last_run.status
        )
      ) ON CONFLICT (tenant_id, dedup_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 6. Reschedule cron jobs (cleanup dead MVs refresh, run health check)
-- Remove stale cron refresh-finance-views-daily since it was only daily, and get_revenue_rollup is live.
-- Keep hourly baseline/alert scans.
SELECT cron.unschedule('refresh-finance-views-daily');

-- Upsert monitoring job scheduled every 30 minutes
SELECT cron.schedule('check_cron_jobs_health_job', '*/30 * * * *', 'SELECT public.check_cron_jobs_health();');

-- Update refresh_mv_inventory_stock_current cron to use public.refresh_inventory_dashboard RPC which updates log
SELECT cron.schedule('refresh_mv_inventory_stock_current', '*/15 * * * *', 'SET LOCAL statement_timeout = ''2min''; SELECT public.refresh_inventory_dashboard();');
