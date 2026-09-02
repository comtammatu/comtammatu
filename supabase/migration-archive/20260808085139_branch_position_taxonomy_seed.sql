-- Seed full branch HR position taxonomy + waiter mapping (ADR 0023).
-- Idempotent: safe to re-apply; does not modify existing manager/cashier/chef rows.

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'central_supply_ops' THEN 'central_supply_ops'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen_lead'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'chef' THEN 'chef'
    WHEN 'kitchen_counter' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'grill_counter' THEN 'chef'
    WHEN 'cleaner' THEN 'branch_staff'
    WHEN 'guard' THEN 'branch_staff'
    WHEN 'waiter' THEN 'branch_staff'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION private.staff_role_from_position_code(p_code text) IS
  'Canonical HR position_code to application user_role mapper. Includes waiter → branch_staff (ADR 0023). Unknown positions fail closed.';

CREATE OR REPLACE FUNCTION private.required_branch_kind_for_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN NULL
    WHEN 'accountant' THEN NULL
    WHEN 'hr_manager' THEN NULL
    WHEN 'central_supply_ops' THEN 'central_supply'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen'
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'guard' THEN 'branch'
    WHEN 'waiter' THEN 'branch'
    ELSE 'unassigned'
  END
$$;

COMMENT ON FUNCTION private.required_branch_kind_for_position_code(p_code text) IS
  'TS twin of requiredBranchKindForPositionCode. NULL = tenant-level. waiter is branch-scoped (ADR 0023).';

INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active, is_system)
SELECT t.id, v.code, v.label_vi, v.label_en, true, true
FROM public.tenants AS t
CROSS JOIN (
  VALUES
    ('kitchen_counter', 'Quầy lên món', 'Kitchen Counter'),
    ('kitchen_helper', 'Phụ bếp', 'Kitchen Helper'),
    ('grill_counter', 'Quầy nướng', 'Grill Counter'),
    ('waiter', 'Phục vụ', 'Waiter'),
    ('cleaner', 'Tạp vụ', 'Cleaner'),
    ('guard', 'Bảo vệ', 'Guard')
) AS v(code, label_vi, label_en)
WHERE t.slug = 'comtammatu'
ON CONFLICT (code, tenant_id) DO UPDATE
SET
  label_vi = EXCLUDED.label_vi,
  label_en = EXCLUDED.label_en,
  is_active = true,
  is_system = true;

INSERT INTO public.role_templates (
  tenant_id,
  name,
  position_code,
  permission_keys,
  is_system
)
SELECT
  t.id,
  v.position_code,
  v.position_code,
  v.permission_keys,
  true
FROM public.tenants AS t
CROSS JOIN (
  VALUES
    (
      'kitchen_counter',
      ARRAY[
        'hr:request_leave',
        'kds:mark_ready',
        'kds:use'
      ]::text[]
    ),
    (
      'kitchen_helper',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'grill_counter',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'waiter',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'cleaner',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'guard',
      ARRAY['hr:request_leave']::text[]
    )
) AS v(position_code, permission_keys)
WHERE t.slug = 'comtammatu'
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_templates AS existing
    WHERE existing.tenant_id = t.id
      AND existing.position_code = v.position_code
  );

UPDATE public.role_templates AS template
SET
  permission_keys = v.permission_keys,
  is_system = true,
  name = v.position_code
FROM public.tenants AS tenant,
LATERAL (
  VALUES
    (
      'kitchen_counter',
      ARRAY[
        'hr:request_leave',
        'kds:mark_ready',
        'kds:use'
      ]::text[]
    ),
    (
      'kitchen_helper',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'grill_counter',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'waiter',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'cleaner',
      ARRAY['hr:request_leave']::text[]
    ),
    (
      'guard',
      ARRAY['hr:request_leave']::text[]
    )
) AS v(position_code, permission_keys)
WHERE tenant.slug = 'comtammatu'
  AND template.tenant_id = tenant.id
  AND template.position_code = v.position_code
  AND (
    template.permission_keys IS DISTINCT FROM v.permission_keys
    OR template.is_system IS DISTINCT FROM true
    OR template.name IS DISTINCT FROM v.position_code
  );
