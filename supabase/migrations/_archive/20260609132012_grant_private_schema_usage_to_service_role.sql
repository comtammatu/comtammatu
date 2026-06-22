-- Service-role RPCs call private helper functions such as
-- private.staff_role_from_position_code(). EXECUTE on the helper is not enough:
-- PostgreSQL also requires USAGE on the containing schema.

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_role_from_position_code(text)
  TO service_role;
