-- =============================================================
-- M2-S5: Printer Configurations
-- Table: printer_configs
-- =============================================================

CREATE TABLE public.printer_configs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receipt', 'kitchen')),
  connection_type TEXT NOT NULL CHECK (connection_type IN ('usb', 'network', 'bluetooth')),
  ip_address TEXT,
  port INT,
  paper_width INT NOT NULL DEFAULT 80 CHECK (paper_width IN (58, 80)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name, tenant_id)
);

CREATE INDEX idx_printer_configs_tenant ON public.printer_configs(tenant_id);
CREATE INDEX idx_printer_configs_branch ON public.printer_configs(branch_id);

CREATE TRIGGER trg_printer_configs_updated_at
  BEFORE UPDATE ON public.printer_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.printer_configs
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.printer_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "manager_update" ON public.printer_configs
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "manager_delete" ON public.printer_configs
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.printer_configs TO authenticated;
