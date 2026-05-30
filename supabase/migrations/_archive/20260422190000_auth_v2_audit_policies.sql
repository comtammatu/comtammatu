-- Temporary audit helper — lists all RLS policies still referencing auth_role() or profiles.role.
-- Not a data migration; dropped at the end.

CREATE OR REPLACE FUNCTION public._auth_v2_list_legacy_policies()
RETURNS TABLE (schemaname TEXT, tablename TEXT, policyname TEXT, cmd TEXT, qual TEXT, with_check TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT schemaname::TEXT, tablename::TEXT, policyname::TEXT, cmd::TEXT, qual::TEXT, with_check::TEXT
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      qual ILIKE '%auth_role()%'
      OR with_check ILIKE '%auth_role()%'
      OR qual ILIKE '%profiles.role%'
      OR with_check ILIKE '%profiles.role%'
    )
  ORDER BY tablename, policyname;
$$;

REVOKE EXECUTE ON FUNCTION public._auth_v2_list_legacy_policies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._auth_v2_list_legacy_policies() TO service_role;
