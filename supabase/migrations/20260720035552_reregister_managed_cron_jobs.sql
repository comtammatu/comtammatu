BEGIN;

CREATE TABLE IF NOT EXISTS private.cron_job_health_grace (
  jobid bigint PRIMARY KEY,
  registered_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.cron_job_health_grace FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_cron_jobs_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job RECORD;
  v_last_run RECORD;
  v_max_age INTERVAL;
  v_registered_at TIMESTAMPTZ;
  v_is_healthy BOOLEAN;
  v_dedup_key TEXT;
  v_msg TEXT;
BEGIN
  DELETE FROM private.cron_job_health_grace g
  WHERE NOT EXISTS (
    SELECT 1
    FROM cron.job j
    WHERE j.jobid = g.jobid
  );

  FOR v_job IN
    SELECT jobid, jobname, schedule
    FROM cron.job
  LOOP
    IF v_job.jobname = 'check_cron_jobs_health_job' THEN
      CONTINUE;
    END IF;

    IF v_job.schedule LIKE '*/15%' THEN
      v_max_age := INTERVAL '45 minutes';
    ELSIF v_job.schedule LIKE '%* * * *' AND v_job.schedule NOT LIKE '*/%' THEN
      v_max_age := INTERVAL '90 minutes';
    ELSIF v_job.schedule LIKE '%* * *' THEN
      v_max_age := INTERVAL '28 hours';
    ELSE
      v_max_age := INTERVAL '8 days';
    END IF;

    SELECT d.start_time, d.end_time, d.status, d.return_message
    INTO v_last_run
    FROM cron.job_run_details d
    WHERE d.jobid = v_job.jobid
    ORDER BY d.start_time DESC
    LIMIT 1;

    SELECT g.registered_at
    INTO v_registered_at
    FROM private.cron_job_health_grace g
    WHERE g.jobid = v_job.jobid;

    v_is_healthy := TRUE;
    v_msg := NULL;

    IF v_last_run.start_time IS NULL THEN
      IF v_registered_at IS NOT NULL
         AND now() < v_registered_at + v_max_age THEN
        CONTINUE;
      END IF;

      v_is_healthy := FALSE;
      v_msg := format(
        'Tác vụ tự động "%s" chưa từng chạy thành công hoặc bị treo.',
        v_job.jobname
      );
    ELSIF v_last_run.end_time IS NULL THEN
      IF v_last_run.start_time >= now() - v_max_age THEN
        CONTINUE;
      END IF;

      v_is_healthy := FALSE;
      v_msg := format(
        'Tác vụ tự động "%s" bị treo từ %s với trạng thái: %s.',
        v_job.jobname,
        v_last_run.start_time::text,
        COALESCE(v_last_run.status, 'Không có')
      );
    ELSE
      DELETE FROM private.cron_job_health_grace
      WHERE jobid = v_job.jobid;

      IF v_last_run.status <> 'succeeded' THEN
        v_is_healthy := FALSE;
        v_msg := format(
          'Tác vụ tự động "%s" thất bại với trạng thái: %s. Chi tiết: %s',
          v_job.jobname,
          v_last_run.status,
          COALESCE(v_last_run.return_message, 'Không có')
        );
      ELSIF v_last_run.end_time < (now() - v_max_age) THEN
        v_is_healthy := FALSE;
        v_msg := format(
          'Tác vụ tự động "%s" không chạy trong vòng %s qua (lần cuối chạy: %s).',
          v_job.jobname,
          v_max_age::text,
          v_last_run.end_time::text
        );
      END IF;
    END IF;

    IF NOT v_is_healthy THEN
      v_dedup_key := format(
        'cron_health:%s:%s',
        v_job.jobname,
        floor(extract(epoch from now()) / 21600)::text
      );

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
      ) ON CONFLICT (tenant_id, dedup_key)
        WHERE dedup_key IS NOT NULL
        DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_cron_jobs_health()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_jobs_health() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders LIMIT 1) THEN
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'auto_close_periods',
    'check_cron_jobs_health_job',
    'cleanup-abandoned-payments',
    'compute_branch_daily_waste_caps',
    'refresh_abc_classification',
    'refresh_mv_inventory_stock_current',
    'scan-inventory-alerts-daily',
    'weekly_grn_override_report',
    'weekly_waste_report',
    'refresh_mv_grn_price_baseline',
    'refresh-finance-views-daily'
  );

  PERFORM cron.schedule('auto_close_periods',                 '0 19 * * *',    'SELECT public.auto_close_periods();');
  PERFORM cron.schedule('check_cron_jobs_health_job',          '*/30 * * * *', 'SELECT public.check_cron_jobs_health();');
  PERFORM cron.schedule('cleanup-abandoned-payments',          '0 * * * *',    'SELECT public.cleanup_abandoned_payments()');
  PERFORM cron.schedule('compute_branch_daily_waste_caps',     '30 17 * * *',  'SELECT public.compute_branch_daily_waste_caps();');
  PERFORM cron.schedule('refresh_abc_classification',          '0 19 * * 6',   'SELECT public.refresh_abc_classification();');
  PERFORM cron.schedule('refresh_mv_inventory_stock_current',  '*/15 * * * *', 'SET LOCAL statement_timeout = ''2min''; SELECT public.refresh_inventory_dashboard();');
  PERFORM cron.schedule('scan-inventory-alerts-daily',         '0 23 * * *',   'SELECT public.scan_inventory_alerts();');
  PERFORM cron.schedule('weekly_grn_override_report',          '0 2 * * 5',    'SELECT public.weekly_grn_override_report();');
  PERFORM cron.schedule('weekly_waste_report',                 '0 2 * * 1',    'SELECT public.weekly_waste_report();');

  INSERT INTO private.cron_job_health_grace (jobid, registered_at)
  SELECT jobid, now()
  FROM cron.job
  WHERE jobname IN (
    'auto_close_periods',
    'cleanup-abandoned-payments',
    'compute_branch_daily_waste_caps',
    'refresh_abc_classification',
    'refresh_mv_inventory_stock_current',
    'scan-inventory-alerts-daily',
    'weekly_grn_override_report',
    'weekly_waste_report'
  )
  ON CONFLICT (jobid) DO UPDATE
  SET registered_at = EXCLUDED.registered_at;

  PERFORM pg_reload_conf();
END;
$$;

COMMIT;
