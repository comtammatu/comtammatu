-- =============================================================
-- Auth v2 — M1: Seed permission catalog + per-tenant positions & templates
-- Idempotent: re-running this migration skips existing keys/codes/templates.
-- =============================================================

-- =====================
-- 1. PERMISSION KEYS CATALOG (global, 62 keys)
-- =====================
INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  -- dashboard
  ('dashboard:view',                 'dashboard',          'Xem dashboard tổng quan',                        'either'),

  -- menu
  ('menu:read',                      'menu',               'Xem thực đơn & giá',                             'either'),
  ('menu:write',                     'menu',               'Tạo/sửa món & giá',                              'either'),
  ('menu:publish',                   'menu',               'Đẩy giá áp dụng (publish)',                      'either'),
  ('menu:manage_category',           'menu',               'Quản lý danh mục món',                           'either'),

  -- inventory
  ('inventory:read',                 'inventory',          'Xem tồn kho & nguyên liệu',                      'either'),
  ('inventory:write',                'inventory',          'Điều chỉnh tồn, đếm kho',                        'branch'),
  ('inventory:stocktake_create',     'inventory',          'Tạo phiếu kiểm kho',                             'branch'),
  ('inventory:stocktake_complete',   'inventory',          'Chốt phiếu kiểm kho',                            'branch'),
  ('inventory:transfer_create',      'inventory',          'Tạo phiếu điều chuyển',                          'branch'),
  ('inventory:transfer_ship',        'inventory',          'Xuất kho điều chuyển',                           'branch'),
  ('inventory:transfer_receive',     'inventory',          'Nhận kho điều chuyển',                           'branch'),
  ('inventory:writeoff',             'inventory',          'Xoá sổ hàng hết hạn/hỏng',                       'branch'),
  ('inventory:production_create',    'inventory',          'Tạo lệnh sản xuất',                              'branch'),
  ('inventory:production_confirm',   'inventory',          'Xác nhận hoàn thành sản xuất',                   'branch'),

  -- procurement (inventory_procurement)
  ('procurement:read',               'inventory_procurement', 'Xem đơn mua hàng & NCC',                      'either'),
  ('procurement:po_create',          'inventory_procurement', 'Tạo đơn mua hàng (PO)',                       'either'),
  ('procurement:po_approve',         'inventory_procurement', 'Duyệt đơn mua hàng',                          'either'),
  ('procurement:grn_create',         'inventory_procurement', 'Tạo phiếu nhập kho (GRN)',                    'branch'),
  ('procurement:grn_confirm',        'inventory_procurement', 'Xác nhận phiếu nhập kho',                     'branch'),
  ('procurement:invoice_create',     'inventory_procurement', 'Tạo hoá đơn mua hàng',                        'either'),
  ('procurement:invoice_match',      'inventory_procurement', 'Đối chiếu hoá đơn mua hàng',                  'either'),
  ('procurement:supplier_manage',    'inventory_procurement', 'Quản lý NCC',                                 'tenant'),

  -- orders
  ('orders:read',                    'orders',             'Xem đơn hàng',                                   'either'),
  ('orders:write',                   'orders',             'Sửa đơn hàng',                                   'branch'),
  ('orders:void',                    'orders',             'Huỷ đơn',                                        'branch'),
  ('orders:refund',                  'orders',             'Hoàn tiền',                                      'branch'),

  -- staff
  ('staff:view',                     'staff',              'Xem danh sách nhân viên',                        'either'),
  ('staff:manage',                   'staff',              'CRUD nhân viên / ca / lịch',                     'either'),
  ('staff:assign_permission',        'staff',              'Gán/thu hồi quyền cho user',                     'tenant'),
  ('staff:assign_position',          'staff',              'Gán chức vụ HR',                                 'tenant'),

  -- hr
  ('hr:view_employee',               'hr',                 'Xem hồ sơ nhân sự',                              'tenant'),
  ('hr:manage_employee',             'hr',                 'Sửa hồ sơ nhân sự',                              'tenant'),
  ('hr:contract_create',             'hr',                 'Tạo hợp đồng lao động',                          'tenant'),
  ('hr:contract_sign',               'hr',                 'Ký hợp đồng lao động',                           'tenant'),
  ('hr:terminate',                   'hr',                 'Chấm dứt hợp đồng',                              'tenant'),
  ('hr:dependent_manage',            'hr',                 'Quản lý người phụ thuộc (NPT)',                  'tenant'),

  -- finance
  ('finance:view',                   'finance',            'Xem báo cáo tài chính',                          'either'),
  ('finance:expense_create',         'finance',            'Tạo chi phí',                                    'either'),
  ('finance:expense_approve',        'finance',            'Duyệt chi phí',                                  'tenant'),
  ('finance:payroll_calculate',      'finance',            'Tính lương',                                     'tenant'),
  ('finance:payroll_approve',        'finance',            'Duyệt bảng lương (owner only)',                  'tenant'),
  ('finance:ap_pay',                 'finance',            'Thanh toán công nợ NCC',                         'tenant'),

  -- reports
  ('reports:view_branch',            'reports',            'Xem báo cáo cấp chi nhánh',                      'branch'),
  ('reports:view_tenant',            'reports',            'Xem báo cáo cấp tenant',                         'tenant'),
  ('reports:export',                 'reports',            'Xuất báo cáo',                                   'either'),
  ('reports:pit_export',             'reports',            'Xuất quyết toán TNCN',                           'tenant'),

  -- settings
  ('settings:branch',                'settings',           'Cấu hình chi nhánh (giờ, máy in...)',            'branch'),
  ('settings:tenant',                'settings',           'Cấu hình tenant (pháp lý, MST)',                 'tenant'),
  ('settings:integrations',          'settings',           'Cấu hình tích hợp (HĐĐT, ngân hàng)',            'tenant'),

  -- pos
  ('pos:use',                        'pos',                'Sử dụng POS',                                    'branch'),
  ('pos:void_order',                 'pos',                'Huỷ đơn POS',                                    'branch'),
  ('pos:apply_discount',             'pos',                'Áp giảm giá POS',                                'branch'),
  ('pos:open_cashbox',               'pos',                'Mở két tiền',                                    'branch'),
  ('pos:close_shift',                'pos',                'Đóng ca POS',                                    'branch'),
  ('pos:reprint_receipt',            'pos',                'In lại hoá đơn',                                 'branch'),

  -- kds
  ('kds:use',                        'kds',                'Xem màn hình bếp',                               'branch'),
  ('kds:mark_ready',                 'kds',                'Đánh dấu món ready',                             'branch'),
  ('kds:recall',                     'kds',                'Thu hồi món đã ready',                           'branch')
ON CONFLICT (key) DO NOTHING;

-- =====================
-- 2. PER-TENANT POSITIONS (15 system codes, seeded for every existing tenant)
-- =====================
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_system) VALUES
      (t.id, 'owner',            'Chủ sở hữu',            'Owner',                  TRUE),
      (t.id, 'super_manager',    'Giám đốc điều hành',    'Executive Manager',      TRUE),
      (t.id, 'tro_ly_giam_doc',  'Trợ lý Giám đốc',       'Executive Assistant',    TRUE),
      (t.id, 'quan_ly_vung',     'Quản lý khu vực',       'Area Manager',           TRUE),
      (t.id, 'quan_ly_CN',       'Quản lý chi nhánh',     'Branch Manager',         TRUE),
      (t.id, 'ke_toan_truong',   'Kế toán trưởng',        'Chief Accountant',       TRUE),
      (t.id, 'ke_toan',          'Kế toán',               'Accountant',             TRUE),
      (t.id, 'office',           'Nhân sự / Hành chính',  'HR / Admin',             TRUE),
      (t.id, 'kho_truong',       'Kho trưởng',            'Warehouse Head',         TRUE),
      (t.id, 'thu_kho',          'Thủ kho',               'Warehouse Keeper',       TRUE),
      (t.id, 'bep_truong',       'Bếp trưởng',            'Head Chef',              TRUE),
      (t.id, 'chef',             'Bếp',                   'Chef',                   TRUE),
      (t.id, 'phu_bep',          'Phụ bếp',               'Kitchen Helper',         TRUE),
      (t.id, 'cashier',          'Thu ngân',              'Cashier',                TRUE),
      (t.id, 'waiter',           'Phục vụ',               'Waiter',                 TRUE)
    ON CONFLICT (code, tenant_id) DO NOTHING;
  END LOOP;
END $$;

-- =====================
-- 3. PER-TENANT ROLE TEMPLATES (preset map position → permission_keys[])
-- =====================
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP

    -- waiter
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'waiter', 'waiter', ARRAY[
        'pos:use','orders:read','orders:write'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- cashier
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'cashier', 'cashier', ARRAY[
        'pos:use','pos:open_cashbox','pos:close_shift','pos:reprint_receipt','orders:read'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- chef
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'chef', 'chef', ARRAY[
        'kds:use','kds:mark_ready'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- phu_bep
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'phu_bep', 'phu_bep', ARRAY[
        'kds:use'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- thu_kho
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'thu_kho', 'thu_kho', ARRAY[
        'inventory:read','inventory:write',
        'inventory:transfer_receive','inventory:stocktake_create','inventory:stocktake_complete'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- kho_truong
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'kho_truong', 'kho_truong', ARRAY[
        'inventory:read','inventory:write',
        'inventory:transfer_create','inventory:transfer_ship','inventory:transfer_receive',
        'inventory:stocktake_create','inventory:stocktake_complete','inventory:writeoff',
        'procurement:read','procurement:grn_create','procurement:grn_confirm',
        'procurement:po_create','procurement:supplier_manage'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- bep_truong
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'bep_truong', 'bep_truong', ARRAY[
        'kds:use','kds:mark_ready','kds:recall',
        'menu:read',
        'inventory:read','inventory:production_create','inventory:production_confirm'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- quan_ly_CN (branch manager)
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'quan_ly_CN', 'quan_ly_CN', ARRAY[
        'dashboard:view',
        'menu:read',
        'orders:read','orders:write','orders:void','orders:refund',
        'inventory:read','inventory:write',
        'inventory:transfer_create','inventory:transfer_receive',
        'inventory:stocktake_create','inventory:stocktake_complete',
        'procurement:read','procurement:po_create','procurement:grn_create','procurement:grn_confirm',
        'pos:use','pos:void_order','pos:apply_discount','pos:open_cashbox','pos:close_shift','pos:reprint_receipt',
        'staff:view','staff:manage',
        'reports:view_branch','reports:export',
        'settings:branch'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- quan_ly_vung (area manager) — tương đương branch manager, nhân bản cho N CN do admin grant thủ công
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'quan_ly_vung', 'quan_ly_vung', ARRAY[
        'dashboard:view',
        'menu:read',
        'orders:read','orders:write','orders:void','orders:refund',
        'inventory:read','inventory:write',
        'inventory:transfer_create','inventory:transfer_receive',
        'inventory:stocktake_create','inventory:stocktake_complete',
        'procurement:read','procurement:po_create','procurement:grn_create','procurement:grn_confirm',
        'pos:use','pos:void_order','pos:apply_discount',
        'staff:view','staff:manage',
        'reports:view_branch','reports:export',
        'settings:branch'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- ke_toan
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'ke_toan', 'ke_toan', ARRAY[
        'dashboard:view',
        'finance:view','finance:expense_create',
        'procurement:read','procurement:invoice_create','procurement:invoice_match',
        'reports:view_tenant','reports:export',
        'hr:view_employee'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- ke_toan_truong
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'ke_toan_truong', 'ke_toan_truong', ARRAY[
        'dashboard:view',
        'finance:view','finance:expense_create','finance:expense_approve',
        'finance:payroll_calculate','finance:ap_pay',
        'procurement:read','procurement:invoice_create','procurement:invoice_match','procurement:supplier_manage',
        'reports:view_tenant','reports:export','reports:pit_export',
        'hr:view_employee','hr:manage_employee'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- office (HR)
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'office', 'office', ARRAY[
        'dashboard:view',
        'hr:view_employee','hr:manage_employee',
        'hr:contract_create','hr:contract_sign','hr:dependent_manage',
        'staff:view','staff:manage'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- tro_ly_giam_doc
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'tro_ly_giam_doc', 'tro_ly_giam_doc', ARRAY[
        'dashboard:view',
        'reports:view_tenant','reports:export',
        'staff:view',
        'hr:view_employee',
        'finance:view'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- super_manager — gần như tất cả, trừ payroll_approve & settings:tenant (owner-only)
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system) VALUES
      (t.id, 'super_manager', 'super_manager', ARRAY[
        'dashboard:view',
        'menu:read','menu:write','menu:publish','menu:manage_category',
        'inventory:read','inventory:write',
        'inventory:stocktake_create','inventory:stocktake_complete',
        'inventory:transfer_create','inventory:transfer_ship','inventory:transfer_receive',
        'inventory:writeoff','inventory:production_create','inventory:production_confirm',
        'procurement:read','procurement:po_create','procurement:po_approve',
        'procurement:grn_create','procurement:grn_confirm',
        'procurement:invoice_create','procurement:invoice_match','procurement:supplier_manage',
        'orders:read','orders:write','orders:void','orders:refund',
        'staff:view','staff:manage','staff:assign_permission','staff:assign_position',
        'hr:view_employee','hr:manage_employee','hr:contract_create','hr:contract_sign','hr:dependent_manage','hr:terminate',
        'finance:view','finance:expense_create','finance:expense_approve',
        'finance:payroll_calculate','finance:ap_pay',
        'reports:view_branch','reports:view_tenant','reports:export','reports:pit_export',
        'settings:branch','settings:integrations',
        'pos:use','pos:void_order','pos:apply_discount',
        'pos:open_cashbox','pos:close_shift','pos:reprint_receipt',
        'kds:use','kds:mark_ready','kds:recall'
      ], TRUE) ON CONFLICT (name, tenant_id) DO NOTHING;

    -- owner — template is informational; has_permission() bypasses anyway. Seed all keys.
    INSERT INTO public.role_templates (tenant_id, name, position_code, permission_keys, is_system)
    SELECT t.id, 'owner', 'owner',
           ARRAY(SELECT key FROM public.permission_keys ORDER BY key),
           TRUE
    ON CONFLICT (name, tenant_id) DO NOTHING;

  END LOOP;
END $$;
