UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
]
WHERE id = 'inventory-attachments';

DROP POLICY IF EXISTS "inv_attach_insert" ON storage.objects;
CREATE POLICY "inv_attach_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(name))[1] = (auth_tenant_id())::text
  AND (
    has_permission(NULL::bigint, 'procurement:grn_create')
    OR has_permission(NULL::bigint, 'supplier_return:create')
    OR CASE
      WHEN (storage.foldername(name))[2] = 'waste'
        AND (storage.foldername(name))[3] ~ '^[1-9][0-9]*$'
      THEN has_permission(
        ((storage.foldername(name))[3])::bigint,
        'inventory:writeoff'
      )
      ELSE false
    END
  )
);
