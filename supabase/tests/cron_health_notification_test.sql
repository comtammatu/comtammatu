-- After remove_cron_health_owner_notifications: health RPC must not write
-- Owner notifications. Infra stays out of the operational feed.
\set ON_ERROR_STOP on

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'cron-health-test@example.invalid'
)
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = origin;

INSERT INTO public.tenants (id, name, slug, owner_user_id)
OVERRIDING SYSTEM VALUE
VALUES (
  1,
  'Cron health test',
  'cron-health-test',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_job_id bigint;
  v_definition text;
  v_before bigint;
  v_after bigint;
BEGIN
  SELECT cron.schedule(
    'test-cron-health-notification',
    '0 0 1 1 *',
    'SELECT 1'
  ) INTO v_job_id;

  INSERT INTO private.cron_job_health_grace (jobid, registered_at)
  VALUES (v_job_id, now() - interval '9 days')
  ON CONFLICT (jobid) DO UPDATE
  SET registered_at = EXCLUDED.registered_at;

  SELECT count(*) INTO v_before FROM public.notifications;

  PERFORM public.check_cron_jobs_health();

  SELECT count(*) INTO v_after FROM public.notifications;

  IF v_after <> v_before THEN
    RAISE EXCEPTION 'cron health must not insert Owner notifications';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE kind = 'system.cron_failed'
  ) THEN
    RAISE EXCEPTION 'system.cron_failed rows must not exist after health call';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'check_cron_jobs_health_job'
  ) THEN
    RAISE EXCEPTION 'check_cron_jobs_health_job must remain unscheduled';
  END IF;

  SELECT pg_get_functiondef('public.check_cron_jobs_health()'::regprocedure)
  INTO v_definition;

  IF v_definition LIKE '%system.cron_failed%'
    OR v_definition NOT LIKE '%SET search_path TO ''''%'
    OR has_function_privilege('anon', 'public.check_cron_jobs_health()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.check_cron_jobs_health()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.check_cron_jobs_health()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'cron health function security / no-op contract mismatch';
  END IF;

  PERFORM cron.unschedule(v_job_id);
END;
$$;

ROLLBACK;
