BEGIN;

REVOKE ALL ON FUNCTION public.claim_tax_invoice_issue_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tax_invoice_issue_jobs(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.finish_tax_invoice_issue_job_as_system(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_tax_invoice_issue_job_as_system(bigint, text, text) TO service_role;

COMMIT;
