-- Revoke PUBLIC/anon EXECUTE default on branch revenue target RPCs/table
-- after Greenfield apply of branch_revenue_targets.

REVOKE ALL ON TABLE public.branch_revenue_targets FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_revenue_targets TO authenticated;
GRANT ALL ON TABLE public.branch_revenue_targets TO service_role;

REVOKE ALL ON SEQUENCE public.branch_revenue_targets_id_seq FROM PUBLIC, anon;
GRANT USAGE, SELECT ON SEQUENCE public.branch_revenue_targets_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.branch_revenue_targets_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.list_branch_revenue_targets(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_branch_revenue_targets(date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_branch_revenue_target_progress(bigint, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_branch_revenue_target_progress(date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_branch_revenue_targets(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_branch_revenue_targets(date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_branch_revenue_target_progress(bigint, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_branch_revenue_target_progress(date) TO authenticated, service_role;
