-- D093 follow-up: make transfer_create delegable and sync live staff_permissions.

UPDATE public.permission_keys
SET is_delegable_to_staff = true,
    description = coalesce(
      description,
      'Create stock transfer drafts (central fulfill / logistics)'
    )
WHERE key = 'inventory:transfer_create';

-- branch_manager: request create/submit/cancel (branch-scoped)
INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by
)
SELECT
  profile.id,
  profile.tenant_id,
  profile.branch_id,
  key.permission_key,
  template.id,
  NULL
FROM public.profiles AS profile
JOIN public.positions AS position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
JOIN public.role_templates AS template
  ON template.tenant_id = profile.tenant_id
 AND template.position_code = position.code
CROSS JOIN (
  VALUES
    ('inventory:request_create'),
    ('inventory:request_submit'),
    ('inventory:request_cancel')
) AS key(permission_key)
WHERE position.code = 'branch_manager'
  AND COALESCE(profile.is_active, true)
  AND profile.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions AS existing
    WHERE existing.user_id = profile.id
      AND existing.tenant_id = profile.tenant_id
      AND existing.permission_key = key.permission_key
      AND existing.branch_id IS NOT DISTINCT FROM profile.branch_id
  );

-- central ops: request_fulfill + transfer_create (branch-scoped to their site)
INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by
)
SELECT
  profile.id,
  profile.tenant_id,
  profile.branch_id,
  key.permission_key,
  template.id,
  NULL
FROM public.profiles AS profile
JOIN public.positions AS position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
JOIN public.role_templates AS template
  ON template.tenant_id = profile.tenant_id
 AND template.position_code = position.code
CROSS JOIN (
  VALUES
    ('inventory:request_fulfill'),
    ('inventory:transfer_create')
) AS key(permission_key)
WHERE position.code IN ('central_supply_ops', 'central_kitchen_lead')
  AND COALESCE(profile.is_active, true)
  AND profile.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions AS existing
    WHERE existing.user_id = profile.id
      AND existing.tenant_id = profile.tenant_id
      AND existing.permission_key = key.permission_key
      AND existing.branch_id IS NOT DISTINCT FROM profile.branch_id
  );
