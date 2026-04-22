-- =============================================================
-- Auth v2 — M4c cleanup: final branches_select + drop audit helper
-- =============================================================

-- branches SELECT — open to any authenticated user in tenant.
-- Branch selector UI needs this for every role; no permission gating required.
DROP POLICY IF EXISTS "branches_select" ON public.branches;

CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- Remove audit helper (no longer needed)
DROP FUNCTION IF EXISTS public._auth_v2_list_legacy_policies();
