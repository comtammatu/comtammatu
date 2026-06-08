-- =============================================================
-- M2-S2: POS Terminals & Cashier Sessions
-- Tables: pos_terminals, pos_sessions
-- Alter: orders (add pos_session_id)
-- =============================================================

-- ========================
-- 1. pos_terminals
-- ========================
CREATE TABLE public.pos_terminals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  device_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name, tenant_id)
);

CREATE INDEX idx_pos_terminals_tenant ON public.pos_terminals(tenant_id);
CREATE INDEX idx_pos_terminals_branch ON public.pos_terminals(branch_id);

CREATE TRIGGER trg_pos_terminals_updated_at
  BEFORE UPDATE ON public.pos_terminals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.pos_terminals
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.pos_terminals
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "manager_update" ON public.pos_terminals
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

CREATE POLICY "manager_delete" ON public.pos_terminals
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_terminals TO authenticated;

-- ========================
-- 2. pos_sessions
-- ========================
CREATE TABLE public.pos_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  terminal_id BIGINT NOT NULL REFERENCES public.pos_terminals(id) ON DELETE RESTRICT,
  opened_by UUID NOT NULL REFERENCES public.profiles(id),
  closed_by UUID REFERENCES public.profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(15,2),
  expected_cash NUMERIC(15,2),
  cash_difference NUMERIC(15,2),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_sessions_tenant ON public.pos_sessions(tenant_id);
CREATE INDEX idx_pos_sessions_branch ON public.pos_sessions(branch_id);
CREATE INDEX idx_pos_sessions_terminal ON public.pos_sessions(terminal_id);
CREATE INDEX idx_pos_sessions_opened_by ON public.pos_sessions(opened_by);

-- Enforce max one open session per terminal
CREATE UNIQUE INDEX idx_pos_sessions_one_open
  ON public.pos_sessions(terminal_id) WHERE status = 'open';

CREATE TRIGGER trg_pos_sessions_updated_at
  BEFORE UPDATE ON public.pos_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.pos_sessions
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "branch_insert" ON public.pos_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "branch_update" ON public.pos_sessions
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

-- No DELETE — pos_sessions are business records
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_sessions TO authenticated;

-- ========================
-- 3. ALTER orders — link to pos_session
-- ========================
ALTER TABLE public.orders
  ADD COLUMN pos_session_id BIGINT REFERENCES public.pos_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_pos_session ON public.orders(pos_session_id);
