CREATE OR REPLACE FUNCTION public.delete_branch_revenue_target(
  p_year_month date,
  p_branch_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_month date;
  v_deleted integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_year_month IS NULL OR p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_month := date_trunc('month', p_year_month::timestamp)::date;

  DELETE FROM public.branch_revenue_targets
  WHERE tenant_id = v_tenant
    AND branch_id = p_branch_id
    AND year_month = v_month;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'year_month', v_month,
    'branch_id', p_branch_id
  );
END;
$$;

COMMENT ON FUNCTION public.delete_branch_revenue_target(date, bigint) IS
  'Owner-only deletion of one branch monthly Doanh thu thuần target and reward tiers.';

REVOKE ALL ON FUNCTION public.delete_branch_revenue_target(date, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_branch_revenue_target(date, bigint)
  TO authenticated, service_role;
