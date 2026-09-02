-- Product rule: Owner notifications are operational work items and reports,
-- not database / deploy / code health. Stop pg_cron health from writing the
-- Owner feed and remove existing infra noise.

-- Keep the RPC as a no-op so any leftover schedule or manual call is harmless.
CREATE OR REPLACE FUNCTION public.check_cron_jobs_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.check_cron_jobs_health()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_jobs_health() TO service_role;

-- Unschedule the watcher itself.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'check_cron_jobs_health_job'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END;
$$;

-- Drop leftover grace rows for the retired watcher.
DELETE FROM private.cron_job_health_grace AS grace
WHERE NOT EXISTS (
  SELECT 1
  FROM cron.job AS job
  WHERE job.jobid = grace.jobid
);

-- Purge infra notifications already delivered into the Owner feed.
DELETE FROM public.notification_reads AS reads
USING public.notifications AS note
WHERE reads.notification_id = note.id
  AND note.kind = 'system.cron_failed';

DELETE FROM public.notifications AS note
WHERE note.kind = 'system.cron_failed';
