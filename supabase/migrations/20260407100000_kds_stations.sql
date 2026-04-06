-- =============================================================
-- M3-S1: KDS Stations + Station-Category Mapping
-- =============================================================

-- ─── kds_stations ───

CREATE TABLE public.kds_stations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, branch_id, tenant_id)
);

CREATE INDEX idx_kds_stations_branch ON public.kds_stations(branch_id);

CREATE TRIGGER trg_kds_stations_updated_at
  BEFORE UPDATE ON public.kds_stations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.kds_stations ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user in the same tenant
CREATE POLICY "tenant_select" ON public.kds_stations
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- INSERT: branch_manager + management roles
CREATE POLICY "management_insert" ON public.kds_stations
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

-- UPDATE: branch_manager + management roles
CREATE POLICY "management_update" ON public.kds_stations
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

-- DELETE: branch_manager + management roles
CREATE POLICY "management_delete" ON public.kds_stations
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kds_stations TO authenticated;


-- ─── kds_station_categories ───

CREATE TABLE public.kds_station_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  station_id BIGINT NOT NULL REFERENCES public.kds_stations(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  UNIQUE(station_id, category_id, tenant_id)
);

CREATE INDEX idx_kds_station_categories_station ON public.kds_station_categories(station_id);
CREATE INDEX idx_kds_station_categories_category ON public.kds_station_categories(category_id);

ALTER TABLE public.kds_station_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user in the same tenant
CREATE POLICY "tenant_select" ON public.kds_station_categories
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- INSERT: branch_manager + management roles
CREATE POLICY "management_insert" ON public.kds_station_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

-- UPDATE: branch_manager + management roles
CREATE POLICY "management_update" ON public.kds_station_categories
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

-- DELETE: branch_manager + management roles
CREATE POLICY "management_delete" ON public.kds_station_categories
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kds_station_categories TO authenticated;
