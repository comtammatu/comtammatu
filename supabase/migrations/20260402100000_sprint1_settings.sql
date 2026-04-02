-- Sprint 1: system_settings table
-- Stores tenant-level configuration (currency, timezone, receipt format, etc.)

CREATE TABLE public.system_settings (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (key, tenant_id)
);

-- Indexes
CREATE INDEX idx_system_settings_tenant ON public.system_settings(tenant_id);

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.system_settings
  FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "Managers can manage settings" ON public.system_settings
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager')
  );

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
