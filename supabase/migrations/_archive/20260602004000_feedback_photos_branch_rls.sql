-- =============================================================
-- Feedback hardening: branch-tight Storage RLS for feedback photos
-- =============================================================

DROP POLICY IF EXISTS "feedback_photos_authenticated_select" ON storage.objects;

CREATE POLICY "feedback_photos_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'feedback-photos'
    -- Path convention: <tenant_id>/<feedback_id>/<filename>
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    AND EXISTS (
      SELECT 1
      FROM public.feedbacks f
      WHERE f.id = CASE
          WHEN (storage.foldername(name))[2] ~ '^[0-9]{1,18}$'
            THEN ((storage.foldername(name))[2])::BIGINT
          ELSE NULL::BIGINT
        END
        AND f.tenant_id::TEXT = (storage.foldername(name))[1]
        AND f.tenant_id = public.auth_tenant_id()
        AND public.has_permission(f.branch_id, 'feedback:view')
    )
  );

COMMENT ON POLICY "feedback_photos_authenticated_select" ON storage.objects IS
  'Feedback photos direct authenticated reads require tenant path match plus feedback:view on the feedback row branch. Service-role upload/delete and signed URL creation remain server-side.';
