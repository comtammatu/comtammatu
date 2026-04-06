-- =============================================================
-- M3 KDS: Station Configuration
-- kds_stations — physical/logical kitchen stations per branch
-- kds_station_categories — which menu categories route to which station
-- =============================================================

-- ─── kds_stations ───

CREATE TABLE public.kds_stations (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id  BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(branch_id, name, tenant_id)
);

-- Auto-update updated_at
CREATE TRIGGER trg_kds_stations_updated_at
  BEFORE UPDATE ON public.kds_stations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX idx_kds_stations_tenant ON public.kds_stations(tenant_id);
CREATE INDEX idx_kds_stations_branch ON public.kds_stations(branch_id);

-- RLS
ALTER TABLE public.kds_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kds_stations_select" ON public.kds_stations
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "kds_stations_insert" ON public.kds_stations
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

CREATE POLICY "kds_stations_update" ON public.kds_stations
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

CREATE POLICY "kds_stations_delete" ON public.kds_stations
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kds_stations TO authenticated;


-- ─── kds_station_categories ───
-- Maps which menu categories are displayed on which station.
-- An item's category determines which station(s) see it.

CREATE TABLE public.kds_station_categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  station_id  BIGINT NOT NULL REFERENCES public.kds_stations(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(station_id, category_id, tenant_id)
);

-- Indexes
CREATE INDEX idx_kds_station_categories_tenant ON public.kds_station_categories(tenant_id);
CREATE INDEX idx_kds_station_categories_station ON public.kds_station_categories(station_id);
CREATE INDEX idx_kds_station_categories_category ON public.kds_station_categories(category_id);

-- RLS
ALTER TABLE public.kds_station_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kds_station_categories_select" ON public.kds_station_categories
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "kds_station_categories_insert" ON public.kds_station_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.kds_stations ks
      WHERE ks.id = station_id
        AND ks.tenant_id = public.auth_tenant_id()
        AND (
          public.auth_role() IN ('owner', 'super_manager', 'area_manager')
          OR (public.auth_role() = 'branch_manager' AND ks.branch_id = public.auth_branch_id())
        )
    )
  );

CREATE POLICY "kds_station_categories_update" ON public.kds_station_categories
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.kds_stations ks
      WHERE ks.id = station_id
        AND ks.tenant_id = public.auth_tenant_id()
        AND (
          public.auth_role() IN ('owner', 'super_manager', 'area_manager')
          OR (public.auth_role() = 'branch_manager' AND ks.branch_id = public.auth_branch_id())
        )
    )
  );

CREATE POLICY "kds_station_categories_delete" ON public.kds_station_categories
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.kds_stations ks
      WHERE ks.id = station_id
        AND ks.tenant_id = public.auth_tenant_id()
        AND (
          public.auth_role() IN ('owner', 'super_manager', 'area_manager')
          OR (public.auth_role() = 'branch_manager' AND ks.branch_id = public.auth_branch_id())
        )
    )
  );

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kds_station_categories TO authenticated;


-- ─── Enable Supabase Realtime on order_items ───
-- KDS subscribes to order_items changes for live updates.
-- orders table is also needed for status changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
