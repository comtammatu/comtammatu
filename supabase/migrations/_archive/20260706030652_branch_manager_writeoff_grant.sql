-- Grant branch managers manual waste/writeoff access without replaying the older
-- stock-transfer RPC body from 20260702094500_branch_stock_operator_actions.sql.

UPDATE public.role_templates
SET permission_keys = ARRAY(
  SELECT DISTINCT unnest(
    COALESCE(permission_keys, ARRAY[]::text[]) || ARRAY['inventory:writeoff']
  ) ORDER BY 1
)
WHERE position_code = 'branch_manager';

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
  p.id,
  p.tenant_id,
  p.branch_id,
  'inventory:writeoff',
  rt.id,
  now(),
  now()
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
LEFT JOIN public.role_templates rt
  ON rt.tenant_id = p.tenant_id
 AND rt.position_code = 'branch_manager'
WHERE po.code = 'branch_manager'
  AND p.branch_id IS NOT NULL
  AND p.is_active IS DISTINCT FROM false
ON CONFLICT (user_id, branch_id, permission_key) WHERE branch_id IS NOT NULL
DO UPDATE SET
  source_template = COALESCE(public.staff_permissions.source_template, EXCLUDED.source_template);
