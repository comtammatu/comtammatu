-- =============================================================
-- M6 Finance Phase 0 — Extend posting_rules.transaction_type
-- =============================================================
-- Add 'expense' (OPEX entry), 'depreciation' (FA monthly cron),
-- 'equity' (owner draws / capital contribution) to the CHECK
-- constraint so Phase 1+ rules can be seeded later.
--
-- Rule: POSTING-RULES-CHECK-NOT-VALID — use NOT VALID + VALIDATE
-- two-step pattern to avoid ACCESS EXCLUSIVE lock during full
-- table revalidation. NOT VALID briefly takes ACCESS EXCLUSIVE
-- for the catalog change; VALIDATE takes SHARE UPDATE EXCLUSIVE
-- which permits concurrent reads/writes.
-- =============================================================

-- Drop old CHECK constraint
ALTER TABLE public.posting_rules
  DROP CONSTRAINT IF EXISTS posting_rules_transaction_type_check;

-- Add widened CHECK as NOT VALID (no full-table scan)
ALTER TABLE public.posting_rules
  ADD CONSTRAINT posting_rules_transaction_type_check
    CHECK (transaction_type IN (
      'sale',
      'purchase',
      'payroll',
      'transfer',
      'production',
      'expense',
      'depreciation',
      'equity'
    ))
    NOT VALID;

-- Validate existing rows (allows concurrent reads/writes)
ALTER TABLE public.posting_rules
  VALIDATE CONSTRAINT posting_rules_transaction_type_check;
