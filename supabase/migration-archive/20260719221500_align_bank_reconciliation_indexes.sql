DROP INDEX public.bank_transaction_reconciliation_matches_transaction_idx;
DROP INDEX public.bank_transaction_reconciliation_matches_payment_key;
DROP INDEX public.bank_transaction_reconciliation_matches_expense_key;
DROP INDEX public.bank_transaction_reconciliation_matches_supplier_key;
DROP INDEX public.bank_transaction_reconciliation_matches_refund_key;

CREATE INDEX bank_transaction_reconciliation_matches_transaction_idx
  ON public.bank_transaction_reconciliation_matches (
    bank_transaction_id,
    tenant_id
  );

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_payment_key
  ON public.bank_transaction_reconciliation_matches (payment_id, tenant_id)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_expense_key
  ON public.bank_transaction_reconciliation_matches (expense_id, tenant_id)
  WHERE expense_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_supplier_key
  ON public.bank_transaction_reconciliation_matches (
    supplier_payment_id,
    tenant_id
  )
  WHERE supplier_payment_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_refund_key
  ON public.bank_transaction_reconciliation_matches (refund_id, tenant_id)
  WHERE refund_id IS NOT NULL;

CREATE INDEX bank_transaction_reconciliation_matches_created_by_idx
  ON public.bank_transaction_reconciliation_matches (created_by)
  WHERE created_by IS NOT NULL;
