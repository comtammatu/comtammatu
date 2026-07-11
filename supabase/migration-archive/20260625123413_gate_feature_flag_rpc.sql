CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_branch_id bigint,
  p_flag_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT bff.enabled
    FROM public.branch_feature_flags bff
    JOIN public.branches b ON b.id = bff.branch_id
    WHERE bff.branch_id = p_branch_id
      AND bff.flag_key = p_flag_key
      AND (
        auth.role() = 'service_role'
        OR b.tenant_id = public.auth_tenant_id()
      )
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_feature_enabled(bigint, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(bigint, text)
TO authenticated, service_role;
