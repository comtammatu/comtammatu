-- ABAC (Attribute-Based Access Control) schema for comtammatu.
-- Replaces coarse role→module gating with dynamic per-user permission overrides.

-- 1. Permission catalog: the 96 granular permission keys
CREATE TABLE IF NOT EXISTS public.permission_catalog (
    key                   TEXT PRIMARY KEY,
    module                TEXT NOT NULL,
    action                TEXT NOT NULL,
    description           TEXT,
    requires_branch_scope BOOLEAN NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Role permission defaults: what each role can do out of the box
CREATE TABLE IF NOT EXISTS public.role_permission_defaults (
    role            TEXT NOT NULL,
    permission_key  TEXT NOT NULL REFERENCES public.permission_catalog(key) ON DELETE CASCADE,
    effect          TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
    PRIMARY KEY (role, permission_key)
);

-- 3. Per-user permission overrides (grants or denies that supersede role defaults)
CREATE TABLE IF NOT EXISTS public.user_permissions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    permission_key  TEXT NOT NULL REFERENCES public.permission_catalog(key) ON DELETE CASCADE,
    branch_id       BIGINT REFERENCES public.branches(id) ON DELETE CASCADE,
    effect          TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
    granted_by      BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until     TIMESTAMPTZ,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, permission_key, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant_id ON public.user_permissions(tenant_id);

-- 4. Area assignments for area managers
CREATE TABLE IF NOT EXISTS public.user_area_assignments (
    user_id     BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    area_id     BIGINT NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
    tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id),
    assigned_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, area_id)
);

-- ─── Seed permission catalog (96 keys) ───────────────────────────────────────

INSERT INTO public.permission_catalog (key, module, action, description, requires_branch_scope) VALUES
-- Dashboard
('dashboard:view',             'dashboard',    'read',    'View admin dashboard',                     false),
-- Menu
('menu:read',                  'menu',         'read',    'Read menu categories and items',            false),
('menu:write',                 'menu',         'write',   'Create/update menu items and categories',   false),
('menu:publish',               'menu',         'manage',  'Publish/unpublish menu items',              false),
('menu:manage_category',       'menu',         'manage',  'Create/delete menu categories',             false),
-- Inventory
('inventory:read',             'inventory',    'read',    'View inventory levels and movements',       true),
('inventory:write',            'inventory',    'write',   'Create inventory adjustments',              true),
('inventory:stocktake_create', 'inventory',    'write',   'Create stocktake sessions',                 true),
('inventory:stocktake_complete','inventory',   'manage',  'Complete and lock stocktake',               true),
('inventory:stocktake_recount','inventory',    'write',   'Request stocktake recount',                 true),
('inventory:stocktake_unblind','inventory',    'manage',  'Unblind stocktake (reveal expected qty)',   true),
('inventory:transfer_create',  'inventory',    'write',   'Create stock transfer requests',            true),
('inventory:transfer_ship',    'inventory',    'write',   'Ship a stock transfer',                     true),
('inventory:transfer_receive', 'inventory',    'write',   'Receive a stock transfer',                  true),
('inventory:writeoff',         'inventory',    'manage',  'Write off inventory',                       true),
('inventory:production_create','inventory',    'write',   'Create production orders',                  true),
('inventory:production_confirm','inventory',   'manage',  'Confirm production completion',             true),
('inventory:waste_approve',    'inventory',    'manage',  'Approve waste records',                     true),
('inventory:waste_bypass_photo','inventory',   'manage',  'Bypass photo requirement for waste',        true),
('inventory:adjust_approve',   'inventory',    'manage',  'Approve inventory adjustments',             true),
('inventory:grn_express_configure','inventory','manage',  'Configure GRN express settings',            false),
('inventory:grn_express_extend','inventory',   'manage',  'Extend GRN express deadlines',              true),
('inventory:grn_hardblock_override','inventory','manage', 'Override GRN hard block',                   true),
('inventory:catalog_review_policy_set','inventory','manage','Set catalog review policy',               false),
('inventory:item_review_override_set','inventory','manage','Override item review policy',              false),
-- Procurement
('procurement:read',           'inventory_procurement', 'read',   'View purchase orders and suppliers', false),
('procurement:po_create',      'inventory_procurement', 'write',  'Create purchase orders',             false),
('procurement:po_approve',     'inventory_procurement', 'manage', 'Approve purchase orders',            false),
('procurement:grn_create',     'inventory_procurement', 'write',  'Create goods received notes',        true),
('procurement:grn_confirm',    'inventory_procurement', 'manage', 'Confirm GRN receipt',                true),
('procurement:grn_amend',      'inventory_procurement', 'manage', 'Amend confirmed GRN',                true),
('procurement:invoice_create', 'inventory_procurement', 'write',  'Create supplier invoices',           false),
('procurement:invoice_match',  'inventory_procurement', 'manage', 'Match invoice to PO/GRN',            false),
('procurement:supplier_manage','inventory_procurement', 'manage', 'Create/update supplier records',     false),
('procurement:price_list_read','inventory_procurement', 'read',   'View supplier price lists',          false),
('procurement:price_list_write','inventory_procurement','write',  'Update supplier price lists',        false),
('procurement:override_code_rotate','inventory_procurement','manage','Rotate GRN override code',        false),
-- Supplier returns
('supplier_return:read',       'inventory_procurement', 'read',   'View supplier returns',              true),
('supplier_return:create',     'inventory_procurement', 'write',  'Create supplier returns',            true),
('supplier_return:confirm',    'inventory_procurement', 'manage', 'Confirm supplier return',            true),
-- Accounting
('accounting:period_reopen',   'accounting',   'manage', 'Reopen a closed accounting period',          false),
-- Orders
('orders:read',                'orders',       'read',   'View orders',                                true),
('orders:write',               'orders',       'write',  'Create and modify orders',                   true),
('orders:void',                'orders',       'manage', 'Void orders',                                true),
('orders:refund',              'orders',       'manage', 'Process order refunds',                      true),
('orders:refund_approve',      'orders',       'manage', 'Approve refund requests',                    true),
-- Staff management
('staff:view',                 'staff',        'read',   'View staff profiles and roles',              false),
('staff:manage',               'staff',        'manage', 'Create/update/deactivate staff',             false),
('staff:assign_permission',    'staff',        'manage', 'Grant/revoke per-user permissions',          false),
('staff:assign_position',      'staff',        'manage', 'Assign HR positions to staff',               false),
-- HR
('hr:view_employee',           'hr',           'read',   'View employee records',                      false),
('hr:manage_employee',         'hr',           'manage', 'Create/update employee records',             false),
('hr:contract_create',         'hr',           'write',  'Create employment contracts',                false),
('hr:contract_sign',           'hr',           'manage', 'Sign/approve employment contracts',          false),
('hr:terminate',               'hr',           'manage', 'Process employee terminations',              false),
('hr:dependent_manage',        'hr',           'write',  'Manage employee dependents',                 false),
('hr:register_shift',          'hr',           'write',  'Register for work shifts',                   true),
('hr:approve_shift_request',   'hr',           'manage', 'Approve shift registration requests',        true),
-- CRM
('crm:read',                   'crm',          'read',   'View CRM data and customer records',         false),
('crm:write',                  'crm',          'write',  'Create/update CRM records',                  false),
('crm:campaign_send',          'crm',          'manage', 'Send CRM campaigns',                         false),
-- Feedback
('feedback:view',              'feedback',     'read',   'View customer feedback',                     true),
('feedback:view_phone',        'feedback',     'read',   'View customer phone numbers in feedback',    true),
('feedback:view_report',       'feedback',     'read',   'View feedback analytics report',             true),
('feedback:manage_qr',         'feedback',     'manage', 'Manage feedback QR codes',                   true),
('feedback:manage_telegram',   'feedback',     'manage', 'Manage Telegram notification destinations',  true),
('feedback:manage_settings',   'feedback',     'manage', 'Manage feedback collection settings',        true),
('feedback:moderate',          'feedback',     'manage', 'Moderate/delete feedback entries',           true),
-- Finance
('finance:view',               'finance',      'read',   'View financial reports and P&L',             false),
('finance:expense_create',     'finance',      'write',  'Create expense entries',                     true),
('finance:expense_approve',    'finance',      'manage', 'Approve expense entries',                    false),
('finance:payroll_calculate',  'finance',      'manage', 'Run payroll calculation',                    false),
('finance:payroll_approve',    'finance',      'manage', 'Approve payroll for payment',                false),
('finance:ap_pay',             'finance',      'manage', 'Approve accounts payable payments',          false),
-- Reports
('reports:view_branch',        'reports',      'read',   'View reports for own branch',                true),
('reports:view_tenant',        'reports',      'read',   'View tenant-wide reports',                   false),
('reports:export',             'reports',      'read',   'Export report data',                         false),
('reports:pit_export',         'reports',      'read',   'Export PIT (personal income tax) data',      false),
-- Settings
('settings:branch',            'settings',     'manage', 'Manage branch configuration',                true),
('settings:tenant',            'settings',     'manage', 'Manage tenant-wide settings',                false),
('settings:integrations',      'settings',     'manage', 'Manage third-party integrations',            false),
('settings:branch_network',    'settings',     'manage', 'Manage branch network topology',             false),
-- POS
('pos:use',                    'pos',          'operate','Use the point of sale terminal',              true),
('pos:void_order',             'pos',          'manage', 'Void orders at POS',                         true),
('pos:apply_discount',         'pos',          'manage', 'Apply discounts at POS',                     true),
('pos:open_cashbox',           'pos',          'operate','Open the cash drawer',                       true),
('pos:close_shift',            'pos',          'manage', 'Close a POS shift',                          true),
('pos:reprint_receipt',        'pos',          'operate','Reprint a receipt',                          true),
('pos:send_kitchen',           'pos',          'operate','Send orders to kitchen',                     true),
('pos:print',                  'pos',          'operate','Print from POS',                             true),
('pos:confirm_payment',        'pos',          'operate','Confirm payment received',                   true),
('pos:close_shift_variance_override','pos',    'manage', 'Override variance limit when closing shift', true),
-- KDS
('kds:use',                    'kds',          'operate','Use the kitchen display system',             true),
('kds:mark_ready',             'kds',          'operate','Mark orders as ready on KDS',               true),
('kds:recall',                 'kds',          'operate','Recall completed orders on KDS',             true),
-- Employee self-service
('employee:self_service',      'employee',     'read',   'Access employee self-service portal',        false),
-- Notifications
('notifications:read',         'notifications','read',   'Receive and view notifications',             false),
-- Printer
('printer:manage',             'printer',      'manage', 'Configure and manage printers',              true)
ON CONFLICT (key) DO NOTHING;

-- ─── Seed role permission defaults ───────────────────────────────────────────
-- owner and super_manager: all permissions
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT r.role, pc.key, 'allow'
FROM (VALUES ('owner'), ('super_manager')) AS r(role)
CROSS JOIN public.permission_catalog pc
ON CONFLICT DO NOTHING;

-- area_manager: menu(read/write/publish/manage_category), inventory(read+basic ops), orders(read/write/void), feedback, settings:branch, reports:view_branch
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'area_manager', key, 'allow' FROM public.permission_catalog
WHERE key IN (
    'dashboard:view',
    'menu:read','menu:write','menu:publish','menu:manage_category',
    'inventory:read','inventory:write','inventory:stocktake_create','inventory:stocktake_complete',
    'inventory:transfer_create','inventory:transfer_receive','inventory:waste_approve',
    'orders:read','orders:write','orders:void',
    'feedback:view','feedback:view_phone','feedback:view_report','feedback:manage_qr',
    'feedback:manage_telegram','feedback:manage_settings','feedback:moderate',
    'settings:branch','settings:tenant',
    'reports:view_branch','reports:view_tenant',
    'employee:self_service','notifications:read'
)
ON CONFLICT DO NOTHING;

-- branch_manager: menu(read/write), inventory(read+ops), orders(all), pos(all), kds(all), settings:branch, feedback(view), reports:view_branch
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'branch_manager', key, 'allow' FROM public.permission_catalog
WHERE key IN (
    'dashboard:view',
    'menu:read','menu:write','menu:publish','menu:manage_category',
    'inventory:read','inventory:write','inventory:stocktake_create','inventory:stocktake_complete',
    'inventory:stocktake_recount','inventory:transfer_create','inventory:transfer_ship',
    'inventory:transfer_receive','inventory:writeoff','inventory:waste_approve',
    'orders:read','orders:write','orders:void','orders:refund',
    'pos:use','pos:void_order','pos:apply_discount','pos:open_cashbox','pos:close_shift',
    'pos:reprint_receipt','pos:send_kitchen','pos:print','pos:confirm_payment',
    'pos:close_shift_variance_override',
    'kds:use','kds:mark_ready','kds:recall',
    'feedback:view','feedback:view_phone','feedback:view_report',
    'settings:branch',
    'reports:view_branch',
    'employee:self_service','notifications:read'
)
ON CONFLICT DO NOTHING;

-- warehouse_manager: inventory (full), procurement (full)
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'warehouse_manager', key, 'allow' FROM public.permission_catalog
WHERE module IN ('inventory','inventory_procurement')
ON CONFLICT DO NOTHING;

-- production_manager: inventory (production focus), procurement (read)
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'production_manager', key, 'allow' FROM public.permission_catalog
WHERE key IN (
    'inventory:read','inventory:write','inventory:production_create','inventory:production_confirm',
    'inventory:stocktake_create','inventory:stocktake_complete','inventory:transfer_receive',
    'inventory:writeoff',
    'procurement:read','procurement:grn_create','procurement:grn_confirm',
    'employee:self_service','notifications:read'
)
ON CONFLICT DO NOTHING;

-- cashier: orders(read/write), pos(use + basic ops)
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'cashier', key, 'allow' FROM public.permission_catalog
WHERE key IN (
    'orders:read','orders:write',
    'pos:use','pos:open_cashbox','pos:reprint_receipt','pos:send_kitchen',
    'pos:print','pos:confirm_payment',
    'employee:self_service','notifications:read'
)
ON CONFLICT DO NOTHING;

-- waiter: pos(use + send/print), orders:read
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'waiter', key, 'allow' FROM public.permission_catalog
WHERE key IN (
    'orders:read',
    'pos:use','pos:send_kitchen','pos:print',
    'employee:self_service','notifications:read'
)
ON CONFLICT DO NOTHING;

-- chef: kds (full)
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'chef', key, 'allow' FROM public.permission_catalog
WHERE key IN (
    'kds:use','kds:mark_ready','kds:recall',
    'employee:self_service','notifications:read'
)
ON CONFLICT DO NOTHING;

-- office: employee self-service + hr view
INSERT INTO public.role_permission_defaults (role, permission_key, effect)
SELECT 'office', key, 'allow' FROM public.permission_catalog
WHERE key IN (
    'hr:view_employee','hr:register_shift',
    'employee:self_service','notifications:read'
)
ON CONFLICT DO NOTHING;
