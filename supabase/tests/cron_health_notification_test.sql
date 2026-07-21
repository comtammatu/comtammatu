-- Run against a non-production database with active migrations and dev seed.
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

  PERFORM public.check_cron_jobs_health();

  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE dedup_key LIKE 'cron_health:test-cron-health-notification:%'
      AND kind = 'system.cron_failed'
      AND severity = 'critical'
      AND title = 'Tác vụ tự động cần kiểm tra'
      AND body LIKE '%test-cron-health-notification%'
      AND target_roles = ARRAY['owner']::text[]
  ) THEN
    RAISE EXCEPTION 'cron health notification contract mismatch';
  END IF;

  SELECT pg_get_functiondef('public.check_cron_jobs_health()'::regprocedure)
  INTO v_definition;

  IF v_definition NOT LIKE '%SET search_path TO ''''%'
    OR has_function_privilege('anon', 'public.check_cron_jobs_health()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.check_cron_jobs_health()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.check_cron_jobs_health()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'cron health function security contract mismatch';
  END IF;
END;
$$;

ROLLBACK;
