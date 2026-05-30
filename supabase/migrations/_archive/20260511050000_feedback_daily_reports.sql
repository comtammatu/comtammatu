CREATE TABLE public.feedback_daily_reports (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  branch_id       BIGINT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  report_date     DATE NOT NULL,
  feedback_count  INTEGER NOT NULL DEFAULT 0,
  avg_rating      NUMERIC(3,2) NULL,
  report_md       TEXT NOT NULL,
  metrics_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_model       TEXT NOT NULL,
  llm_cost_usd    NUMERIC(8,4) NOT NULL DEFAULT 0,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- branch_id NULL = tenant-wide rollup
CREATE UNIQUE INDEX uidx_fdr_tenant_branch_date
  ON public.feedback_daily_reports (tenant_id, COALESCE(branch_id, 0), report_date);

CREATE INDEX idx_fdr_tenant_date_desc
  ON public.feedback_daily_reports (tenant_id, report_date DESC);

ALTER TABLE public.feedback_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_daily_reports FORCE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.feedback_daily_reports FROM authenticated;
GRANT SELECT ON public.feedback_daily_reports TO authenticated;

CREATE POLICY fdr_select ON public.feedback_daily_reports
  FOR SELECT TO authenticated
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::bigint
    AND has_permission(branch_id, 'feedback:view_report')
  );

COMMENT ON TABLE public.feedback_daily_reports IS
  'AI-generated daily feedback summary. INSERT only via service_role from cron worker. branch_id NULL = tenant rollup.';
