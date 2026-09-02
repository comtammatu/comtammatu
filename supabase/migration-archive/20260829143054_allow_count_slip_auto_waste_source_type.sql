-- Migration: allow_count_slip_auto_waste_source_type
-- Allow count_slip_auto_waste as a valid source_type for stock_issues created
-- during count slip shortage writeoff approvals.

ALTER TABLE public.stock_issues
  DROP CONSTRAINT IF EXISTS stock_issues_source_type_check;

ALTER TABLE public.stock_issues
  ADD CONSTRAINT stock_issues_source_type_check CHECK (
    source_type = ANY (ARRAY[
      'manual',
      'pos_return',
      'kds_cancel_before_cook',
      'kds_cancel_mid_cook',
      'kds_cancel_after_cook',
      'hrm_consumption',
      'count_slip_auto_waste'
    ]::text[])
  );

COMMENT ON COLUMN public.stock_issues.source_type IS
  'Source system creating the stock issue: manual = UI entry, pos_return = POS return, kds_cancel_* = KDS cancellation, hrm_consumption = daily kitchen consumption, count_slip_auto_waste = inventory count shortage auto writeoff.';
