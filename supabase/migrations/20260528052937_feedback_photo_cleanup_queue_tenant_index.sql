-- =========================================================================
-- feedback module: retention photo cleanup queue tenant FK index
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_photo_cleanup_queue_tenant
  ON public.feedback_photo_cleanup_queue (tenant_id);
