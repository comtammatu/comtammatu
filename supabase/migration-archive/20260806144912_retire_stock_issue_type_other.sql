-- Retire stock_issues.issue_type = 'other'. Product contract allows only
-- consumption (phiếu tiêu hao → food cost) and writeoff (hao hụt / HH via waste).

UPDATE public.stock_issues
SET issue_type = 'writeoff',
    updated_at = pg_catalog.now()
WHERE issue_type = 'other';

ALTER TABLE public.stock_issues
  DROP CONSTRAINT IF EXISTS stock_issues_issue_type_check;

ALTER TABLE public.stock_issues
  ADD CONSTRAINT stock_issues_issue_type_check
  CHECK (issue_type = ANY (ARRAY['consumption'::text, 'writeoff'::text]));

COMMENT ON COLUMN public.stock_issues.issue_type IS
  'Internal stock issue voucher type: consumption (food cost) or writeoff (waste).';
