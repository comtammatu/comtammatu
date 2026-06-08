-- Rollback M3: restore original hook (no position claim).
-- Copy of supabase/migrations/20260401000001_jwt_custom_claims_hook.sql body.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims JSONB;
  user_profile RECORD;
BEGIN
  claims := event -> 'claims';

  SELECT p.tenant_id, p.branch_id, p.role::text AS user_role
  INTO user_profile
  FROM public.profiles p
  WHERE p.id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF user_profile IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'user_role', user_profile.user_role
      )
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;
