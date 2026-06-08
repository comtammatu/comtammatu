-- ============================================================================
-- Lean seed for the 58-table HKD baseline (Hộ Kinh Doanh Cơm Tấm Má Tư).
--
-- Goal: a fresh apply of baseline.sql + this seed onto an empty Supabase
-- project must let GoTrue mint a token (custom_access_token_hook resolves a
-- role) and let PostgREST read/write under RLS.
--
-- Seeds: 1 tenant, 2 branches (branch_kind='branch'), the 4 lean HKD positions
-- (codes that resolve through private.staff_role_from_position_code to the
-- owner / manager / staff / chef buckets), the permission-key catalog the lean
-- app uses, system_settings (seller identity + HĐĐT placeholders), and one
-- synthetic auth.users + matching profile so the access-token hook has a real
-- user to resolve.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING so `supabase db reset`
-- (or a manual re-apply) is safe to run repeatedly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Synthetic owner auth user.
--    profiles.id and tenants.owner_user_id are both FKs to auth.users(id), so
--    the owner identity must exist before tenant/profile inserts. A fresh
--    project ships an empty auth schema with the auth roles already created.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'owner@comtammatu.local',
  jsonb_build_object('provider', 'email', 'providers', ARRAY['email'], 'role', 'owner'),
  '{}'::jsonb,
  now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 1. Tenant.
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (name, slug, legal_name, tax_code, representative, owner_user_id)
VALUES (
  'Cơm Tấm Má Tư',
  'comtammatu',
  'HỘ KINH DOANH CƠM TẤM MÁ TƯ',
  NULL,                                 -- MST placeholder (set 077200004194 at go-live)
  'Cơm Tấm Má Tư',
  '00000000-0000-0000-0000-0000000000a1'
)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Branches — two store sites (branch_kind='branch' requires a [A-Z]{2,4} code).
-- ----------------------------------------------------------------------------
INSERT INTO public.branches (tenant_id, name, branch_kind, code, is_active)
SELECT t.id, v.name, 'branch', v.code, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('Chi nhánh 1', 'CNA'),
  ('Chi nhánh 2', 'CNB')
) AS v(name, code)
WHERE t.slug = 'comtammatu'
ON CONFLICT (name, tenant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Positions — the 4 lean HKD roles. Codes are taken verbatim from the
--    private.staff_role_from_position_code() mapping so each resolves to a
--    distinct StaffRole bucket:
--      owner          -> owner    (HKD: owner)
--      branch_manager -> branch_manager (HKD: manager; keeps floor/terminal)
--      cashier        -> cashier  (HKD: staff)
--      chef           -> chef     (HKD: chef)
-- ----------------------------------------------------------------------------
INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active, is_system)
SELECT t.id, v.code, v.label_vi, v.label_en, true, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('owner',          'Chủ quán',       'Owner'),
  ('branch_manager', 'Quản lý',        'Manager'),
  ('cashier',        'Nhân viên',      'Staff'),
  ('chef',           'Bếp',            'Chef')
) AS v(code, label_vi, label_en)
WHERE t.slug = 'comtammatu'
ON CONFLICT (code, tenant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Permission-key catalog (global; permission_keys has no tenant scope).
--    Lean subset covering the modules the HKD app keeps: POS, KDS/runner,
--    orders, menu, lean inventory + procurement (supplier công nợ), staff,
--    settings, reports, lean finance (cash-book + AP pay), printer.
--    scope: 'branch' = floor-scoped, 'tenant' = whole-tenant, 'either' = both.
-- ----------------------------------------------------------------------------
INSERT INTO public.permission_keys (key, module, description, scope)
VALUES
  -- dashboard
  ('dashboard:view',                'dashboard',  'Xem dashboard',                       'tenant'),
  -- menu
  ('menu:read',                     'menu',       'Xem thực đơn',                        'tenant'),
  ('menu:write',                    'menu',       'Sửa thực đơn',                        'tenant'),
  ('menu:publish',                  'menu',       'Xuất bản thực đơn',                   'tenant'),
  ('menu:manage_category',          'menu',       'Quản lý nhóm món',                    'tenant'),
  -- inventory (lean)
  ('inventory:read',                'inventory',  'Xem kho',                             'either'),
  ('inventory:write',               'inventory',  'Cập nhật kho',                        'either'),
  ('inventory:stocktake_create',    'inventory',  'Tạo kiểm kê',                         'branch'),
  ('inventory:stocktake_complete',  'inventory',  'Hoàn tất kiểm kê',                    'branch'),
  -- procurement (supplier công nợ)
  ('procurement:read',              'procurement','Xem nhập hàng',                       'either'),
  ('procurement:grn_create',        'procurement','Tạo phiếu nhập',                      'branch'),
  ('procurement:grn_confirm',       'procurement','Xác nhận phiếu nhập',                 'branch'),
  ('procurement:grn_amend',         'procurement','Sửa phiếu nhập đã chốt',              'branch'),
  ('procurement:invoice_create',    'procurement','Tạo hóa đơn NCC',                     'either'),
  ('procurement:supplier_manage',   'procurement','Quản lý NCC',                         'tenant'),
  -- orders
  ('orders:read',                   'orders',     'Xem đơn hàng',                        'branch'),
  ('orders:write',                  'orders',     'Tạo/sửa đơn hàng',                    'branch'),
  ('orders:void',                   'orders',     'Hủy đơn hàng',                        'branch'),
  ('orders:refund',                 'orders',     'Hoàn tiền',                           'branch'),
  -- staff
  ('staff:view',                    'staff',      'Xem nhân sự',                         'tenant'),
  ('staff:manage',                  'staff',      'Quản lý nhân sự',                     'tenant'),
  ('staff:assign_permission',       'staff',      'Cấp quyền',                           'either'),
  ('staff:assign_position',         'staff',      'Gán chức vụ',                         'tenant'),
  -- hr (lean attendance/leave)
  ('hr:view_employee',              'hr',         'Xem hồ sơ nhân viên',                 'tenant'),
  ('hr:manage_employee',            'hr',         'Quản lý hồ sơ nhân viên',             'tenant'),
  ('hr:register_shift',             'hr',         'Đăng ký ca',                          'branch'),
  ('hr:approve_shift_request',      'hr',         'Duyệt đăng ký ca',                    'branch'),
  -- finance (lean: cash-book + AP pay)
  ('finance:view',                  'finance',    'Xem tài chính',                       'tenant'),
  ('finance:expense_create',        'finance',    'Ghi sổ quỹ thu/chi',                  'tenant'),
  ('finance:expense_approve',       'finance',    'Duyệt chi',                           'tenant'),
  ('finance:ap_pay',                'finance',    'Trả tiền nhà cung cấp',               'tenant'),
  -- reports
  ('reports:view_branch',           'reports',    'Xem báo cáo chi nhánh',               'branch'),
  ('reports:view_tenant',           'reports',    'Xem báo cáo toàn hệ thống',           'tenant'),
  ('reports:export',                'reports',    'Xuất báo cáo',                        'tenant'),
  -- settings
  ('settings:branch',               'settings',   'Cấu hình chi nhánh',                  'branch'),
  ('settings:tenant',               'settings',   'Cấu hình hệ thống',                   'tenant'),
  ('settings:integrations',         'settings',   'Cấu hình tích hợp (HĐĐT, thanh toán)','tenant'),
  -- pos
  ('pos:use',                       'pos',        'Dùng POS',                            'branch'),
  ('pos:void_order',                'pos',        'Hủy đơn trên POS',                    'branch'),
  ('pos:apply_discount',            'pos',        'Áp dụng giảm giá',                    'branch'),
  ('pos:open_cashbox',              'pos',        'Mở két',                              'branch'),
  ('pos:close_shift',               'pos',        'Chốt ca',                             'branch'),
  ('pos:reprint_receipt',           'pos',        'In lại biên lai',                     'branch'),
  ('pos:send_kitchen',              'pos',        'Gửi bếp',                             'branch'),
  ('pos:print',                     'pos',        'In',                                  'branch'),
  ('pos:confirm_payment',           'pos',        'Xác nhận thanh toán',                 'branch'),
  -- kds
  ('kds:use',                       'kds',        'Dùng màn hình bếp',                   'branch'),
  ('kds:mark_ready',                'kds',        'Đánh dấu món xong',                    'branch'),
  ('kds:recall',                    'kds',        'Gọi lại món',                         'branch'),
  -- printer
  ('printer:manage',                'printer',    'Quản lý máy in',                      'branch')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. System settings — seller identity + HĐĐT/payment provider placeholders.
-- ----------------------------------------------------------------------------
INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, v.key, v.value, v.description
FROM public.tenants t
CROSS JOIN (VALUES
  ('seller_name',        'HỘ KINH DOANH CƠM TẤM MÁ TƯ', 'Tên người bán trên HĐĐT'),
  ('company_tax_code',   '',                            'MST (đặt 077200004194 khi go-live; rỗng = chặn phát hành HĐĐT)'),
  ('hddt_provider',      '',                            'Nhà cung cấp HĐĐT (placeholder)'),
  ('hddt_api_url',       '',                            'Endpoint HĐĐT (placeholder)'),
  ('hddt_username',      '',                            'Tài khoản HĐĐT (placeholder)'),
  ('hddt_password',      '',                            'Mật khẩu HĐĐT (placeholder)'),
  ('payment_provider',   '',                            'Nhà cung cấp thanh toán (placeholder)')
) AS v(key, value, description)
WHERE t.slug = 'comtammatu'
ON CONFLICT (key, tenant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Owner profile (hook smoke) — links the synthetic auth user to the owner
--    position so custom_access_token_hook can resolve tenant/branch/role/
--    position for at least one user. Tenant-level (branch_id NULL is valid for
--    the owner bucket per the branch-required trigger).
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name, is_active)
SELECT
  '00000000-0000-0000-0000-0000000000a1',
  t.id,
  NULL,
  po.id,
  'Chủ quán Má Tư',
  true
FROM public.tenants t
JOIN public.positions po ON po.tenant_id = t.id AND po.code = 'owner'
WHERE t.slug = 'comtammatu'
ON CONFLICT (id) DO NOTHING;
