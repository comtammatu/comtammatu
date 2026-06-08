-- Migration: bulk_mark_feedback_suspect RPC
-- Allows authenticated users with feedback:moderate permission to bulk-update
-- is_suspect on feedbacks within their tenant.
-- SECURITY DEFINER avoids needing UPDATE grant on feedbacks table directly.

CREATE OR REPLACE FUNCTION public.bulk_mark_feedback_suspect(
  p_feedback_ids BIGINT[],
  p_is_suspect BOOLEAN
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_updated   INT;
BEGIN
  v_tenant_id := (auth.jwt() ->> 'tenant_id')::BIGINT;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'missing tenant context' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_permission_any('feedback:moderate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;

  UPDATE feedbacks
  SET    is_suspect = p_is_suspect
  WHERE  id        = ANY(p_feedback_ids)
    AND  tenant_id = v_tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_mark_feedback_suspect(BIGINT[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_mark_feedback_suspect(BIGINT[], BOOLEAN) TO authenticated;
