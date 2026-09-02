-- Branch-scoped settings key/value store (runtime overrides for TTS and branch configs).

CREATE TABLE public.branch_settings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches (id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_settings_branch_key_uniq UNIQUE (branch_id, key)
);

CREATE INDEX idx_branch_settings_tenant_branch ON public.branch_settings (tenant_id, branch_id);

CREATE TRIGGER trg_branch_settings_updated_at
  BEFORE UPDATE ON public.branch_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.branch_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_settings_select" ON public.branch_settings
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'settings:branch')
      OR public.has_permission(branch_id, 'pos:use')
      OR public.has_permission(branch_id, 'kds:use')
      OR public.has_permission_any('settings:tenant')
    )
  );

CREATE POLICY "branch_settings_write" ON public.branch_settings
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'settings:branch')
      OR public.has_permission_any('settings:tenant')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'settings:branch')
      OR public.has_permission_any('settings:tenant')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_settings TO authenticated;
