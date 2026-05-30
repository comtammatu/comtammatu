CREATE TABLE public.feedback_settings (
  tenant_id               BIGINT PRIMARY KEY,
  ai_monthly_budget_usd   NUMERIC(8,2) NOT NULL DEFAULT 50.00,
  push_mode               TEXT NOT NULL DEFAULT 'threshold' CHECK (push_mode IN ('threshold','all','none')),
  threshold_rating        SMALLINT NOT NULL DEFAULT 3 CHECK (threshold_rating BETWEEN 1 AND 5),
  daily_report_hour_local SMALLINT NOT NULL DEFAULT 2 CHECK (daily_report_hour_local BETWEEN 0 AND 23),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by              BIGINT NULL
);

ALTER TABLE public.feedback_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_settings FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.feedback_settings TO authenticated;

CREATE POLICY fs_select ON public.feedback_settings
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::bigint);

CREATE POLICY fs_upsert ON public.feedback_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::bigint
    AND has_permission(NULL::bigint, 'feedback:manage_settings')
  );

CREATE POLICY fs_update ON public.feedback_settings
  FOR UPDATE TO authenticated
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::bigint)
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::bigint
    AND has_permission(NULL::bigint, 'feedback:manage_settings')
  );

COMMENT ON TABLE public.feedback_settings IS
  'Tenant-scoped feedback module settings. Owner-only writes. Defaults are sensible for cold start.';
