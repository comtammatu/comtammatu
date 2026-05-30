-- =============================================================
-- P0 SECURITY FIX — view security_invoker để RLS enforce đúng
--
-- Vấn đề: view `printer_agent_status` được tạo từ migration
-- 20260425150000_printer_agent_transport.sql với owner=postgres và
-- KHÔNG có `WITH (security_invoker = true)`. Mặc định PG đánh giá RLS
-- của underlying tables theo quyền của VIEW OWNER, không phải của caller.
-- Owner=postgres → BYPASS RLS hoàn toàn → bất kỳ authenticated user nào
-- query view cũng đọc được TẤT CẢ rows trong `printer_agents` (cross-
-- tenant + cross-branch leak).
--
-- Hiện tại dự án chỉ có 1 tenant nên leak NGANG branch (vd cashier
-- branch 1 đọc được agents branch 2). Khi onboard tenant 2 sẽ thành
-- cross-tenant. Audit/PDPA-compliance cũng flag được.
--
-- 4 surface UI dùng view (verified):
--   - admin/settings/printers/page.tsx (manager — vẫn thấy all qua RLS)
--   - admin/settings/printers/jobs/page.tsx (manager — vẫn thấy all)
--   - br/[branchId]/pos/printer-status-badge.tsx (cashier — đã .eq branch)
--   - br/[branchId]/settings/printers/page.tsx (branch_manager — đã .eq)
-- → Sau fix: defense-in-depth khớp với client-side .eq, không break UI.
--
-- Underlying `printer_agents.printer_agents_select` policy đã đúng:
--   tenant_id = auth_tenant_id()
--   AND (branch_id = auth_branch_id()
--        OR auth_role() IN ('owner', 'super_manager', 'area_manager'))
--
-- Cách fix: ALTER VIEW (không DROP+CREATE) — instant, idempotent, zero
-- downtime, không invalidate prepared plans, không cần regen TS types.
-- =============================================================

ALTER VIEW public.printer_agent_status SET (security_invoker = true);

COMMENT ON VIEW public.printer_agent_status IS
  'Printer agent fleet status (online flag = last_seen_at within 60s). '
  'security_invoker=true so RLS on underlying printer_agents enforces '
  'per-caller (tenant + branch + manager-role check). Defense-in-depth '
  'matches client-side .eq("branch_id") in br/[branchId]/* surfaces.';
