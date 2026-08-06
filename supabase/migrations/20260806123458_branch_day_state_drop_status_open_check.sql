-- Drop the redundant `(status = 'open') IS FALSE` check on branch_day_state.
-- The column already carries `CHECK (status IN ('open','closed'))` and the
-- partial unique index `... WHERE status = 'closed'` enforces one closed row
-- per tenant/branch/business_date. The extra check only forbade status='open'
-- — which the close_branch_day RPC never writes — while contradicting the
-- "kept for future open-state expansion" comment and blocking that expansion.
-- The status enum + partial unique index remain the real guards.

ALTER TABLE public.branch_day_state
  DROP CONSTRAINT IF EXISTS branch_day_state_status_open_no_close;
