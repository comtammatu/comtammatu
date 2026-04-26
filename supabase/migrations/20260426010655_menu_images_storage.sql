-- Menu item image storage bucket + RLS.
-- Bucket: menu-images (public read; write requires menu:write).
-- Path layout: {tenant_id}/{filename}.{ext} (tenant prefix enforced by RLS).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-images',
  'menu-images',
  true,                                                    -- public read
  5242880,                                                  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- INSERT: tenant-scoped + menu:write
DROP POLICY IF EXISTS "menu_images_insert" ON storage.objects;
CREATE POLICY "menu_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
    AND public.has_permission_any('menu:write')
  );

-- UPDATE: same gate
DROP POLICY IF EXISTS "menu_images_update" ON storage.objects;
CREATE POLICY "menu_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
  )
  WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
    AND public.has_permission_any('menu:write')
  );

-- DELETE: same gate
DROP POLICY IF EXISTS "menu_images_delete" ON storage.objects;
CREATE POLICY "menu_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::TEXT
    AND public.has_permission_any('menu:write')
  );

-- READ: public (POS / KDS / public menu pages)
DROP POLICY IF EXISTS "menu_images_read" ON storage.objects;
CREATE POLICY "menu_images_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'menu-images');
