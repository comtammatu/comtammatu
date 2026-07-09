SET search_path = '';

-- Deactivating a profile (toggle_profile_active) only flips profiles.is_active;
-- it does not revoke staff_permissions or the auth session. has_permission /
-- has_permission_any previously gated only on grant validity, so a deactivated
-- user kept every permission usable via direct PostgREST RPC calls until the
-- grant's own valid_until (often never). Add the is_active predicate the owner
-- branch (auth_is_owner) already enforces.

CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id bigint, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.auth_is_owner(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      JOIN public.profiles pr ON pr.id = sp.user_id
      WHERE sp.user_id = auth.uid()
        AND COALESCE(pr.is_active, true) = true
        AND sp.permission_key = p_key
        AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_permission_any(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.auth_is_owner(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      JOIN public.profiles pr ON pr.id = sp.user_id
      WHERE sp.user_id = auth.uid()
        AND COALESCE(pr.is_active, true) = true
        AND sp.permission_key = p_key
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$function$;
