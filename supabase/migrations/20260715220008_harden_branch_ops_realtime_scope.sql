SET search_path TO '';

-- The private branch operations channel carries operational refresh signals,
-- not permission-scoped actions. Keep its audience aligned to the live branch
-- assignment so a broad PBAC grant cannot widen Realtime visibility.
CREATE OR REPLACE FUNCTION public.can_read_branch_ops(p_branch_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.branches b
    JOIN public.profiles pr
      ON pr.id = auth.uid()
     AND pr.tenant_id = b.tenant_id
    WHERE b.id = p_branch_id
      AND b.tenant_id = public.auth_tenant_id()
      AND b.is_active IS TRUE
      AND pr.is_active IS TRUE
      AND (
        pr.branch_id = p_branch_id
        OR public.auth_is_owner(pr.id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_branch_ops(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_branch_ops(bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_read_branch_ops(bigint) IS
  'Authorizes private branch:{id}:ops topics: active owners may read active tenant branches; active non-owners may read only their assigned active branch.';
