-- =============================================================
-- Auth v2 — M3: JWT hook dual-emit
-- Adds `position` claim alongside existing {tenant_id, branch_id, user_role}.
-- Legacy `auth_role()` helper + RLS policies keep working unchanged.
-- New code can read `position`; RLS cutover in M4 will start reading position
-- via current_position() / has_position().
-- =============================================================

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

  -- Fetch profile + resolved position code for this user
  SELECT
    p.tenant_id,
    p.branch_id,
    p.role::text                  AS user_role,
    COALESCE(po.code, p.role::text) AS position_code
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
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
        'user_role', user_profile.user_role,   -- legacy, will drop in M5
        'position',  user_profile.position_code -- new canonical claim
      )
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Re-grant (idempotent)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;
