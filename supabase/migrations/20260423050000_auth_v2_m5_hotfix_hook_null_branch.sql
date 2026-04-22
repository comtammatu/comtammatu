-- =============================================================
-- Auth v2 — M5 hotfix: JWT hook NULL-branch bug
--
-- `IF user_profile IS NOT NULL` in plpgsql is TRUE only when ALL row
-- fields are non-null. area_manager / office / super_manager have
-- `branch_id IS NULL`, so the whole claims block was skipped — users
-- logged in with empty app_metadata and failed RLS everywhere.
-- Fix: check a column that is guaranteed non-null after the SELECT
-- matches (tenant_id).
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

  SELECT
    p.tenant_id,
    p.branch_id,
    COALESCE(po.legacy_role_code, 'office')     AS user_role,
    COALESCE(po.code,             'unassigned') AS position_code
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = (event ->> 'user_id')::uuid
  LIMIT 1;

  -- Row found iff tenant_id is present (NOT NULL constraint).
  -- Avoid `user_profile IS NOT NULL` which requires every field non-null.
  IF user_profile.tenant_id IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'user_role', user_profile.user_role,
        'position',  user_profile.position_code
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
