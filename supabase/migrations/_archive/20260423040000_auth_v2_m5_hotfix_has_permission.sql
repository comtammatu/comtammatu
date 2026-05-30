-- =============================================================
-- Auth v2 — M5 hotfix: has_permission()/has_permission_any()
-- still read pr.role in the owner-bypass subquery. After profiles.role
-- drop, those reads error with "column pr.role does not exist".
-- Remove the fallback — position lookup alone is sufficient.
-- Same fix for _auth_v2_is_owner().
-- =============================================================

CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id BIGINT, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles pr
      JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid() AND po.code = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;

CREATE OR REPLACE FUNCTION public.has_permission_any(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles pr
      JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid() AND po.code = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;

CREATE OR REPLACE FUNCTION public._auth_v2_is_owner(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    JOIN public.positions po ON po.id = pr.position_id
    WHERE pr.id = p_user AND po.code = 'owner'
  );
$$;
