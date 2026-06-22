-- Branch Manager: quyền xem danh sách nhân viên chi nhánh.
--
-- RLS `employees_select` (và join lồng trong bảng chấm công/nghỉ phép) chỉ mở
-- qua `hr:view_employee`, nhưng role template của bucket branch_manager
-- (position `quan_ly_CN`) thiếu key này — Quản lý chi nhánh mở /hr chỉ đọc
-- được hồ sơ của chính mình và tab Chấm công mất tên nhân viên.
--
-- Data-only migration: bổ sung key vào template rồi backfill grant additive
-- (sync_missing_permissions_from_template chỉ INSERT ... ON CONFLICT DO NOTHING,
-- không thu hồi grant nào). Không nới `staff:view` vào employees_select vì bảng
-- employees chứa lương / CCCD / tài khoản ngân hàng.

BEGIN;

UPDATE public.role_templates rt
SET permission_keys = rt.permission_keys || ARRAY['hr:view_employee']
WHERE private.staff_role_from_position_code(rt.position_code) = 'branch_manager'
  AND NOT (rt.permission_keys @> ARRAY['hr:view_employee']);

SELECT public.sync_missing_permissions_from_template();

COMMIT;
