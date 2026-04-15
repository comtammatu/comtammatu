-- =============================================================
-- GL Auto-Posting: Phase 1.3 — Implicit subledger FK columns
-- Links source documents to their auto-posted journal entries.
-- Also expands reference_type CHECK for transfer/production.
-- =============================================================

-- ─── 1. Expand reference_type CHECK on journal_entries ───

-- Drop existing CHECK and recreate with expanded values
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN ('sale', 'purchase', 'payroll', 'manual', 'adjustment', 'transfer', 'production'));


-- ─── 2. Add journal_entry_id FK to source document tables ───

-- payments (POS sale → revenue + COGS journal)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT
  REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_journal
  ON public.payments(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- goods_received_notes (GRN → inventory/AP journal)
ALTER TABLE public.goods_received_notes
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT
  REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_grn_journal
  ON public.goods_received_notes(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- supplier_invoices (supplier payment → AP/cash journal)
ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT
  REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_si_journal
  ON public.supplier_invoices(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- payroll_periods (payroll → salary expense/liability journal)
ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT
  REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pp_journal
  ON public.payroll_periods(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- stock_transfers (inter-branch → inventory reclassification journal)
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT
  REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_st_journal
  ON public.stock_transfers(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- production_orders (production → raw consume + finished output journal)
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT
  REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_orders_journal
  ON public.production_orders(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;
