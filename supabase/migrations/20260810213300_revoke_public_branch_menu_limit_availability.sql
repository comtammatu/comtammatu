-- Corrective ACL: 20260810011333_menu_item_stock_allowance.sql GRANTed
-- branch_menu_limit_availability to service_role but omitted REVOKE FROM PUBLIC,
-- leaving browser roles able to EXECUTE via the default PUBLIC grant.

REVOKE ALL ON FUNCTION public.branch_menu_limit_availability(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_limit_date date,
  p_stock_gate_enabled boolean,
  p_exclude_hold_tokens uuid[]
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.branch_menu_limit_availability(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_limit_date date,
  p_stock_gate_enabled boolean,
  p_exclude_hold_tokens uuid[]
) FROM PUBLIC, anon, authenticated;

GRANT ALL ON FUNCTION public.branch_menu_limit_availability(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_limit_date date,
  p_stock_gate_enabled boolean,
  p_exclude_hold_tokens uuid[]
) TO service_role;
