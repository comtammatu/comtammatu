-- =============================================================
-- Inventory Location Ledger — Phase 1
-- Introduce inventory_locations with zero behavior change.
-- This migration does NOT modify stock_levels / stock_movements /
-- stock_transfers / stock_issues yet. It only creates locations and
-- seeds one default location per branch for future cutover.
-- =============================================================

-- ─── 1. inventory_locations ───

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id              BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id              BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  code                   TEXT NOT NULL,
  name                   TEXT NOT NULL,
  location_kind          TEXT NOT NULL DEFAULT 'warehouse'
                         CHECK (location_kind IN ('warehouse', 'kitchen', 'receiving', 'production_storage')),
  is_active              BOOLEAN NOT NULL DEFAULT true,
  is_default_receive     BOOLEAN NOT NULL DEFAULT false,
  is_default_issue       BOOLEAN NOT NULL DEFAULT false,
  is_default_consumption BOOLEAN NOT NULL DEFAULT false,
  sort_order             INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (code, branch_id, tenant_id)
);

DROP TRIGGER IF EXISTS trg_inventory_locations_updated_at ON public.inventory_locations;

CREATE TRIGGER trg_inventory_locations_updated_at
  BEFORE UPDATE ON public.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_inventory_locations_tenant
  ON public.inventory_locations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_branch
  ON public.inventory_locations(branch_id);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_kind
  ON public.inventory_locations(tenant_id, location_kind);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_one_default_receive
  ON public.inventory_locations(branch_id, tenant_id)
  WHERE is_default_receive = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_one_default_issue
  ON public.inventory_locations(branch_id, tenant_id)
  WHERE is_default_issue = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_one_default_consumption
  ON public.inventory_locations(branch_id, tenant_id)
  WHERE is_default_consumption = true AND is_active = true;

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_locations_select" ON public.inventory_locations;

CREATE POLICY "inventory_locations_select" ON public.inventory_locations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'office', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'cashier', 'waiter', 'chef')
        AND branch_id = COALESCE(
          public.auth_branch_id(),
          (SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "inventory_locations_manage" ON public.inventory_locations;

CREATE POLICY "inventory_locations_manage" ON public.inventory_locations
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_locations TO authenticated;

-- ─── 2. Seed one default location per branch ───
-- Phase 1 keeps behavior unchanged, so each branch gets exactly one
-- default location. Later phases can add warehouse + kitchen split.

INSERT INTO public.inventory_locations (
  tenant_id,
  branch_id,
  code,
  name,
  location_kind,
  is_active,
  is_default_receive,
  is_default_issue,
  is_default_consumption,
  sort_order
)
SELECT
  b.tenant_id,
  b.id,
  CASE
    WHEN b.branch_kind = 'branch' THEN 'main_storage'
    ELSE 'main_warehouse'
  END AS code,
  CASE
    WHEN b.branch_kind = 'tenant' THEN 'Kho tong'
    WHEN b.branch_kind = 'branch' THEN 'Kho bep trung tam'
    ELSE 'Kho chi nhanh'
  END AS name,
  CASE
    WHEN b.branch_kind = 'branch' THEN 'production_storage'
    ELSE 'warehouse'
  END AS location_kind,
  b.is_active,
  true,
  true,
  true,
  0
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_locations il
  WHERE il.tenant_id = b.tenant_id
    AND il.branch_id = b.id
)
ON CONFLICT (code, branch_id, tenant_id) DO NOTHING;
