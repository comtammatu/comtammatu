-- =============================================================
-- Fix branches SELECT RLS for managers (owner, super_manager,
-- area_manager, branch_manager) and align JWT helpers with the app.
--
-- Root causes addressed:
--   1. auth_area_id() used request.jwt.claims while auth_tenant_id /
--      auth_role use auth.jwt() — inconsistent paths can yield NULL.
--   2. auth_role() only read user_role; legacy app_metadata.role was ignored
--      (TypeScript extractClaims falls back to role).
--   3. branches_select required area_manager to resolve branches only via
--      area_branches + auth_area_id. Empty junction or NULL area_id → zero rows,
--      unlike orders/payments/kds where area_manager is tenant-wide when
--      branch_id in JWT is NULL.
--   4. branch_manager with stale JWT (NULL branch_id) saw no branch rows;
--      fall back to profiles.branch_id for the same user.
-- =============================================================

-- ─── 1. auth_role — legacy "role" key (matches extractClaims in scope.ts) ───

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'role'
  );
$$;

-- ─── 2. auth_area_id — same JWT source as auth_tenant_id / auth_branch_id ───

CREATE OR REPLACE FUNCTION public.auth_area_id()
RETURNS BIGINT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    auth.jwt() -> 'app_metadata' ->> 'area_id',
    ''
  )::BIGINT;
$$;

-- ─── 3. branches_select — align area_manager with other tenant-wide tables ───

DROP POLICY IF EXISTS "branches_select" ON public.branches;

CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'office', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'cashier', 'waiter', 'chef')
        AND id = COALESCE(
          public.auth_branch_id(),
          (SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
    )
  );
