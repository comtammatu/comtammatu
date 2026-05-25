-- =============================================================
-- Grant KDS action permissions to branch managers
--
-- Route ACL already lets branch_manager open /br/[branchId]/kds, but
-- KDS actions are gated by Auth v2 permission keys:
--   - kds:mark_ready -> bump/ready, complete card, out-of-stock dispatch
--   - kds:recall     -> recall ready/preparing tickets
--
-- Keep grants branch-scoped. Do not grant KDS action keys to area managers
-- or POS-only roles in this migration.
-- =============================================================

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.permission_keys
    WHERE key IN ('kds:use', 'kds:mark_ready', 'kds:recall')
  ) <> 3 THEN
    RAISE EXCEPTION
      'branch_manager_kds_actions: required KDS permission keys are missing';
  END IF;
END $$;

UPDATE public.role_templates
SET permission_keys = (
      SELECT ARRAY_AGG(DISTINCT k.permission_key ORDER BY k.permission_key)
      FROM unnest(
        permission_keys || ARRAY[
          'kds:use',
          'kds:mark_ready',
          'kds:recall'
        ]::TEXT[]
      ) AS k(permission_key)
    ),
    updated_at = now()
WHERE position_code = 'quan_ly_CN'
  AND is_system = TRUE;

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
  pr.id,
  pr.tenant_id,
  pr.branch_id,
  k.permission_key,
  rt.id,
  now(),
  now()
FROM public.profiles pr
JOIN public.positions pos
  ON pos.id = pr.position_id
JOIN public.role_templates rt
  ON rt.tenant_id = pr.tenant_id
 AND rt.position_code = 'quan_ly_CN'
 AND rt.is_system = TRUE
CROSS JOIN (
  VALUES
    ('kds:use'),
    ('kds:mark_ready'),
    ('kds:recall')
) AS k(permission_key)
WHERE pr.is_active = TRUE
  AND pr.branch_id IS NOT NULL
  AND pos.code = 'quan_ly_CN'
ON CONFLICT (user_id, branch_id, permission_key) WHERE (branch_id IS NOT NULL)
DO NOTHING;

DO $$
DECLARE
  v_null_branch_managers INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_null_branch_managers
  FROM public.profiles pr
  JOIN public.positions pos
    ON pos.id = pr.position_id
  WHERE pr.is_active = TRUE
    AND pos.code = 'quan_ly_CN'
    AND pr.branch_id IS NULL;

  IF v_null_branch_managers > 0 THEN
    RAISE NOTICE
      'branch_manager_kds_actions: skipped % active branch manager(s) with NULL branch_id',
      v_null_branch_managers;
  END IF;
END $$;
