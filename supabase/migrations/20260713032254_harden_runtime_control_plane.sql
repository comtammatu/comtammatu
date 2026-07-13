BEGIN;

SET LOCAL lock_timeout = '5s';
SET search_path TO '';

CREATE TABLE private.cron_health_observations (
  jobid bigint PRIMARY KEY,
  jobname text NOT NULL,
  observed_runid bigint,
  observed_status text,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.cron_health_observations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_branch_ops(p_branch_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.branches b
    JOIN public.profiles pr
      ON pr.id = auth.uid()
     AND pr.tenant_id = b.tenant_id
    WHERE b.id = p_branch_id
      AND b.tenant_id = public.auth_tenant_id()
      AND b.is_active
      AND pr.is_active IS TRUE
      AND (
        pr.branch_id = p_branch_id
        OR public.auth_is_owner(pr.id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_branch_ops(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_branch_ops(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_read_branch_ops(bigint) IS
  'Authorizes private branch operations topics for active branch members and tenant owners.';

CREATE OR REPLACE FUNCTION public.check_cron_jobs_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job record;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_status text;
  v_runid bigint;
  v_return_message text;
  v_max_age interval;
  v_first_observed_at timestamptz;
  v_message text;
  v_dedup_key text;
  v_tenant_id bigint;
BEGIN
  SELECT t.id
  INTO v_tenant_id
  FROM public.tenants t
  ORDER BY t.id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM private.cron_health_observations o
  WHERE NOT EXISTS (
    SELECT 1
    FROM cron.job j
    WHERE j.jobid = o.jobid
      AND j.active
  );

  FOR v_job IN
    SELECT j.jobid, j.jobname, j.schedule
    FROM cron.job j
    WHERE j.active
  LOOP
    CONTINUE WHEN v_job.jobname = 'check_cron_jobs_health_job';

    v_max_age := CASE v_job.jobname
      WHEN 'refresh_mv_inventory_stock_current' THEN interval '45 minutes'
      WHEN 'cleanup-abandoned-payments' THEN interval '90 minutes'
      WHEN 'auto_close_periods' THEN interval '28 hours'
      WHEN 'compute_branch_daily_waste_caps' THEN interval '28 hours'
      WHEN 'scan-inventory-alerts-daily' THEN interval '28 hours'
      WHEN 'refresh_abc_classification' THEN interval '8 days'
      WHEN 'weekly_grn_override_report' THEN interval '8 days'
      WHEN 'weekly_waste_report' THEN interval '8 days'
      ELSE NULL
    END;
    CONTINUE WHEN v_max_age IS NULL;

    v_started_at := NULL;
    v_ended_at := NULL;
    v_status := NULL;
    v_runid := NULL;
    v_return_message := NULL;

    SELECT d.runid, d.start_time, d.end_time, d.status, d.return_message
    INTO v_runid, v_started_at, v_ended_at, v_status, v_return_message
    FROM cron.job_run_details d
    WHERE d.jobid = v_job.jobid
    ORDER BY d.runid DESC
    LIMIT 1;

    INSERT INTO private.cron_health_observations (
      jobid,
      jobname,
      observed_runid,
      observed_status
    )
    VALUES (
      v_job.jobid,
      v_job.jobname,
      v_runid,
      v_status
    )
    ON CONFLICT (jobid) DO UPDATE
    SET jobname = EXCLUDED.jobname,
        observed_runid = EXCLUDED.observed_runid,
        observed_status = EXCLUDED.observed_status,
        first_observed_at = CASE
          WHEN private.cron_health_observations.observed_runid
                 IS NOT DISTINCT FROM EXCLUDED.observed_runid
           AND private.cron_health_observations.observed_status
                 IS NOT DISTINCT FROM EXCLUDED.observed_status
          THEN private.cron_health_observations.first_observed_at
          ELSE now()
        END,
        last_observed_at = now()
    RETURNING first_observed_at INTO v_first_observed_at;

    v_message := NULL;

    IF v_status IS NULL THEN
      IF v_first_observed_at < now() - v_max_age THEN
        v_message := format(
          'Tác vụ tự động "%s" chưa ghi nhận lần chạy nào trong vòng %s.',
          v_job.jobname,
          v_max_age
        );
      END IF;
    ELSIF v_status IN ('starting', 'connecting', 'sending') THEN
      IF COALESCE(v_started_at, v_first_observed_at) < now() - v_max_age THEN
        v_message := format(
          'Tác vụ tự động "%s" bị kẹt ở trạng thái %s từ %s.',
          v_job.jobname,
          v_status,
          COALESCE(v_started_at, v_first_observed_at)
        );
      END IF;
    ELSIF v_status = 'running' THEN
      IF COALESCE(v_started_at, v_first_observed_at) < now() - v_max_age THEN
        v_message := format(
          'Tác vụ tự động "%s" bị treo từ %s.',
          v_job.jobname,
          COALESCE(v_started_at, v_first_observed_at)
        );
      END IF;
    ELSIF v_status <> 'succeeded' THEN
      v_message := format(
        'Tác vụ tự động "%s" thất bại với trạng thái: %s. Chi tiết: %s',
        v_job.jobname,
        COALESCE(v_status, 'unknown'),
        COALESCE(v_return_message, 'Không có')
      );
    ELSIF COALESCE(v_ended_at, v_started_at, v_first_observed_at)
       < now() - v_max_age THEN
      v_message := format(
        'Tác vụ tự động "%s" không chạy trong vòng %s qua.',
        v_job.jobname,
        v_max_age
      );
    END IF;

    IF v_message IS NOT NULL THEN
      v_dedup_key := format(
        'cron_health:%s:%s',
        v_job.jobname,
        floor(extract(epoch FROM now()) / 21600)::text
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
      )
      VALUES (
        v_tenant_id,
        NULL,
        'critical',
        'system.cron_failed',
        format('Tác vụ tự động "%s" cần kiểm tra', v_job.jobname),
        v_message,
        v_dedup_key,
        ARRAY['owner']::text[],
        jsonb_build_object(
          'job_name', v_job.jobname,
          'schedule', v_job.schedule,
          'error_message', v_message,
          'last_run_at', COALESCE(v_ended_at, v_started_at),
          'status', v_status
        )
      )
      ON CONFLICT (tenant_id, dedup_key)
        WHERE dedup_key IS NOT NULL
      DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.check_cron_jobs_health()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_jobs_health()
  TO service_role;

REVOKE ALL ON public.mv_inventory_stock_current FROM anon, authenticated;
GRANT ALL ON public.mv_inventory_stock_current TO service_role;

ALTER TABLE public.webhook_events REPLICA IDENTITY FULL;

COMMIT;
