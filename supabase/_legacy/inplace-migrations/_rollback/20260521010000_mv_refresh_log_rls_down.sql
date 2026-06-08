-- Rollback for 20260521010000_mv_refresh_log_rls.sql
-- Disable RLS + drop policy. Bảng trở lại tình trạng RLS-disabled-in-public.
-- Chỉ apply nếu finance UI staleness banner break sau migration.
DROP POLICY IF EXISTS mv_refresh_log_authenticated_read ON public.mv_refresh_log;
ALTER TABLE public.mv_refresh_log DISABLE ROW LEVEL SECURITY;
