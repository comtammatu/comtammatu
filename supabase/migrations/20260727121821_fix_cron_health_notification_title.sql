-- Restore check_cron_jobs_health notification contract after
-- 20260727120004_reregister_managed_cron_jobs dropped required title/body
-- (Postgres 23502 NOT NULL on notifications.title) and weakened search_path /
-- target_roles relative to the baseline + 20260721160235 fix.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_cron_jobs_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
        title,
        body,
        dedup_key,
        target_roles,
        meta
      ) VALUES (
        1,
        NULL,
        'critical',
        'system.cron_failed',
        'Tác vụ tự động cần kiểm tra',
        v_msg,
        v_dedup_key,
        ARRAY['owner']::text[],
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

REVOKE ALL ON FUNCTION public.check_cron_jobs_health()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_jobs_health() TO service_role;

COMMIT;
