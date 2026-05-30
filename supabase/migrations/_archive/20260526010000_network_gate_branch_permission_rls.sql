-- =============================================================
-- Network gate — branch-scoped settings:branch_network RLS
-- =============================================================
-- Tighten DML on branch_trusted_egress_ips from legacy role checks to the
-- Auth v2 permission key. Keep SELECT policy unchanged because proxy.ts
-- reads this table with the POS/KDS user's session while checking whether
-- the current request IP is trusted.

DROP POLICY IF EXISTS "btei_insert" ON public.branch_trusted_egress_ips;
DROP POLICY IF EXISTS "btei_update" ON public.branch_trusted_egress_ips;
DROP POLICY IF EXISTS "btei_delete" ON public.branch_trusted_egress_ips;

CREATE POLICY "btei_insert" ON public.branch_trusted_egress_ips
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
    AND public.has_permission(branch_id, 'settings:branch_network')
  );

CREATE POLICY "btei_update" ON public.branch_trusted_egress_ips
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
    AND public.has_permission(branch_id, 'settings:branch_network')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
    AND public.has_permission(branch_id, 'settings:branch_network')
  );

CREATE POLICY "btei_delete" ON public.branch_trusted_egress_ips
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public._auth_v2_is_owner(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
  );

COMMENT ON POLICY "btei_insert" ON public.branch_trusted_egress_ips IS
  'Auth v2: branch-scoped settings:branch_network controls trusted-IP writes.';

COMMENT ON POLICY "btei_update" ON public.branch_trusted_egress_ips IS
  'Auth v2: branch-scoped settings:branch_network controls trusted-IP revoke/retrust.';

COMMENT ON POLICY "btei_delete" ON public.branch_trusted_egress_ips IS
  'Hard delete remains owner-only; normal revocation is a soft delete via revoked_at.';
