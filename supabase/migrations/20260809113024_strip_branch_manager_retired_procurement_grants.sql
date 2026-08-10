-- R08/R09: strip branch_manager retired procurement / supplier-return grants.
-- Daily supplier-return UI is retired; BM shell is /br stock ops only (YCH, not PO/NCC).
-- Owner|Accountant keep procurement:read (+ PO); central keep supplier_manage / GRN reads.
-- Live staff_permissions for BM profiles are deleted for these keys (template is not additive-only).

UPDATE public.role_templates AS template
SET permission_keys = (
  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[])
  FROM unnest(
    array_remove(
      array_remove(
        array_remove(
          array_remove(
            array_remove(template.permission_keys, 'procurement:read'),
            'procurement:supplier_manage'
          ),
          'supplier_return:read'
        ),
        'supplier_return:create'
      ),
      'supplier_return:confirm'
    )
  ) AS k
),
updated_at = now()
WHERE template.position_code = 'branch_manager';

DELETE FROM public.staff_permissions AS permission
USING public.profiles AS profile,
      public.positions AS position
WHERE profile.id = permission.user_id
  AND profile.tenant_id = permission.tenant_id
  AND position.id = profile.position_id
  AND position.tenant_id = profile.tenant_id
  AND position.code = 'branch_manager'
  AND permission.permission_key IN (
    'procurement:read',
    'procurement:supplier_manage',
    'supplier_return:read',
    'supplier_return:create',
    'supplier_return:confirm'
  );
