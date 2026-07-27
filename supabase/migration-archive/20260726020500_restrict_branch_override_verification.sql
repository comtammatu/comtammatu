BEGIN;

DROP FUNCTION IF EXISTS public.verify_branch_override_code(BIGINT, TEXT);

REVOKE ALL ON TABLE public.branch_override_codes
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.branch_override_attempts
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.branch_override_attempts_id_seq
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.branch_override_codes TO service_role;
GRANT ALL ON TABLE public.branch_override_attempts TO service_role;
GRANT ALL ON SEQUENCE public.branch_override_attempts_id_seq TO service_role;

COMMIT;
