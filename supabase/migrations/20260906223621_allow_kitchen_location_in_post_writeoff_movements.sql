-- Migration: allow_kitchen_location_in_post_writeoff_movements
-- Allow kitchen and production_storage alongside warehouse in _post_writeoff_movements
-- so that auto-waste writeoffs from staff kitchen count slips can commit movements.

CREATE OR REPLACE FUNCTION public._post_writeoff_movements(p_issue_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM issue.id
  FROM public.stock_issues AS issue
  JOIN public.inventory_locations AS location
    ON location.id = issue.source_location_id
   AND location.tenant_id = issue.tenant_id
   AND location.branch_id = issue.branch_id
   AND location.location_kind = ANY (ARRAY['warehouse'::text, 'kitchen'::text, 'production_storage'::text])
   AND location.is_active IS TRUE
  JOIN public.branches AS branch
    ON branch.id = issue.branch_id
   AND branch.tenant_id = issue.tenant_id
   AND branch.is_active IS TRUE
  WHERE issue.id = p_issue_id
    AND issue.tenant_id = v_tenant
  FOR UPDATE OF issue, location;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_source_location_invalid'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.execute_post_writeoff_movements(p_issue_id);
END;
$$;

REVOKE ALL ON FUNCTION public._post_writeoff_movements(bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public._post_writeoff_movements(bigint) TO service_role;

COMMENT ON FUNCTION public._post_writeoff_movements(bigint) IS
  'Posts movements for a writeoff issue whose source location is an active warehouse, kitchen, or production storage.';
