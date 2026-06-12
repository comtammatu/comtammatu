-- Align Auth v2 role templates with Inventory Pilot Contract V2.
-- No schema changes. This migration updates system templates and expires only
-- active grants that were created from those same system templates.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'inventory:read',
      'inventory:write',
      'inventory:transfer_create',
      'inventory:transfer_ship',
      'inventory:transfer_receive',
      'inventory:stocktake_create',
      'inventory:stocktake_complete',
      'inventory:writeoff',
      'inventory:production_create',
      'inventory:production_confirm',
      'menu:read',
      'menu:write',
      'procurement:read',
      'procurement:po_create',
      'procurement:grn_create',
      'procurement:grn_confirm'
    ]::TEXT[]) AS required(key)
    LEFT JOIN public.permission_keys pk ON pk.key = required.key
    WHERE pk.key IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory_rbac_template_contract_v2: missing permission key';
  END IF;
END $$;

-- Bep truong / production_manager owns the central-kitchen transfer loop:
-- receive branch -> branch, create/ship branch -> branch, and manage production recipes.
UPDATE public.role_templates
SET permission_keys = (
      SELECT ARRAY_AGG(DISTINCT k.permission_key ORDER BY k.permission_key)
      FROM unnest(
        permission_keys || ARRAY[
          'menu:write',
          'inventory:transfer_create',
          'inventory:transfer_ship',
          'inventory:transfer_receive',
          'procurement:read'
        ]::TEXT[]
      ) AS k(permission_key)
    ),
    updated_at = now()
WHERE is_system = TRUE
  AND position_code = 'bep_truong';

-- Branch/area managers are not procurement operators. Branch managers still
-- keep transfer_create for one-step Cap bep and transfer_receive for inbound.
UPDATE public.role_templates
SET permission_keys = (
      SELECT ARRAY_AGG(DISTINCT k.permission_key ORDER BY k.permission_key)
      FROM unnest(permission_keys) AS k(permission_key)
      WHERE k.permission_key <> ALL(ARRAY[
        'procurement:read',
        'procurement:po_create',
        'procurement:grn_create',
        'procurement:grn_confirm'
      ]::TEXT[])
    ),
    updated_at = now()
WHERE is_system = TRUE
  AND position_code = 'quan_ly_CN';

-- Area managers are oversight/review, not daily transfer/procurement operators.
UPDATE public.role_templates
SET permission_keys = (
      SELECT ARRAY_AGG(DISTINCT k.permission_key ORDER BY k.permission_key)
      FROM unnest(permission_keys) AS k(permission_key)
      WHERE k.permission_key <> ALL(ARRAY[
        'inventory:transfer_create',
        'inventory:transfer_ship',
        'inventory:transfer_receive',
        'procurement:read',
        'procurement:po_create',
        'procurement:grn_create',
        'procurement:grn_confirm'
      ]::TEXT[])
    ),
    updated_at = now()
WHERE is_system = TRUE
  AND position_code = 'quan_ly_vung';

-- Backfill missing active bep_truong branch grants from its system template.
WITH target_profiles AS (
  SELECT
    p.id AS user_id,
    p.tenant_id,
    p.branch_id,
    rt.id AS template_id,
    rt.permission_keys
  FROM public.profiles p
  JOIN public.positions pos ON pos.id = p.position_id
  JOIN public.role_templates rt
    ON rt.tenant_id = p.tenant_id
   AND rt.position_code = pos.code
   AND rt.is_system = TRUE
  WHERE p.is_active = TRUE
    AND pos.code = 'bep_truong'
    AND p.branch_id IS NOT NULL
),
desired_grants AS (
  SELECT
    tp.user_id,
    tp.tenant_id,
    tp.branch_id,
    tp.template_id,
    unnest(tp.permission_keys) AS permission_key
  FROM target_profiles tp
)
INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_at,
  valid_from
)
SELECT
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  template_id,
  now(),
  now()
FROM desired_grants
ON CONFLICT (user_id, branch_id, permission_key) WHERE branch_id IS NOT NULL
DO NOTHING;

-- Expire template-derived grants that are no longer part of the user's current
-- system template. Manual overrides (source_template IS NULL or another
-- template) are preserved.
WITH stale_template_grants AS (
  SELECT sp.id
  FROM public.staff_permissions sp
  JOIN public.role_templates rt
    ON rt.id = sp.source_template
   AND rt.is_system = TRUE
  JOIN public.profiles p ON p.id = sp.user_id
  JOIN public.positions pos ON pos.id = p.position_id
  WHERE p.is_active = TRUE
    AND pos.code = rt.position_code
    AND rt.position_code IN ('quan_ly_CN', 'quan_ly_vung')
    AND sp.permission_key <> ALL(rt.permission_keys)
    AND sp.valid_from < now()
    AND (sp.valid_until IS NULL OR sp.valid_until > now())
)
UPDATE public.staff_permissions sp
SET valid_until = now()
FROM stale_template_grants stale
WHERE sp.id = stale.id;
