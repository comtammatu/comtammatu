-- =============================================================
-- P0 SECURITY FIX — RLS cho mv_refresh_log
--
-- Vấn đề: bảng `mv_refresh_log` (tạo trong 20260514010000) đã
-- `GRANT SELECT TO authenticated; REVOKE ALL FROM PUBLIC` nhưng KHÔNG
-- enable RLS — vi phạm rule "tables in public schema must have RLS".
-- Supabase advisor báo `rls_disabled_in_public` ERROR.
--
-- Schema bảng (verified live): 2 cột `view_name TEXT, refreshed_at
-- TIMESTAMPTZ`. KHÔNG có tenant_id/branch_id — đây là metadata global
-- về MV refresh cycle (cron job ghi, finance UI đọc làm staleness banner
-- "MV X refreshed Y minutes ago").
--
-- Data exposure: thấp (chỉ tên view + timestamp, không PII), nhưng vẫn
-- phải fix vì rule + future-proof khi thêm cột tenant.
--
-- Hướng fix: Option A — ENABLE RLS + policy `USING (true)`. Lý do:
--   - Data đã global, không scope tenant → policy USING(true) không leak gì.
--   - Pattern đã proven (tương tự `mv_grn_price_baseline` trong codebase).
--   - Schema-only change, KHÔNG cần coordinated UI deploy (Option B
--     wrapper RPC sẽ break finance UI nếu deploy lệch nhịp).
--   - WRITE đã do service_role qua refresh_finance_views() cron, bypass
--     RLS tự động.
--
-- Loại bỏ: REVOKE + RPC wrapper (Option B) — over-engineering, intent
-- không rõ hơn, mà còn add 1 RPC + UI refactor.
-- =============================================================

ALTER TABLE public.mv_refresh_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mv_refresh_log_authenticated_read ON public.mv_refresh_log;

CREATE POLICY mv_refresh_log_authenticated_read
  ON public.mv_refresh_log
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY mv_refresh_log_authenticated_read ON public.mv_refresh_log IS
  'Allow all authenticated reads. Table holds global MV refresh metadata '
  '(view_name + refreshed_at), no tenant scope, used by finance UI as '
  'staleness banner. WRITE happens via service_role-owned cron, bypasses RLS.';
