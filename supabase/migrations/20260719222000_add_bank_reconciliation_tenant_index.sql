CREATE INDEX IF NOT EXISTS bank_transaction_reconciliation_matches_tenant_idx
  ON public.bank_transaction_reconciliation_matches (tenant_id);
