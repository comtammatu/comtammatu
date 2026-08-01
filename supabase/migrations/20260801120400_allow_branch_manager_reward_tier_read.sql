CREATE OR REPLACE FUNCTION public.list_branch_revenue_target_reward_tiers(
  p_year_month date
)
RETURNS TABLE (
  branch_id bigint,
  reward_tiers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_branch bigint := public.auth_branch_id();
  v_month date;
  v_is_owner boolean;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_is_owner := public.auth_is_owner(v_uid)
    AND public.has_permission_any('finance:view');

  IF NOT v_is_owner
     AND NOT (v_role = 'branch_manager' AND v_branch IS NOT NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_year_month IS NULL THEN
    RAISE EXCEPTION 'invalid_year_month' USING ERRCODE = '22023';
  END IF;

  v_month := date_trunc('month', p_year_month::timestamp)::date;

  RETURN QUERY
  SELECT targets.branch_id, targets.reward_tiers
  FROM public.branch_revenue_targets targets
  WHERE targets.tenant_id = v_tenant
    AND targets.year_month = v_month
    AND (v_is_owner OR targets.branch_id = v_branch);
END;
$$;

COMMENT ON FUNCTION public.list_branch_revenue_target_reward_tiers(date) IS
  'Owner reward tier list or assigned-branch manager read-only KPI milestones.';

REVOKE ALL ON FUNCTION public.list_branch_revenue_target_reward_tiers(date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_branch_revenue_target_reward_tiers(date)
  TO authenticated, service_role;
