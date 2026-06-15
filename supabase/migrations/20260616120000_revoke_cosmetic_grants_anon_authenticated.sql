BEGIN;

-- Tidy the bootstrap GRANT ALL over-grant flagged by the Supabase security
-- advisor. anon/authenticated hold TRUNCATE/REFERENCES/TRIGGER on ~100 public
-- tables, but PostgREST only ever exercises SELECT/INSERT/UPDATE/DELETE, so the
-- three are unreachable cosmetic privileges. Strip them on existing tables AND
-- from default privileges: baseline grants ALL on TABLES to anon/authenticated
-- (ALTER DEFAULT PRIVILEGES FOR ROLE postgres), so without the default-privilege
-- edit every freshly created table would re-acquire the over-grant and the
-- advisor would re-flag it. REVOKE is a no-op when the privilege is absent, so
-- this migration is safe to re-run.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

DO $$
DECLARE
  v_residue int;
BEGIN
  SELECT count(*) INTO v_residue
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');

  IF v_residue <> 0 THEN
    RAISE EXCEPTION 'cosmetic-grant revoke incomplete: % residual grant(s) remain', v_residue;
  END IF;
END $$;

COMMIT;
