-- CI-ONLY tenant/branch/position/role-template bootstrap.
-- The base dataset (tenant comtammatu, branches, positions, role_templates)
-- historically lived in archived migrations below the consolidated baseline,
-- which is schema-only. The CI QA-user fixture assumes this data already exists
-- (it looks up tenant slug 'comtammatu' and the two CI branches below).
-- This file recreates the minimal prerequisites,
-- with values mirrored from prod (read-only) where applicable. Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The on_auth_user_created trigger lives on auth.users (excluded from the
-- public-schema baseline dump), so it is absent on a fresh local DB. Without it
-- handle_new_user() never fires and seed.sql's auth users get no profile row.
-- Recreate it here. handle_new_user() itself is in the baseline (public schema).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

BEGIN;

-- The on_auth_user_created trigger calls handle_new_user(), which needs the
-- tenant + positions to already exist. We need a keeper auth user first to
-- satisfy tenants.owner_user_id (NOT NULL FK -> auth.users). auth.users is
-- owned by supabase_auth_admin, so we can't ALTER ... DISABLE TRIGGER as the
-- seed role; session_replication_role = replica suppresses user triggers for
-- this transaction (the seed role on local is the superuser postgres). We
-- hand-build the keeper user + tenant + catalog + keeper profile, then restore
-- so seed.sql's other users flow through handle_new_user normally.
SET LOCAL session_replication_role = replica;

-- 1) Keeper auth user (tenant owner). seed.sql keeps this user and rotates its
--    password idempotently later.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000002-0000-4000-8000-000000000002'::uuid,
  'authenticated', 'authenticated',
  'keeper@comtammatu.vn',
  extensions.crypt('Test1234!', extensions.gen_salt('bf')),
  now(),
  jsonb_build_object(
    'provider', 'email',
    'providers', jsonb_build_array('email'),
    'full_name', 'Owner (keeper)'
  ),
  jsonb_build_object('full_name', 'Owner (keeper)'),
  now(), now(), '', '', '', '', false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
SELECT gen_random_uuid(), 'a0000002-0000-4000-8000-000000000002'::uuid,
  jsonb_build_object('sub', 'a0000002-0000-4000-8000-000000000002', 'email', 'keeper@comtammatu.vn'),
  'email', 'keeper@comtammatu.vn', now(), now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i
  WHERE i.user_id = 'a0000002-0000-4000-8000-000000000002'::uuid AND i.provider = 'email'
);

-- 2) Tenant. id is GENERATED ALWAYS AS IDENTITY; on a fresh DB the first tenant
--    gets id 1, matching prod / app expectations.
INSERT INTO public.tenants (name, slug, legal_name, owner_user_id, settings)
VALUES (
  'Cơm Tấm Má Tư', 'comtammatu', 'CÔNG TY CỔ PHẦN CHÉN SỨ',
  'a0000002-0000-4000-8000-000000000002'::uuid, '{}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- 3) Branches. Names match the QA-user fixture lookups.
INSERT INTO public.branches (tenant_id, name, address, code, branch_kind, is_active)
SELECT t.id, v.name, v.address, v.code, 'branch', true
FROM public.tenants t
CROSS JOIN (VALUES
  ('Chi nhánh Nguyễn Hữu Thọ', 'Đường Nguyễn Hữu Thọ, TP.HCM', 'NHT'),
  ('Chi nhánh QA', 'Dữ liệu kiểm thử CI', 'QA')
) AS v(name, address, code)
WHERE t.slug = 'comtammatu'
  AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.tenant_id = t.id AND b.name = v.name
  );

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT branch.tenant_id, branch.id
    FROM public.branches AS branch
    JOIN public.tenants AS tenant ON tenant.id = branch.tenant_id
    WHERE tenant.slug = 'comtammatu'
      AND branch.is_active
  LOOP
    PERFORM public.ensure_branch_inventory_location_defaults(r.tenant_id, r.id);
  END LOOP;
END;
$$;

INSERT INTO public.suppliers (tenant_id, name, is_active)
SELECT tenant.id, 'Nhà cung cấp QA', TRUE
FROM public.tenants AS tenant
WHERE tenant.slug = 'comtammatu'
  AND NOT EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    WHERE supplier.tenant_id = tenant.id
      AND supplier.name = 'Nhà cung cấp QA'
  );

INSERT INTO public.units (tenant_id, code, name, is_active)
SELECT tenant.id, 'kg', 'Kilôgam', TRUE
FROM public.tenants AS tenant
WHERE tenant.slug = 'comtammatu'
ON CONFLICT (code, tenant_id) DO UPDATE SET is_active = TRUE;

INSERT INTO public.ingredients (
  tenant_id, name, sku, item_kind, is_active,
  receipt_unit_id, issue_unit_id, production_unit_id
)
SELECT
  tenant.id, 'Nguyên liệu QA', 'QA-INGREDIENT', 'raw_material', TRUE,
  unit_row.id, unit_row.id, unit_row.id
FROM public.tenants AS tenant
JOIN public.units AS unit_row
  ON unit_row.tenant_id = tenant.id
 AND unit_row.code = 'kg'
WHERE tenant.slug = 'comtammatu'
ON CONFLICT (sku, tenant_id) DO UPDATE SET
  is_active = TRUE,
  receipt_unit_id = EXCLUDED.receipt_unit_id,
  issue_unit_id = EXCLUDED.issue_unit_id,
  production_unit_id = EXCLUDED.production_unit_id;

INSERT INTO public.ingredient_units (
  tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active
)
SELECT tenant.id, ingredient.id, unit_row.id, 1, TRUE, TRUE
FROM public.tenants AS tenant
JOIN public.ingredients AS ingredient
  ON ingredient.tenant_id = tenant.id
 AND ingredient.sku = 'QA-INGREDIENT'
JOIN public.units AS unit_row
  ON unit_row.tenant_id = tenant.id
 AND unit_row.code = 'kg'
WHERE tenant.slug = 'comtammatu'
ON CONFLICT (ingredient_id, unit_id, tenant_id) DO UPDATE SET
  to_base_factor = 1,
  is_base = TRUE,
  is_active = TRUE;

INSERT INTO public.stock_levels (
  tenant_id, branch_id, ingredient_id, location_id,
  current_quantity, avg_unit_cost
)
SELECT
  tenant.id, location.branch_id, ingredient.id, location.id,
  100, 10000
FROM public.tenants AS tenant
JOIN public.ingredients AS ingredient
  ON ingredient.tenant_id = tenant.id
 AND ingredient.sku = 'QA-INGREDIENT'
JOIN public.inventory_locations AS location
  ON location.tenant_id = tenant.id
 AND location.location_kind = 'warehouse'
 AND location.is_active
WHERE tenant.slug = 'comtammatu'
ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id) DO UPDATE SET
  current_quantity = EXCLUDED.current_quantity,
  avg_unit_cost = EXCLUDED.avg_unit_cost;

-- 4) Positions (mirrored from prod; default_checklist_template_id NULLed because
--    checklist templates are not part of this minimal local seed).
INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active, is_system)
SELECT t.id, v.code, v.label_vi, v.label_en, true, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('owner',             'Chủ sở hữu',            'Owner'),
  ('accountant',        'Kế toán',               'Accountant'),
  ('central_supply_ops','Quản lý kho Tổng',      'Central Supply Ops'),
  ('central_kitchen_lead','Bếp trưởng Bếp TT',   'Central Kitchen Lead'),
  ('branch_manager',    'Quản lý chi nhánh',     'Branch Manager'),
  ('kitchen_counter',   'Quầy lên món',          'Kitchen Counter'),
  ('chef',              'Bếp',                   'Chef'),
  ('kitchen_helper',    'Phụ bếp',               'Kitchen Helper'),
  ('grill_counter',     'Quầy nướng',            'Grill Counter'),
  ('waiter',            'Phục vụ',               'Waiter'),
  ('cleaner',           'Tạp vụ',                'Cleaner'),
  ('guard',             'Bảo vệ',                'Guard'),
  ('cashier',           'Thu ngân (kiêm phục vụ)','Cashier / Service')
) AS v(code, label_vi, label_en)
WHERE t.slug = 'comtammatu'
ON CONFLICT (code, tenant_id) DO NOTHING;

-- 4b) permission_keys catalog (global reference data; staff_permissions FKs to
--     it). Mirrored verbatim from prod.
INSERT INTO public.permission_keys (key, module, description, scope)
VALUES
  ('accounting:period_close','accounting','Close an inventory cost period after valuation reconciliation.','tenant'),
  ('accounting:period_reopen','accounting','Reopen a hard-closed accounting period (audited, 2FA at app layer).','tenant'),
  ('crm:campaign_send','crm','Gửi chiến dịch marketing','tenant'),
  ('crm:read','crm','Xem dữ liệu khách hàng','either'),
  ('crm:write','crm','Sửa dữ liệu khách hàng','either'),
  ('dashboard:view','dashboard','Xem dashboard tổng quan','either'),
  ('self:access','me','Access personal work, schedule, leave, payslip, and profile surfaces','tenant'),
  ('finance:ap_pay','finance','Thanh toán công nợ NCC','tenant'),
  ('finance:expense_approve','finance','Duyệt chi phí','tenant'),
  ('finance:expense_create','finance','Tạo chi phí','either'),
  ('finance:payroll_approve','finance','Duyệt bảng lương (owner only)','tenant'),
  ('finance:payroll_calculate','finance','Tính lương','tenant'),
  ('finance:view','finance','Xem báo cáo tài chính','either'),
  ('hr:approve_checkout','hr','Duyệt kết ca nhân viên theo chi nhánh','branch'),
  ('hr:approve_leave_request','hr','Duyệt yêu cầu nghỉ phép theo chi nhánh','branch'),
  ('hr:assign_shift','hr','Phân ca làm việc theo tuần cho nhân viên tại chi nhánh hoặc Văn phòng','either'),
  ('hr:correct_attendance','hr','Correct attendance through an audited RPC','tenant'),
  ('hr:force_close_attendance','hr','Close stale attendance with an audited reason','either'),
  ('hr:manage_leave_policy','hr','Manage tenant leave and workday policy','tenant'),
  ('hr:manage_employee','hr','Sửa hồ sơ nhân sự','tenant'),
  ('hr:manage_position_tasks','hr','Manage position and employee shift task templates','tenant'),
  ('hr:manage_employee_shift_overrides','hr','Manage employee-specific shift task overrides at a branch','branch'),
  ('hr:manage_shift_catalog','hr','Manage the tenant shift catalog','tenant'),
  ('hr:payroll_prepare','hr','Prepare payroll previews and adjustments','tenant'),
  ('hr:payroll_snapshot','hr','Finalize one immutable payroll snapshot per period','tenant'),
  ('hr:request_leave','hr','Gửi yêu cầu nghỉ phép','branch'),
  ('hr:view_employee','hr','Xem hồ sơ nhân sự','tenant'),
  ('hr:view_sensitive_employee','hr','View employee identity, contract, bank, and salary data','tenant'),
  ('inventory:adjust_approve','inventory','Approve stock adjustments (reason correction / shrink).','branch'),
  ('inventory:count_approve','inventory','Duyệt phiếu đếm tồn và điều chỉnh kho','branch'),
  ('inventory:count_assign','inventory','Phân công nhân viên đếm tồn nguyên liệu','branch'),
  ('inventory:production_confirm','inventory','Xác nhận hoàn thành sản xuất','branch'),
  ('inventory:production_create','inventory','Tạo lệnh sản xuất','branch'),
  ('inventory:read','inventory','Xem tồn kho & nguyên liệu','either'),
  ('inventory:valuation_read','inventory','Owner-only WAC and inventory valuation through the protected monetary boundary.','tenant'),
  ('inventory:stocktake_complete','inventory','Chốt phiếu kiểm kho','branch'),
  ('inventory:stocktake_create','inventory','Tạo phiếu kiểm kho','branch'),
  ('inventory:stocktake_recount','inventory','Trigger stocktake recount rounds and escalate to round 4.','branch'),
  ('inventory:stocktake_unblind','inventory','Admin break-glass to view system_qty during blind stocktake.','tenant'),
  ('inventory:transfer_create','inventory','Tạo phiếu điều chuyển','branch'),
  ('inventory:request_create','inventory','Tạo phiếu yêu cầu hàng','branch'),
  ('inventory:request_submit','inventory','Gửi phiếu yêu cầu hàng','branch'),
  ('inventory:request_cancel','inventory','Hủy phiếu yêu cầu hàng','branch'),
  ('inventory:request_fulfill','inventory','Đáp ứng phiếu yêu cầu hàng','branch'),
  ('inventory:transfer_receive','inventory','Nhận kho điều chuyển','branch'),
  ('inventory:transfer_ship','inventory','Xuất kho điều chuyển','branch'),
  ('inventory:units_master','inventory','Quản lý danh mục đơn vị đo (chuẩn + đóng gói)','tenant'),
  ('inventory:waste_approve','inventory','Approve waste entries tier-2 (value >= 500k, shift_cap, or found_missing).','branch'),
  ('inventory:waste_bypass_photo','inventory','Admin-only: bypass mandatory waste photo (audited).','tenant'),
  ('inventory:write','inventory','Điều chỉnh tồn, đếm kho','branch'),
  ('inventory:writeoff','inventory','Xoá sổ hàng hết hạn/hỏng','branch'),
  ('kds:mark_ready','kds','Đánh dấu món ready','branch'),
  ('kds:recall','kds','Thu hồi món đã ready','branch'),
  ('kds:use','kds','Xem màn hình bếp','branch'),
  ('menu:manage_category','menu','Quản lý danh mục món','either'),
  ('menu:publish','menu','Đẩy giá áp dụng (publish)','either'),
  ('menu:read','menu','Xem thực đơn & giá','either'),
  ('menu:write','menu','Tạo/sửa món & giá','either'),
  ('orders:read','orders','Xem đơn hàng','either'),
  ('orders:refund','orders','Hoàn tiền','branch'),
  ('orders:refund_approve','orders','Phê duyệt yêu cầu hoàn tiền (giải phóng GL + tồn kho)','branch'),
  ('orders:void','orders','Huỷ đơn','branch'),
  ('orders:write','orders','Sửa đơn hàng','branch'),
  ('pos:apply_discount','pos','Áp giảm giá POS','branch'),
  ('pos:close_shift','pos','Đóng ca POS','branch'),
  ('pos:close_shift_variance_override','pos','Duyệt đóng ca khi chênh lệch tiền vượt ngưỡng','branch'),
  ('pos:confirm_payment','pos','Xác nhận thanh toán tiền mặt','branch'),
  ('pos:open_cashbox','pos','Mở két tiền','branch'),
  ('pos:print','pos','Tạo/tái in hoá đơn, huỷ hoặc thử lại tem in','branch'),
  ('pos:reprint_receipt','pos','In lại hoá đơn','branch'),
  ('pos:send_kitchen','pos','Gửi đơn xuống bếp (tạo tem bếp in tự động)','branch'),
  ('pos:use','pos','Sử dụng POS','branch'),
  ('pos:void_order','pos','Huỷ đơn POS','branch'),
  ('pos:void_paid_order','pos','Huỷ đơn đã thanh toán tại POS (hoàn tiền + huỷ HĐĐT); manager-gated','branch'),
  ('promo:issue','promotions','Phát hành mã voucher một lần','tenant'),
  ('promo:read','promotions','Xem chiến dịch khuyến mãi','tenant'),
  ('promo:write','promotions','Tạo/sửa chiến dịch khuyến mãi','tenant'),
  ('printer:manage','settings','Quản lý cấu hình máy in chi nhánh','branch'),
  ('procurement:grn_amend','inventory_procurement','Sửa trực tiếp dòng phiếu nhập đã chốt (Owner force-edit)','tenant'),
  ('procurement:grn_confirm','inventory_procurement','Xác nhận phiếu nhập kho','branch'),
  ('procurement:grn_create','inventory_procurement','Tạo phiếu nhập kho (GRN)','branch'),
  ('procurement:invoice_create','inventory_procurement','Tạo hoá đơn mua hàng','either'),
  ('procurement:invoice_match','inventory_procurement','Đối chiếu hoá đơn mua hàng','either'),
  ('procurement:po_approve','inventory_procurement','Duyệt đơn mua hàng','either'),
  ('procurement:po_create','inventory_procurement','Tạo đơn mua hàng (PO)','either'),
  ('procurement:request_manage','inventory_procurement','Tạo, sửa, gửi, hủy và đóng yêu cầu mua','branch'),
  ('procurement:price_list_read','procurement','Read purchase prices through the protected monetary boundary.','tenant'),
  ('procurement:price_list_write','procurement','Write supplier_price_list contract/quotation rows. grn_last is trigger-only.','tenant'),
  ('procurement:read','inventory_procurement','Xem đơn mua hàng & NCC','either'),
  ('procurement:supplier_manage','inventory_procurement','Quản lý NCC','tenant'),
  ('reports:export','reports','Xuất báo cáo','either'),
  ('reports:pit_export','reports','Xuất quyết toán TNCN','tenant'),
  ('reports:view_branch','reports','Xem báo cáo cấp chi nhánh','branch'),
  ('reports:view_tenant','reports','Xem báo cáo cấp tenant','tenant'),
  ('settings:branch','settings','Cấu hình chi nhánh (giờ, máy in...)','branch'),
  ('settings:branch_network','settings','Quản lý danh sách IP tin cậy của chi nhánh (cổng mạng POS/KDS)','branch'),
  ('settings:integrations','settings','Cấu hình tích hợp (HĐĐT, ngân hàng)','tenant'),
  ('settings:tenant','settings','Cấu hình tenant (pháp lý, MST)','tenant'),
  ('staff:assign_permission','staff','Gán/thu hồi quyền cho user','tenant'),
  ('staff:assign_position','staff','Gán chức vụ HR','tenant'),
  ('staff:manage','staff','CRUD nhân viên / ca / lịch','either'),
  ('staff:provision','staff','Create, lock, and restore staff accounts','tenant'),
  ('staff:view','staff','Xem danh sách nhân viên','either'),
  ('supplier_return:confirm','inventory_procurement','Xác nhận/gửi phiếu trả hàng NCC','branch'),
  ('supplier_return:create','inventory_procurement','Tạo phiếu trả hàng nhà cung cấp','branch'),
  ('supplier_return:read','inventory_procurement','Xem phiếu trả hàng nhà cung cấp','either'),
  ('feedback:view','feedback','Xem phản hồi khách hàng','branch'),
  ('feedback:manage_qr','feedback','Tạo/xoay/vô hiệu hoá mã QR phản hồi','branch'),
  ('auth:audit_read','auth','Read authorization audit history','tenant'),
  ('auth:binding_manage','auth','Grant and revoke access role bindings','tenant'),
  ('auth:binding_read','auth','Read access role bindings','tenant')
ON CONFLICT (key) DO NOTHING;

UPDATE public.permission_keys
SET is_delegable_to_staff = key = ANY (ARRAY[
  'dashboard:view',
  'hr:approve_checkout',
  'hr:approve_leave_request',
  'hr:assign_shift',
  'hr:correct_attendance',
  'hr:force_close_attendance',
  'hr:manage_leave_policy',
  'hr:manage_position_tasks',
  'hr:manage_employee_shift_overrides',
  'hr:manage_shift_catalog',
  'hr:payroll_prepare',
  'hr:payroll_snapshot',
  'hr:request_leave',
  'hr:view_employee',
  'hr:view_sensitive_employee',
  'inventory:adjust_approve',
  'inventory:count_approve',
  'inventory:count_assign',
  'inventory:production_confirm',
  'inventory:production_create',
  'inventory:read',
  'inventory:request_cancel',
  'inventory:request_create',
  'inventory:request_fulfill',
  'inventory:request_submit',
  'inventory:valuation_read',
  'inventory:stocktake_complete',
  'inventory:stocktake_create',
  'inventory:stocktake_recount',
  'inventory:transfer_create',
  'inventory:transfer_receive',
  'inventory:transfer_ship',
  'inventory:waste_approve',
  'inventory:write',
  'inventory:writeoff',
  'kds:mark_ready',
  'kds:recall',
  'kds:use',
  'menu:read',
  'orders:read',
  'orders:void',
  'orders:write',
  'pos:apply_discount',
  'pos:close_shift',
  'pos:close_shift_variance_override',
  'pos:confirm_payment',
  'pos:open_cashbox',
  'pos:print',
  'pos:reprint_receipt',
  'pos:send_kitchen',
  'pos:use',
  'pos:void_order',
  'printer:manage',
  'procurement:grn_confirm',
  'procurement:grn_create',
  'procurement:invoice_create',
  'procurement:invoice_match',
  'procurement:po_approve',
  'procurement:po_create',
  'procurement:request_manage',
  'procurement:price_list_read',
  'procurement:read',
  'procurement:supplier_manage',
  'reports:export',
  'reports:view_branch',
  'settings:branch',
  'staff:provision',
  'staff:view',
  'supplier_return:confirm',
  'supplier_return:create',
  'supplier_return:read',
  'feedback:view',
  'feedback:manage_qr',
  'finance:view',
  'finance:expense_create',
  'finance:expense_approve',
  'finance:ap_pay',
  'auth:audit_read',
  'auth:binding_read'
]::text[]);

-- 5) Role templates (mirrored from prod permission_keys; one per position_code).
INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system)
SELECT t.id, v.name, v.position_code, v.permission_keys::text[], true
FROM public.tenants t
CROSS JOIN (VALUES
  ('cashier', 'cashier', ARRAY['hr:request_leave','orders:read','orders:void','orders:write','pos:close_shift','pos:confirm_payment','pos:open_cashbox','pos:print','pos:reprint_receipt','pos:send_kitchen','pos:use','pos:void_order']),
  ('chef', 'chef', ARRAY['hr:request_leave','kds:mark_ready','kds:use']),
  ('kitchen_counter', 'kitchen_counter', ARRAY['hr:request_leave','kds:mark_ready','kds:use']),
  ('kitchen_helper', 'kitchen_helper', ARRAY['hr:request_leave']),
  ('grill_counter', 'grill_counter', ARRAY['hr:request_leave']),
  ('waiter', 'waiter', ARRAY['hr:request_leave','orders:read','orders:write','pos:confirm_payment','pos:reprint_receipt','pos:send_kitchen','pos:use']),
  ('cleaner', 'cleaner', ARRAY['hr:request_leave']),
  ('guard', 'guard', ARRAY['hr:request_leave']),
  ('accountant', 'accountant', ARRAY['finance:ap_pay','finance:expense_approve','finance:expense_create','finance:view','procurement:invoice_create','procurement:invoice_match','procurement:po_approve','procurement:po_create','procurement:price_list_read','procurement:read']),
  ('central_supply_ops', 'central_supply_ops', ARRAY['hr:request_leave','inventory:count_approve','inventory:count_assign','inventory:read','inventory:request_fulfill','inventory:stocktake_complete','inventory:stocktake_create','inventory:stocktake_recount','inventory:transfer_create','inventory:transfer_receive','inventory:transfer_ship','inventory:waste_approve','inventory:write','inventory:writeoff','procurement:grn_confirm','procurement:grn_create','procurement:po_create','procurement:read','procurement:supplier_manage']),
  ('central_kitchen_lead', 'central_kitchen_lead', ARRAY['hr:request_leave','inventory:count_approve','inventory:count_assign','inventory:production_confirm','inventory:production_create','inventory:read','inventory:request_cancel','inventory:request_create','inventory:request_fulfill','inventory:request_submit','inventory:stocktake_complete','inventory:stocktake_create','inventory:stocktake_recount','inventory:transfer_create','inventory:transfer_receive','inventory:transfer_ship','inventory:waste_approve','inventory:write','inventory:writeoff','procurement:grn_confirm','procurement:grn_create','procurement:po_create','procurement:read','procurement:supplier_manage']),
  ('branch_manager', 'branch_manager', ARRAY['dashboard:view','feedback:manage_qr','feedback:view','hr:approve_checkout','hr:approve_leave_request','hr:assign_shift','hr:manage_employee_shift_overrides','hr:request_leave','hr:view_employee','inventory:adjust_approve','inventory:count_approve','inventory:count_assign','inventory:read','inventory:request_cancel','inventory:request_create','inventory:request_submit','inventory:stocktake_complete','inventory:stocktake_create','inventory:stocktake_recount','inventory:transfer_receive','inventory:waste_approve','inventory:write','inventory:writeoff','kds:mark_ready','kds:recall','kds:use','menu:read','orders:read','orders:void','orders:write','pos:apply_discount','pos:close_shift','pos:close_shift_variance_override','pos:confirm_payment','pos:open_cashbox','pos:print','pos:reprint_receipt','pos:send_kitchen','pos:use','pos:void_order','printer:manage','reports:export','reports:view_branch','settings:branch','staff:view']),
  ('owner', 'owner', ARRAY['accounting:period_close','accounting:period_reopen','crm:campaign_send','crm:read','crm:write','dashboard:view','feedback:manage_qr','feedback:view','finance:ap_pay','finance:expense_approve','finance:expense_create','finance:payroll_approve','finance:payroll_calculate','finance:view','hr:approve_leave_request','hr:approve_checkout','hr:manage_employee','hr:request_leave','hr:view_employee','inventory:adjust_approve','inventory:production_confirm','inventory:production_create','inventory:read','inventory:request_cancel','inventory:request_create','inventory:request_fulfill','inventory:request_submit','inventory:stocktake_complete','inventory:stocktake_create','inventory:stocktake_recount','inventory:stocktake_unblind','inventory:transfer_create','inventory:transfer_receive','inventory:transfer_ship','inventory:units_master','inventory:valuation_read','inventory:waste_approve','inventory:waste_bypass_photo','inventory:write','inventory:writeoff','kds:mark_ready','kds:recall','kds:use','menu:manage_category','menu:publish','menu:read','menu:write','orders:read','orders:refund','orders:refund_approve','orders:void','orders:write','pos:apply_discount','pos:close_shift','pos:close_shift_variance_override','pos:confirm_payment','pos:open_cashbox','pos:print','pos:reprint_receipt','pos:send_kitchen','pos:use','pos:void_order','printer:manage','procurement:grn_amend','procurement:grn_confirm','procurement:grn_create','procurement:invoice_create','procurement:invoice_match','procurement:po_approve','procurement:po_create','procurement:price_list_read','procurement:price_list_write','procurement:read','procurement:supplier_manage','promo:issue','promo:read','promo:write','reports:export','reports:pit_export','reports:view_branch','reports:view_tenant','settings:branch','settings:integrations','settings:tenant','staff:assign_permission','staff:assign_position','staff:manage','staff:view'])
) AS v(name, position_code, permission_keys)
WHERE t.slug = 'comtammatu'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_templates rt
    WHERE rt.tenant_id = t.id AND rt.position_code = v.position_code
  );

UPDATE public.role_templates
SET permission_keys = array_append(
  permission_keys,
  'procurement:request_manage'
)
WHERE position_code IN ('central_supply_ops', 'central_kitchen_lead')
  AND NOT ('procurement:request_manage' = ANY(permission_keys));

UPDATE public.role_templates
SET permission_keys = array_append(
  permission_keys,
  'procurement:po_create'
)
WHERE position_code IN ('central_supply_ops', 'central_kitchen_lead')
  AND NOT ('procurement:po_create' = ANY(permission_keys));

UPDATE public.role_templates
SET permission_keys = array_append(
  permission_keys,
  'hr:assign_shift'
)
WHERE position_code = 'branch_manager'
  AND NOT ('hr:assign_shift' = ANY(permission_keys));

UPDATE public.role_templates
SET permission_keys = array_append(
  permission_keys,
  'hr:manage_employee_shift_overrides'
)
WHERE position_code = 'branch_manager'
  AND NOT ('hr:manage_employee_shift_overrides' = ANY(permission_keys));

UPDATE public.role_templates template
SET permission_keys = ARRAY(
      SELECT permission.key
      FROM public.permission_keys permission
      ORDER BY permission.key
    ),
    updated_at = now()
FROM public.tenants tenant
WHERE template.tenant_id = tenant.id
  AND tenant.slug = 'comtammatu'
  AND template.position_code = 'owner';

-- 6) Keeper profile + employee (handle_new_user is disabled, so build manually).
INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
SELECT 'a0000002-0000-4000-8000-000000000002'::uuid, t.id,
  NULL::bigint,
  (SELECT po.id FROM public.positions po WHERE po.tenant_id = t.id AND po.code = 'owner' LIMIT 1),
  'Owner (keeper)'
FROM public.tenants t
WHERE t.slug = 'comtammatu'
ON CONFLICT (id) DO UPDATE
SET branch_id = NULL,
    position_id = EXCLUDED.position_id,
    is_active = true,
    updated_at = now();

INSERT INTO public.employees (tenant_id, profile_id, employee_code, is_active)
SELECT t.id, 'a0000002-0000-4000-8000-000000000002'::uuid, 'EMP-KEEPER', true
FROM public.tenants t
WHERE t.slug = 'comtammatu'
ON CONFLICT (tenant_id, profile_id) DO UPDATE SET is_active = true;

-- session_replication_role reverts automatically at COMMIT (SET LOCAL).
COMMIT;
