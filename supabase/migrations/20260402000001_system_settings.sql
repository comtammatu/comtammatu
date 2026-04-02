-- Sprint 1 S2: system_settings table (tenant-scoped key/value config)

CREATE TABLE public.system_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(key, tenant_id)
);

CREATE INDEX idx_system_settings_tenant ON public.system_settings(tenant_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.system_settings
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_write" ON public.system_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "manager_update" ON public.system_settings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "manager_delete" ON public.system_settings
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_settings TO authenticated;

-- RPC: atomic set_headquarters (avoids TOCTOU race from two separate UPDATEs)
CREATE OR REPLACE FUNCTION public.set_headquarters(p_branch_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Unset current HQ and set new one in a single transaction
  UPDATE public.branches
    SET is_headquarters = (id = p_branch_id)
    WHERE tenant_id = public.auth_tenant_id()
      AND (is_headquarters = true OR id = p_branch_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_headquarters(BIGINT) TO authenticated;

-- Seed default settings (tenant_id = 1 from seed migration)
INSERT INTO public.system_settings (tenant_id, key, value, description) VALUES
  (1, 'vat_rate', '8', 'Thuế GTGT (%)'),
  (1, 'service_charge', '5', 'Phí dịch vụ (%)'),
  (1, 'currency', 'VND', 'Đơn vị tiền tệ'),
  (1, 'store_phone', '', 'Số điện thoại cửa hàng'),
  (1, 'store_email', '', 'Email cửa hàng');
