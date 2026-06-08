-- =========================================================================
-- POS/KDS Network Gate — branch_trusted_egress_ips
--
-- Purpose: Restrict /br/[branchId]/{pos,kds} to devices sharing NAT egress
-- IP with the branch's print-agent. Print-agent registers its egress IP
-- every 5 min via /api/branch-presence; proxy.ts checks request IP against
-- this table. Defense-in-depth ONLY — RLS + JWT remain authoritative for
-- data access (PostgREST direct calls bypass the proxy gate).
--
-- Design notes:
--   - INET column (not TEXT) for IPv4/IPv6 dual-stack normalization.
--   - Soft delete via revoked_at (audit trail kept).
--   - UNIQUE(tenant_id, branch_id, ip_address): same IP CAN appear under
--     different tenants (CGNAT shared egress), but NOT duplicate within
--     a tenant's branch.
--   - registered_via='manual' for admin bootstrap; 'agent' for heartbeat.
--   - Agent rows expire when last_seen_at < now() - 30 min (proxy logic).
--
-- See: tasks/regressions.md POS-NETWORK-GATE-* rules.
-- =========================================================================

CREATE TABLE public.branch_trusted_egress_ips (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  registered_via TEXT NOT NULL CHECK (registered_via IN ('agent', 'manual')),
  registered_by_agent_id TEXT,
  registered_by_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, ip_address)
);

COMMENT ON TABLE public.branch_trusted_egress_ips IS
  'POS/KDS network gate. Print-agent registers branch NAT egress IP every 5 min; '
  'proxy.ts blocks /br/*/{pos,kds} from non-matching IPs within 30-min grace. '
  'Defense-in-depth only — does NOT replace RLS/JWT for data access.';

CREATE INDEX idx_btei_branch_active
  ON public.branch_trusted_egress_ips (branch_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_btei_tenant
  ON public.branch_trusted_egress_ips (tenant_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────
-- SELECT: tenant-scoped + branch-scoped for staff, cross-branch for admin
-- INSERT/UPDATE/DELETE: owner/super_manager only (security boundary).
-- Edge route uses service_role client which bypasses RLS — no policy needed.

ALTER TABLE public.branch_trusted_egress_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btei_select" ON public.branch_trusted_egress_ips
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "btei_insert" ON public.branch_trusted_egress_ips
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "btei_update" ON public.branch_trusted_egress_ips
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "btei_delete" ON public.branch_trusted_egress_ips
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'owner'
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.branch_trusted_egress_ips TO authenticated;

-- ─── Permission key for managing trusted IPs ─────────────────────────────
-- Separate from settings:branch — bootstrapping a network trust has higher
-- blast radius (any device on that NAT gets POS access) than tweaking branch
-- hours. Allows org to grant network management to IT lead without giving
-- broad branch-edit rights.

INSERT INTO public.permission_keys (key, module, description, scope)
VALUES
  ('settings:branch_network', 'settings',
    'Quản lý danh sách IP tin cậy của chi nhánh (cổng mạng POS/KDS)',
    'branch')
ON CONFLICT (key) DO NOTHING;
