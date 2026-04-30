-- =============================================================
-- Tenant timezone + JWT claim
-- - Adds tenants.timezone (tenant-wide source of truth for date/time
--   formatting in UI and "today/period" boundary computation).
-- - Updates custom_access_token_hook to inject `tenant_timezone` claim
--   so server actions and the client UI can format times without ever
--   reading the user's PC clock/timezone.
-- - Keeps branches.timezone untouched: existing SQL paths
--   (inventory_shift_key, GRN express window) continue to read it.
-- =============================================================

-- 1. Tenants column ------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

COMMENT ON COLUMN public.tenants.timezone IS
  'IANA timezone (e.g. Asia/Ho_Chi_Minh). Single source of truth for UI date/time formatting; injected into JWT as `tenant_timezone` claim.';

-- 2. JWT hook: re-create with tenant_timezone claim ----------------------
-- MUST stay SECURITY DEFINER (rule AUTH_HOOK_SECURITY_DEFINER) and MUST
-- continue to emit existing claims unchanged (rule
-- JWT-CLAIMS-NOT-IN-APP-METADATA consumers depend on tenant_id/branch_id/
-- user_role).
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
    p.role::text AS user_role,
    t.timezone   AS tenant_timezone
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF user_profile.tenant_id IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'user_role', user_profile.user_role,
        'tenant_timezone', COALESCE(user_profile.tenant_timezone, 'Asia/Ho_Chi_Minh')
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
