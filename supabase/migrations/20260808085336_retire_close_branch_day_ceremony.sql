-- ADR 0024: retire operator day-close ceremony.
-- close_branch_day no longer persists is_closed; callers receive a stable sentinel.
-- Historical branch_day_state rows are retained for audit. get_branch_day_summary stays.

CREATE OR REPLACE FUNCTION public.close_branch_day(
  p_branch_id bigint,
  p_business_date date,
  p_cash_recon jsonb DEFAULT '[]'::jsonb,
  p_note text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'branch_day_close_retired'
    USING ERRCODE = 'P0001',
          HINT = 'ADR 0024: /close-day is Daily Summary only; do not call close_branch_day';
END;
$$;

COMMENT ON FUNCTION public.close_branch_day(bigint, date, jsonb, text) IS
  'Retired (ADR 0024). Raises branch_day_close_retired. Use get_branch_day_summary for Daily Summary.';
