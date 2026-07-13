-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/runtime_control_plane_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_other_branch bigint;
  v_staff uuid;
  v_owner uuid;
  v_job record;
  v_failed_job bigint;
  v_running_job bigint;
  v_stale_running_job bigint;
  v_stale_succeeded_job bigint;
  v_transient_job bigint;
  v_no_history_job bigint;
  v_count integer;
BEGIN
  SELECT b.tenant_id, min(b.id), max(b.id)
  INTO v_tenant, v_branch, v_other_branch
  FROM public.branches b
  WHERE b.is_active
  GROUP BY b.tenant_id
  HAVING count(*) >= 2
  ORDER BY b.tenant_id
  LIMIT 1;

  SELECT pr.id
  INTO v_staff
  FROM public.profiles pr
  WHERE pr.tenant_id = v_tenant
    AND pr.branch_id = v_branch
    AND pr.is_active IS TRUE
    AND NOT public.auth_is_owner(pr.id)
  ORDER BY pr.id
  LIMIT 1;

  SELECT pr.id
  INTO v_owner
  FROM public.profiles pr
  WHERE pr.tenant_id = v_tenant
    AND pr.is_active IS TRUE
    AND public.auth_is_owner(pr.id)
  ORDER BY pr.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_branch = v_other_branch
     OR v_staff IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'Runtime control-plane test requires two branches, branch staff, and owner seed data';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_staff::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );
  IF NOT public.can_read_branch_ops(v_branch)
     OR public.can_read_branch_ops(v_other_branch) THEN
    RAISE EXCEPTION 'Branch staff escaped profile branch scope';
  END IF;

  UPDATE public.profiles SET is_active = false WHERE id = v_staff;
  IF public.can_read_branch_ops(v_branch) THEN
    RAISE EXCEPTION 'Inactive profile retained branch operations access';
  END IF;
  UPDATE public.profiles SET is_active = true WHERE id = v_staff;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );
  IF NOT public.can_read_branch_ops(v_branch)
     OR NOT public.can_read_branch_ops(v_other_branch) THEN
    RAISE EXCEPTION 'Owner lost tenant branch operations access';
  END IF;

  IF has_function_privilege('anon', 'public.can_read_branch_ops(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.can_read_branch_ops(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.can_read_branch_ops(bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.check_cron_jobs_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.check_cron_jobs_health()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.check_cron_jobs_health()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Runtime control-plane function grants are unsafe';
  END IF;

  IF has_table_privilege('anon', 'public.mv_inventory_stock_current', 'SELECT')
     OR has_table_privilege('authenticated', 'public.mv_inventory_stock_current', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.mv_inventory_stock_current', 'SELECT') THEN
    RAISE EXCEPTION 'Inventory materialized view grants are unsafe';
  END IF;

  DELETE FROM public.notifications
  WHERE dedup_key LIKE 'cron_health:%';

  FOR v_job IN
    SELECT j.jobname
    FROM cron.job j
    WHERE j.jobname = ANY (ARRAY[
      'refresh_mv_inventory_stock_current',
      'cleanup-abandoned-payments',
      'auto_close_periods',
      'compute_branch_daily_waste_caps',
      'scan-inventory-alerts-daily',
      'refresh_abc_classification',
      'weekly_grn_override_report',
      'weekly_waste_report'
    ]::text[])
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;

  v_failed_job := cron.schedule(
    'refresh_mv_inventory_stock_current',
    '*/15 * * * *',
    'SELECT 1'
  );
  INSERT INTO cron.job_run_details (
    runid, jobid, database, username, command, status,
    return_message, start_time, end_time
  ) VALUES (
    1000000000000000 + v_failed_job,
    v_failed_job, current_database(), current_user, 'SELECT 1', 'failed',
    'runtime test failure', now() - interval '1 minute', now()
  );

  v_running_job := cron.schedule(
    'cleanup-abandoned-payments',
    '0 * * * *',
    'SELECT 1'
  );
  INSERT INTO cron.job_run_details (
    runid, jobid, database, username, command, status,
    return_message, start_time, end_time
  ) VALUES (
    1000000000000000 + v_running_job,
    v_running_job, current_database(), current_user, 'SELECT 1', 'running',
    NULL, now(), NULL
  );

  v_stale_running_job := cron.schedule(
    'compute_branch_daily_waste_caps',
    '30 17 * * *',
    'SELECT 1'
  );
  INSERT INTO cron.job_run_details (
    runid, jobid, database, username, command, status,
    return_message, start_time, end_time
  ) VALUES (
    1000000000000000 + v_stale_running_job,
    v_stale_running_job, current_database(), current_user, 'SELECT 1', 'running',
    NULL, now() - interval '2 days', NULL
  );

  v_transient_job := cron.schedule(
    'scan-inventory-alerts-daily',
    '0 23 * * *',
    'SELECT 1'
  );
  INSERT INTO cron.job_run_details (
    runid, jobid, database, username, command, status,
    return_message, start_time, end_time
  ) VALUES (
    1000000000000000 + v_transient_job,
    v_transient_job, current_database(), current_user, 'SELECT 1', 'connecting',
    NULL, NULL, NULL
  );

  v_no_history_job := cron.schedule(
    'auto_close_periods',
    '0 19 * * *',
    'SELECT 1'
  );

  v_stale_succeeded_job := cron.schedule(
    'weekly_waste_report',
    '0 0 * * 1',
    'SELECT 1'
  );
  INSERT INTO cron.job_run_details (
    runid, jobid, database, username, command, status,
    return_message, start_time, end_time
  ) VALUES (
    1000000000000000 + v_stale_succeeded_job,
    v_stale_succeeded_job, current_database(), current_user, 'SELECT 1', 'succeeded',
    NULL, now() - interval '9 days', now() - interval '9 days'
  );

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.check_cron_jobs_health();

  SELECT count(*)
  INTO v_count
  FROM public.notifications n
  WHERE n.tenant_id = v_tenant
    AND n.dedup_key LIKE 'cron_health:refresh_mv_inventory_stock_current:%'
    AND n.title = 'Tác vụ tự động "refresh_mv_inventory_stock_current" cần kiểm tra'
    AND NULLIF(btrim(n.body), '') IS NOT NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Cron failed-job notification was not idempotent: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.tenant_id = v_tenant
      AND (n.dedup_key LIKE 'cron_health:cleanup-abandoned-payments:%'
       OR n.dedup_key LIKE 'cron_health:scan-inventory-alerts-daily:%'
       OR n.dedup_key LIKE 'cron_health:auto_close_periods:%')
  ) THEN
    RAISE EXCEPTION 'Cron health reported a fresh running, transient, or no-history job';
  END IF;

  UPDATE private.cron_health_observations
  SET first_observed_at = now() - interval '9 days'
  WHERE jobid IN (v_transient_job, v_no_history_job);

  PERFORM public.check_cron_jobs_health();
  PERFORM public.check_cron_jobs_health();

  SELECT count(*)
  INTO v_count
  FROM (VALUES
    ('refresh_mv_inventory_stock_current'),
    ('compute_branch_daily_waste_caps'),
    ('scan-inventory-alerts-daily'),
    ('auto_close_periods'),
    ('weekly_waste_report')
  ) AS expected(jobname)
  WHERE (
    SELECT count(*)
    FROM public.notifications n
    WHERE n.tenant_id = v_tenant
      AND n.dedup_key LIKE 'cron_health:' || expected.jobname || ':%'
      AND NULLIF(btrim(n.title), '') IS NOT NULL
      AND NULLIF(btrim(n.body), '') IS NOT NULL
  ) = 1;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Cron health did not cover every failed or stale state: %', v_count;
  END IF;
END;
$$;

ROLLBACK;
