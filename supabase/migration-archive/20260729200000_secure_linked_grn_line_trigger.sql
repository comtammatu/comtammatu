BEGIN;

ALTER FUNCTION private.enforce_linked_grn_line_immutability()
  SECURITY DEFINER;

REVOKE ALL ON FUNCTION private.enforce_linked_grn_line_immutability()
  FROM PUBLIC;

COMMIT;
