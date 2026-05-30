-- =============================================================
-- S3.1 Reprint audit: retry_count / last_retried_{at,by} columns
--   + retry_print_job(p_job_id) RPC (SECURITY DEFINER, audited)
-- =============================================================

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retried_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_retried_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.retry_print_job(p_job_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_tenant   BIGINT := public.auth_tenant_id();
  v_updated  INT;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context missing' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('printer:manage')
    OR public.has_permission_any('pos:print')
  ) THEN
    RAISE EXCEPTION 'permission denied: printer:manage' USING ERRCODE = '42501';
  END IF;

  UPDATE public.print_jobs
     SET status           = 'pending',
         last_error       = NULL,
         claimed_by_agent = NULL,
         claimed_at       = NULL,
         retry_count      = retry_count + 1,
         last_retried_at  = now(),
         last_retried_by  = v_uid
   WHERE id = p_job_id
     AND tenant_id = v_tenant
     AND status IN ('failed', 'expired');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_print_job(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_print_job(BIGINT) TO authenticated;
