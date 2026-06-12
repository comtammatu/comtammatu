-- Requires ownership of storage.objects. If a normal migration role cannot own
-- storage.objects, run this through the owner-capable Supabase SQL path.

BEGIN;

DROP POLICY IF EXISTS "inv_attach_read" ON storage.objects;
DROP POLICY IF EXISTS "menu_images_read" ON storage.objects;

COMMIT;
