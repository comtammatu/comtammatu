-- Harden SECURITY DEFINER helpers that lacked an explicit browser-role revoke.
-- Trigger/maintenance functions must not be executable via PostgREST defaults.

REVOKE ALL ON FUNCTION public.close_branch_day(bigint, date, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_branch_day(bigint, date, jsonb, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_notify_transfer_in_transit()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_transfer_in_transit()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_update_stock_on_movement()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_update_stock_on_movement()
  TO service_role;

REVOKE ALL ON FUNCTION public.enforce_branch_stock_availability()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_branch_stock_availability()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_revoke_network_gate_bypass_on_pos_session_close()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_revoke_network_gate_bypass_on_pos_session_close()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_notify_grn_created()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_grn_created()
  TO service_role;

REVOKE ALL ON FUNCTION public.stock_issue_items_set_total_cost()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_issue_items_set_total_cost()
  TO postgres, service_role;
