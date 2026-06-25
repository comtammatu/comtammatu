DROP POLICY IF EXISTS arl_select
ON public.archive_run_log;

REVOKE ALL ON TABLE public.archive_run_log
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.archive_run_log
TO service_role;

REVOKE ALL ON SEQUENCE public.archive_run_log_id_seq
FROM PUBLIC, anon, authenticated;

GRANT ALL ON SEQUENCE public.archive_run_log_id_seq
TO service_role;

DROP POLICY IF EXISTS rrl_select
ON public.reconcile_run_log;

REVOKE ALL ON TABLE public.reconcile_run_log
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.reconcile_run_log
TO service_role;

REVOKE ALL ON SEQUENCE public.reconcile_run_log_id_seq
FROM PUBLIC, anon, authenticated;

GRANT ALL ON SEQUENCE public.reconcile_run_log_id_seq
TO service_role;
