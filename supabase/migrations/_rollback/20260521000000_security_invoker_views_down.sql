-- Rollback for 20260521000000_security_invoker_views.sql
-- Disable security_invoker — view trở lại trạng thái leak cross-branch.
-- Chỉ apply nếu fix gây regression không lường trước (vd 1 service-role
-- background job bị block do RLS chặt hơn — extremely unlikely vì
-- service_role bypass RLS regardless).
ALTER VIEW public.printer_agent_status SET (security_invoker = false);
