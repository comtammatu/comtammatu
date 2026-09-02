-- Shared enforce_cash_sales_branch is attached to expenses and
-- supplier_payments. SQL boolean evaluation does not short-circuit, so
-- NEW.category (expenses-only) raises 42703 on supplier_payments inserts
-- from record_supplier_payment_allocated. Nest table guards so each
-- NEW.<column> expression only runs for the matching table.
-- Same pattern as 20260820025641 (fund entries split off shared NEW fields).

CREATE OR REPLACE FUNCTION private.enforce_cash_sales_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    IF NEW.payment_method = 'cash'
      OR NEW.category = 'bank_deposit'
    THEN
      PERFORM private.assert_sales_branch(NEW.tenant_id, NEW.branch_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
    IF NEW.payment_method = 'cash' THEN
      PERFORM private.assert_sales_branch(NEW.tenant_id, NEW.branch_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.enforce_cash_sales_branch()
  FROM PUBLIC, anon, authenticated, service_role;
