-- =============================================================
-- Fix: print-agent uses service_role key, so auth.jwt() has no
-- app_metadata.tenant_id → auth_tenant_id() returns NULL → the
-- `tenant_id = auth_tenant_id()` predicate in claim_print_job /
-- complete_print_job is always FALSE, leaving jobs stuck pending.
--
-- Fix by bypassing the tenant predicate when the caller is
-- service_role. User-initiated callers (retry_print_job stays
-- unchanged) still enforce tenant isolation via their own guard.
-- =============================================================

CREATE OR REPLACE FUNCTION public.claim_print_job(p_job_id bigint, p_agent_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INT;
  v_is_service BOOLEAN := (auth.role() = 'service_role');
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  UPDATE public.print_jobs
    SET status = 'processing',
        claimed_by_agent = p_agent_id,
        claimed_at = now(),
        attempts = attempts + 1
    WHERE id = p_job_id
      AND status = 'pending'
      AND (v_is_service OR tenant_id = v_tenant);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_print_job(p_job_id bigint, p_success boolean, p_error text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service BOOLEAN := (auth.role() = 'service_role');
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  UPDATE public.print_jobs
    SET status = CASE WHEN p_success THEN 'printed' ELSE 'failed' END,
        printed_at = CASE WHEN p_success THEN now() ELSE printed_at END,
        last_error = CASE WHEN p_success THEN NULL ELSE p_error END
    WHERE id = p_job_id
      AND (v_is_service OR tenant_id = v_tenant);
END;
$function$;
