-- Sprint 1: Branch zones & tables
-- branch_zones → tables (for POS table selection in Sprint 2a)

-- ─── Branch Zones (e.g. "Tầng 1", "Sân vườn", "VIP") ───

CREATE TABLE public.branch_zones (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, branch_id, tenant_id)
);

CREATE INDEX idx_branch_zones_branch ON public.branch_zones(branch_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.branch_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Tables ───

CREATE TABLE public.tables (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  zone_id     BIGINT REFERENCES public.branch_zones(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  capacity    INT NOT NULL DEFAULT 4,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, branch_id, tenant_id)
);

CREATE INDEX idx_tables_branch ON public.tables(branch_id);
CREATE INDEX idx_tables_zone ON public.tables(zone_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RLS ───

ALTER TABLE public.branch_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation
CREATE POLICY "Tenant isolation" ON public.branch_zones
  FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "Tenant isolation" ON public.tables
  FOR SELECT USING (tenant_id = auth_tenant_id());

-- ALL: managers can manage
CREATE POLICY "Managers can manage" ON public.branch_zones
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );
CREATE POLICY "Managers can manage" ON public.tables
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tables TO authenticated;
