DROP POLICY IF EXISTS contracts_write ON public.employment_contracts;

CREATE POLICY contracts_write
  ON public.employment_contracts
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('hr:manage_employee')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('hr:manage_employee')
  );

DROP TRIGGER IF EXISTS trg_contract_sync_insurance ON public.employment_contracts;

CREATE TRIGGER trg_contract_sync_insurance
  AFTER INSERT OR UPDATE OF status, gross_salary, insurance_base_salary, start_date, end_date
  ON public.employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_insurance_on_contract();

WITH latest_active_contract AS (
  SELECT DISTINCT ON (ec.tenant_id, ec.employee_id)
    ec.tenant_id,
    ec.employee_id,
    ec.gross_salary,
    ec.insurance_base_salary
  FROM public.employment_contracts ec
  WHERE ec.status = 'active'
  ORDER BY ec.tenant_id, ec.employee_id, ec.start_date DESC, ec.id DESC
)
UPDATE public.employees e
SET
  base_salary = latest_active_contract.gross_salary,
  insurance_base_salary = latest_active_contract.insurance_base_salary,
  updated_at = now()
FROM latest_active_contract
WHERE e.tenant_id = latest_active_contract.tenant_id
  AND e.id = latest_active_contract.employee_id;
