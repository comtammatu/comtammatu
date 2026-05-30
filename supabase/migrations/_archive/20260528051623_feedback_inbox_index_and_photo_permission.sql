-- =========================================================================
-- feedback module — inbox hot-path index + photo permission hardening
-- =========================================================================
--
-- `/admin/feedback` reads tenant-wide rows from feedbacks_with_masked_phone
-- filtered by tenant_id and ordered by created_at DESC. The existing
-- `(tenant_id, branch_id, created_at DESC)` index is still needed for
-- branch-scoped reads, but it cannot satisfy tenant-wide created_at ordering
-- across all branches because branch_id sits before created_at.

CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_created
  ON public.feedbacks (tenant_id, created_at DESC);

COMMENT ON INDEX public.idx_feedbacks_tenant_created IS
  'Hot path for /admin/feedback tenant-wide inbox: tenant_id filter ordered by created_at DESC.';
