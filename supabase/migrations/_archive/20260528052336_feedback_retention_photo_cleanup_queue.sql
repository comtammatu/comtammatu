-- =========================================================================
-- feedback module: retention photo cleanup queue
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.feedback_photo_cleanup_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feedback_id BIGINT NULL,
  bucket_id TEXT NOT NULL DEFAULT 'feedback-photos'
    CHECK (bucket_id = 'feedback-photos'),
  path TEXT NOT NULL CHECK (length(path) BETWEEN 1 AND 1024),
  reason TEXT NOT NULL CHECK (reason IN ('feedback_retention_deleted')),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  last_error TEXT NULL CHECK (last_error IS NULL OR length(last_error) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_photo_cleanup_queue_bucket_path
  ON public.feedback_photo_cleanup_queue (bucket_id, path);

CREATE INDEX IF NOT EXISTS idx_feedback_photo_cleanup_queue_pending
  ON public.feedback_photo_cleanup_queue (queued_at, id)
  WHERE processed_at IS NULL;

ALTER TABLE public.feedback_photo_cleanup_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_photo_cleanup_queue FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feedback_photo_cleanup_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.feedback_photo_cleanup_queue FROM anon;
REVOKE ALL ON TABLE public.feedback_photo_cleanup_queue FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feedback_photo_cleanup_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.feedback_photo_cleanup_queue_id_seq TO service_role;

DROP POLICY IF EXISTS "feedback_photo_cleanup_queue_service_all"
  ON public.feedback_photo_cleanup_queue;
CREATE POLICY "feedback_photo_cleanup_queue_service_all"
  ON public.feedback_photo_cleanup_queue
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.feedback_photo_cleanup_queue IS
  'Service-role queue of private feedback photo object paths that must be deleted through the Supabase Storage API.';
COMMENT ON COLUMN public.feedback_photo_cleanup_queue.path IS
  'Object path inside the private feedback-photos bucket. Delete through Storage API, never by deleting storage.objects rows.';

CREATE OR REPLACE FUNCTION public.feedback_retention_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_nulled INT;
  v_ip_nulled INT;
  v_text_deleted INT;
  v_outbox_deleted INT;
  v_photo_paths_queued INT;
BEGIN
  -- Phone retention 6 months: auto-NULL.
  UPDATE feedbacks
  SET phone = NULL
  WHERE phone IS NOT NULL
    AND created_at < NOW() - INTERVAL '6 months';
  GET DIAGNOSTICS v_phone_nulled = ROW_COUNT;

  -- IP hash retention 3 months: auto-NULL.
  UPDATE feedbacks
  SET submit_ip_hash = NULL
  WHERE submit_ip_hash IS NOT NULL
    AND created_at < NOW() - INTERVAL '3 months';
  GET DIAGNOSTICS v_ip_nulled = ROW_COUNT;

  -- Comment text retention 24 months: queue photos, then delete feedback rows.
  WITH expired_feedback AS MATERIALIZED (
    SELECT id, tenant_id, photo_paths
    FROM feedbacks
    WHERE created_at < NOW() - INTERVAL '24 months'
  ),
  queued AS (
    INSERT INTO public.feedback_photo_cleanup_queue (
      tenant_id,
      feedback_id,
      path,
      reason
    )
    SELECT
      f.tenant_id,
      f.id,
      p.path,
      'feedback_retention_deleted'
    FROM expired_feedback f
    CROSS JOIN LATERAL unnest(f.photo_paths) AS p(path)
    WHERE p.path IS NOT NULL
      AND p.path <> ''
    ON CONFLICT (bucket_id, path) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_photo_paths_queued FROM queued;

  DELETE FROM feedbacks
  WHERE created_at < NOW() - INTERVAL '24 months';
  GET DIAGNOSTICS v_text_deleted = ROW_COUNT;

  -- Outbox sent rows: delete after 30 days.
  DELETE FROM telegram_outbox
  WHERE status = 'sent'
    AND sent_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_outbox_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'phone_nulled', v_phone_nulled,
    'ip_nulled', v_ip_nulled,
    'text_deleted', v_text_deleted,
    'outbox_deleted', v_outbox_deleted,
    'photo_paths_queued', v_photo_paths_queued
  );
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_retention_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.feedback_retention_cleanup() FROM anon;
REVOKE ALL ON FUNCTION public.feedback_retention_cleanup() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_retention_cleanup() TO service_role;
