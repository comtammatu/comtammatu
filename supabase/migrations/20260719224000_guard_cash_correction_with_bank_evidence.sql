-- A payment linked to a signed bank transaction cannot be reclassified as
-- cash until the bank evidence is explicitly removed in reconciliation.

CREATE OR REPLACE FUNCTION private.guard_payment_method_bank_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.method IS DISTINCT FROM NEW.method
     AND NEW.method = 'cash'
     AND (
       EXISTS (
         SELECT 1
         FROM public.bank_transaction_reconciliation_matches match
         WHERE match.tenant_id = NEW.tenant_id
           AND match.payment_id = NEW.id
       )
       OR EXISTS (
         SELECT 1
         FROM public.webhook_events event
         WHERE event.tenant_id = NEW.tenant_id
           AND event.payment_id = NEW.id
       )
     ) THEN
    RAISE EXCEPTION 'payment_has_bank_evidence' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_payment_method_bank_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_payment_method_bank_evidence
  ON public.payments;

CREATE TRIGGER guard_payment_method_bank_evidence
BEFORE UPDATE OF method ON public.payments
FOR EACH ROW
EXECUTE FUNCTION private.guard_payment_method_bank_evidence();

COMMENT ON FUNCTION private.guard_payment_method_bank_evidence() IS
  'Blocks reclassifying a bank-evidenced payment as cash until reconciliation evidence is explicitly removed.';
