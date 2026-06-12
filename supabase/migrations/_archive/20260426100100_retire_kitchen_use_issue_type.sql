-- =============================================================
-- Retire kitchen_use from stock_issues.issue_type enum
-- =============================================================
-- Team decision (2026-04-25):
--
--   D2 compressed: "kitchen_use" is replaced by intra-branch
--   stock_transfer (inventory_locations: warehouse -> kitchen_line) after
--   Phase 1 per-location split. With no production data, we collapse the
--   T+2m timeline into a single cutover on 2026-04-25.
--
-- Prior state:
--   - 20260416070000_stock_issues.sql added the original CHECK with
--     kitchen_use included.
--   - 20260425000000_stock_levels_per_location.sql added trigger
--     reject_stock_issue_kitchen_use that blocks new inserts.
--
-- This migration:
--   1. Deletes any residual kitchen_use rows (test data only).
--   2. Drops the guard trigger + function (redundant with the new CHECK).
--   3. Swaps the CHECK constraint so 'kitchen_use' is no longer a legal
--      value for stock_issues.issue_type.
-- =============================================================

-- 1. Best-effort cleanup (test environment only, no production data).
DELETE FROM public.stock_issues WHERE issue_type = 'kitchen_use';

-- 2. Drop defense-in-depth trigger (CHECK below is sufficient).
DROP TRIGGER IF EXISTS trg_stock_issue_reject_kitchen_use ON public.stock_issues;
DROP FUNCTION IF EXISTS public.reject_stock_issue_kitchen_use();

-- 3. Swap CHECK constraint to exclude kitchen_use.
ALTER TABLE public.stock_issues
  DROP CONSTRAINT IF EXISTS stock_issues_issue_type_check;

ALTER TABLE public.stock_issues
  ADD CONSTRAINT stock_issues_issue_type_check
  CHECK (issue_type IN ('consumption', 'writeoff', 'other'));

COMMENT ON COLUMN public.stock_issues.issue_type IS
  'Type of internal stock issue voucher: consumption (Tiêu hao at branch / '
  'Hao hụt kho at branch/branch — label derived via movement_subtype), writeoff '
  '(hủy hỏng), other (khác). kitchen_use retired 2026-04-25 — use intra-branch '
  'stock_transfer (from_location=warehouse, to_location=kitchen_line) instead.';
