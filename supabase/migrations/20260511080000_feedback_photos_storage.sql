-- =========================================================================
-- feedback module — Slice 3A: feedback photos storage bucket + policies
-- =========================================================================

-- Create private storage bucket for feedback photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-photos',
  'feedback-photos',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone with service_role can manage; authenticated SELECT scoped to tenant
-- Public submit uses service_role too (no user auth on /r/[token])
CREATE POLICY "feedback_photos_service_role_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'feedback-photos')
  WITH CHECK (bucket_id = 'feedback-photos');

CREATE POLICY "feedback_photos_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'feedback-photos'
    -- Path convention: <tenant_id>/<feedback_id>/<filename>
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

-- No INSERT/UPDATE/DELETE for authenticated — only service_role uploads via server actions.
