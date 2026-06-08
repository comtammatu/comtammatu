-- =============================================================
-- Sprint 1 S5: Tables & Zones
-- Tables: branch_zones, tables
-- =============================================================

-- ========================
-- 1. branch_zones
-- ========================
CREATE TABLE public.branch_zones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name, tenant_id)
);

CREATE INDEX idx_branch_zones_tenant ON public.branch_zones(tenant_id);
CREATE INDEX idx_branch_zones_branch ON public.branch_zones(branch_id);

ALTER TABLE public.branch_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.branch_zones
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.branch_zones
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_update" ON public.branch_zones
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_delete" ON public.branch_zones
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_zones TO authenticated;

-- ========================
-- 2. tables
-- ========================
CREATE TABLE public.tables (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  zone_id BIGINT REFERENCES public.branch_zones(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number INT NOT NULL,
  capacity INT NOT NULL DEFAULT 4 CHECK (capacity > 0),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, number, tenant_id)
);

CREATE INDEX idx_tables_tenant ON public.tables(tenant_id);
CREATE INDEX idx_tables_branch ON public.tables(branch_id);
CREATE INDEX idx_tables_zone ON public.tables(zone_id);

CREATE TRIGGER trg_tables_updated_at
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.tables
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.tables
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_update" ON public.tables
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_delete" ON public.tables
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tables TO authenticated;
