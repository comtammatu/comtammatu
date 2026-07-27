ALTER POLICY "inv_attach_insert"
ON storage.objects
TO authenticated
WITH CHECK (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND (
    (
      (storage.foldername(storage.objects.name))[2] = 'grn'
      AND EXISTS (
        SELECT 1
        FROM public.goods_received_notes AS grn
        WHERE grn.id = CASE
            WHEN COALESCE(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (storage.foldername(storage.objects.name))[3]::bigint
          END
          AND grn.tenant_id = (SELECT public.auth_tenant_id())
          AND (
            (
              grn.status = 'draft'
              AND public.has_permission(
                grn.branch_id,
                'procurement:grn_create'
              )
            )
            OR (
              grn.status = 'confirmed'
              AND public.has_permission(
                grn.branch_id,
                'procurement:grn_amend'
              )
            )
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'stock-issues'
      AND EXISTS (
        SELECT 1
        FROM public.stock_issues AS issue
        WHERE issue.id = CASE
            WHEN COALESCE(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (storage.foldername(storage.objects.name))[3]::bigint
          END
          AND issue.tenant_id = (SELECT public.auth_tenant_id())
          AND issue.status = 'draft'
          AND issue.issue_type = 'consumption'
          AND public.has_permission(issue.branch_id, 'inventory:write')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'branches'
      AND (storage.foldername(storage.objects.name))[4] = 'waste'
      AND EXISTS (
        SELECT 1
        FROM public.branches AS branch
        WHERE branch.id = CASE
            WHEN COALESCE(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (storage.foldername(storage.objects.name))[3]::bigint
          END
          AND branch.tenant_id = (SELECT public.auth_tenant_id())
          AND branch.is_active IS TRUE
          AND public.has_permission(branch.id, 'inventory:writeoff')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'waste'
      AND public.auth_role() = 'owner'
    )
  )
);
