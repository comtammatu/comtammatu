-- Catalog + helper math for the same-Vietnam-day HĐĐT buyer window.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_helper oid := to_regprocedure(
    'private.tax_invoice_buyer_deadline(timestamptz)'
  );
  v_morning timestamptz;
  v_evening timestamptz;
  v_late timestamptz;
BEGIN
  IF v_helper IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc function_row
      WHERE function_row.oid = v_helper
        AND 'search_path=""' = ANY(function_row.proconfig)
    )
    OR has_function_privilege('anon', v_helper, 'EXECUTE')
    OR has_function_privilege('authenticated', v_helper, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'tax_invoice_buyer_deadline_acl_invalid';
  END IF;

  -- 10:00 VN on 17/08/2026 = 03:00 UTC; +2h stays 12:00 VN.
  v_morning := private.tax_invoice_buyer_deadline(
    timestamptz '2026-08-17 03:00:00+00'
  );
  IF v_morning IS DISTINCT FROM timestamptz '2026-08-17 05:00:00+00' THEN
    RAISE EXCEPTION 'tax_invoice_buyer_deadline_morning_invalid: %', v_morning;
  END IF;

  -- 22:10 VN; +2h would be 00:10 next VN day; cap to 23:55 VN = 16:55 UTC.
  v_evening := private.tax_invoice_buyer_deadline(
    timestamptz '2026-08-17 15:10:00+00'
  );
  IF v_evening IS DISTINCT FROM timestamptz '2026-08-17 16:55:00+00' THEN
    RAISE EXCEPTION 'tax_invoice_buyer_deadline_evening_invalid: %', v_evening;
  END IF;

  -- 23:58 VN; ceiling 23:55 VN is already past, so eligibility is immediate.
  v_late := private.tax_invoice_buyer_deadline(
    timestamptz '2026-08-17 16:58:00+00'
  );
  IF v_late IS DISTINCT FROM timestamptz '2026-08-17 16:55:00+00' THEN
    RAISE EXCEPTION 'tax_invoice_buyer_deadline_late_invalid: %', v_late;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.tax_invoice_issue_jobs'::regclass
      AND tgname = 'trg_cap_tax_invoice_job_available_at'
      AND tgenabled = 'O'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.tax_invoice_buyer_requests'::regclass
      AND tgname = 'trg_cap_tax_invoice_buyer_request_expires_at'
      AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'tax_invoice_buyer_deadline_trigger_missing';
  END IF;
END
$$;

ROLLBACK;
