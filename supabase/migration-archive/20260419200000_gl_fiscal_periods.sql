-- =============================================================
-- GL Phase 3.1 — fiscal_periods table
-- Tracks open/closing/closed status per month.
-- Blocks backdated GL postings to closed periods.
-- =============================================================

-- ─── 1. fiscal_periods table ───

CREATE TABLE public.fiscal_periods (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month    INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year     INT NOT NULL CHECK (period_year >= 2020),
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closing', 'closed')),
  closed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at       TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(period_month, period_year, tenant_id)
);

CREATE INDEX idx_fp_tenant ON public.fiscal_periods(tenant_id);
CREATE INDEX idx_fp_status ON public.fiscal_periods(status);

ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fp_select" ON public.fiscal_periods
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
  );

CREATE POLICY "fp_manage" ON public.fiscal_periods
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_periods TO authenticated;

CREATE TRIGGER trg_fp_updated_at
  BEFORE UPDATE ON public.fiscal_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
