BEGIN;

REVOKE ALL ON FUNCTION private.sync_tax_invoice_issue_job_for_payment(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_tax_invoice_issue_job_for_payment(bigint)
  TO service_role;

COMMIT;
