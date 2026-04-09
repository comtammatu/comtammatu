-- M7.S3: Employment Contracts + Insurance Base Sync
-- Depends on: employees, tenants, profiles

-- ─── 0. Add insurance_base_salary to employees ───
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS insurance_base_salary NUMERIC(15,2) NOT NULL DEFAULT 0;

-- ─── 1. employment_contracts ───

CREATE TABLE public.employment_contracts (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id               BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id             BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  contract_type           TEXT NOT NULL
    CHECK (contract_type IN ('indefinite', 'fixed_term', 'seasonal', 'probation')),
  contract_number         TEXT NOT NULL,
  signed_date             DATE NOT NULL,
  start_date              DATE NOT NULL,
  end_date                DATE,                    -- NULL if indefinite
  probation_end_date      DATE,

  gross_salary            NUMERIC(15,2) NOT NULL,
  insurance_base_salary   NUMERIC(15,2) NOT NULL,
  position                TEXT NOT NULL,
  work_location           TEXT,                    -- Branch name

  -- Contract sequence (warn when 3rd fixed_term)
  contract_sequence       INT NOT NULL DEFAULT 1,

  -- Document
  document_url            TEXT,

  -- Status
  status                  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'terminated')),
  terminated_at           DATE,
  termination_notice_date DATE,
  termination_reason      TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(contract_number, tenant_id)
);

CREATE INDEX idx_contracts_employee ON public.employment_contracts(employee_id);
CREATE INDEX idx_contracts_tenant ON public.employment_contracts(tenant_id);
CREATE INDEX idx_contracts_status ON public.employment_contracts(status);

ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_select" ON public.employment_contracts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

CREATE POLICY "contracts_manage" ON public.employment_contracts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employment_contracts TO authenticated;

-- updated_at trigger
CREATE TRIGGER trg_employment_contracts_updated_at
  BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ─── 2. RPC: sync_insurance_base ───
-- Syncs employees.insurance_base_salary from latest active contract

CREATE OR REPLACE FUNCTION public.sync_insurance_base(p_employee_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insurance_base NUMERIC(15,2);
  v_gross NUMERIC(15,2);
BEGIN
  SELECT ec.insurance_base_salary, ec.gross_salary
  INTO v_insurance_base, v_gross
  FROM public.employment_contracts ec
  WHERE ec.employee_id = p_employee_id
    AND ec.status = 'active'
  ORDER BY ec.start_date DESC
  LIMIT 1;

  IF v_insurance_base IS NOT NULL THEN
    UPDATE public.employees
    SET
      insurance_base_salary = v_insurance_base,
      base_salary = v_gross,
      updated_at = now()
    WHERE id = p_employee_id;
  END IF;
END;
$$;


-- ─── 3. Trigger: auto-sync when contract becomes active ───

CREATE OR REPLACE FUNCTION public.trg_sync_insurance_on_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM public.sync_insurance_base(NEW.employee_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contract_sync_insurance
  AFTER INSERT OR UPDATE OF status ON public.employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_insurance_on_contract();
