-- Harden grants for the new ADR 0026 allowance RPC.
-- CREATE FUNCTION defaults EXECUTE to PUBLIC; revoke that and keep only
-- authenticated + service_role (matches set_branch_menu_daily_limit).

REVOKE ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  bigint,
  bigint,
  integer
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  bigint,
  bigint,
  integer
) FROM anon;

GRANT ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  bigint,
  bigint,
  integer
) TO authenticated;

GRANT ALL ON FUNCTION public.set_branch_menu_stock_allowance(
  bigint,
  bigint,
  integer
) TO service_role;
